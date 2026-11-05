-- Stage 1: Supabase Postgres. Run ONCE in SQL Editor as postgres.
-- New, isolated objects only; no Nekopon data is migrated or modified.
begin;
create schema shared_chat_private;
revoke all on schema shared_chat_private from public, anon, authenticated;
create table shared_chat_private.settings (id boolean primary key default true check(id), enabled boolean not null default false);
insert into shared_chat_private.settings(id,enabled) values(true,false);
create table shared_chat_private.creators (user_id uuid primary key references auth.users(id));
create table shared_chat_private.rooms (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 1 and 40),
 owner_id uuid not null references auth.users(id), last_seq bigint not null default 0,
 created_at timestamptz not null default now()
);
create table shared_chat_private.members (
 room_id uuid references shared_chat_private.rooms(id) on delete cascade,
 user_id uuid references auth.users(id), name text not null check(char_length(name) between 1 and 24),
 status text not null check(status in ('pending','active','removed')), last_read_seq bigint not null default 0,
 joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create index on shared_chat_private.members(user_id,status);
create table shared_chat_private.invites (
 token_hash text primary key, room_id uuid not null references shared_chat_private.rooms(id) on delete cascade,
 expires_at timestamptz not null, revoked boolean not null default false, uses integer not null default 0,
 max_uses integer not null default 20
);
create table shared_chat_private.messages (
 room_id uuid references shared_chat_private.rooms(id) on delete cascade, seq bigint not null,
 user_id uuid not null references auth.users(id), name text not null, text text not null check(char_length(text) between 1 and 2000),
 client_id uuid not null, sent_at timestamptz not null default clock_timestamp(), hidden boolean not null default false,
 primary key(room_id,seq), unique(room_id,user_id,client_id)
);
create table shared_chat_private.audit (
 id bigint generated always as identity primary key, room_id uuid references shared_chat_private.rooms(id) on delete cascade,
 actor_id uuid not null references auth.users(id), action text not null, target text, at timestamptz not null default now()
);
create table shared_chat_private.limits (
 user_id uuid references auth.users(id), action text, window_at timestamptz, count integer not null,
 primary key(user_id,action,window_at)
);
-- No direct table access. All operations pass through the narrow RPC below.
alter table shared_chat_private.settings enable row level security;
alter table shared_chat_private.creators enable row level security;
alter table shared_chat_private.rooms enable row level security;
alter table shared_chat_private.members enable row level security;
alter table shared_chat_private.invites enable row level security;
alter table shared_chat_private.messages enable row level security;
alter table shared_chat_private.audit enable row level security;
alter table shared_chat_private.limits enable row level security;
revoke all on all tables in schema shared_chat_private from public, anon, authenticated;
revoke all on all sequences in schema shared_chat_private from public, anon, authenticated;

create function public.shared_chat_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); rid uuid; target_uid uuid; token text; title text; nickname text; body text;
 r shared_chat_private.rooms%rowtype; m shared_chat_private.members%rowtype;
 inv shared_chat_private.invites%rowtype; msg shared_chat_private.messages%rowtype;
 n integer; result jsonb; start_seq bigint; req_id uuid; bucket timestamptz;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null and coalesce(u.email,'') <> '' and not coalesce(u.is_anonymous,false)) then
  raise exception using errcode='42501',message='verified_login_required';
 end if;
 if not (select enabled from shared_chat_private.settings where id=true) then raise exception using errcode='42501',message='shared_chat_disabled'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then
  raise exception using errcode='22023',message='invalid_payload';
 end if;
 if p_action is null or p_action not in ('list','create','join','sync','send','read','invite','revoke_invites','approve','remove','hide','leave') then
  raise exception using errcode='22023',message='invalid_action';
 end if;
 -- Database limits also apply to direct RPC callers (not just this API).
 if p_action not in ('list','sync','read') then
  bucket := date_trunc('minute',clock_timestamp());
  insert into shared_chat_private.limits values(uid,p_action,bucket,1)
   on conflict(user_id,action,window_at) do update set count=shared_chat_private.limits.count+1 returning count into n;
  if n>(case when p_action='send' then 20 else 10 end) then
   -- Return rather than throw so this counter is committed.
   return jsonb_build_object('error','rate_limited');
  end if;
 end if;
 begin -- Keep the rate counter outside the operation's exception subtransaction.
 if p_action='list' then
  select coalesce(jsonb_agg(x order by x->>'created_at'),'[]'::jsonb) into result from (
   select jsonb_build_object('id',g.id,'name',g.name,'status',mm.status,'owner',g.owner_id=uid,
    'unread',case when mm.status='active' then (select count(*) from shared_chat_private.messages z where z.room_id=g.id and z.seq>mm.last_read_seq and z.user_id<>uid and not z.hidden) else 0 end,
    'created_at',g.created_at) x
   from shared_chat_private.rooms g join shared_chat_private.members mm on mm.room_id=g.id
   where mm.user_id=uid and mm.status in ('active','pending')
  ) q;
  return jsonb_build_object('rooms',result);
 end if;
 if p_action='create' then
  if not exists(select 1 from shared_chat_private.creators where user_id=uid) then
   raise exception using errcode='42501',message='creator_permission_required';
  end if;
  -- Serialize per creator so concurrent creation cannot bypass the cap.
  perform 1 from shared_chat_private.creators where user_id=uid for update;
  if (select count(*) from shared_chat_private.rooms where owner_id=uid)>=10 then
   raise exception using errcode='22023',message='room_limit';
  end if;
  title:=btrim(p_payload->>'name'); nickname:=btrim(p_payload->>'nickname');
  if title is null or char_length(title) not between 1 and 40 or nickname is null or char_length(nickname) not between 1 and 24 then
   raise exception using errcode='22023',message='invalid_name';
  end if;
  insert into shared_chat_private.rooms(name,owner_id) values(title,uid) returning id into rid;
  insert into shared_chat_private.members(room_id,user_id,name,status) values(rid,uid,nickname,'active');
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'create');
  return jsonb_build_object('room_id',rid);
 end if;
 if p_action='join' then
  token:=p_payload->>'token'; nickname:=btrim(p_payload->>'nickname');
  if token is null or token !~ '^[a-f0-9]{64}$' or nickname is null or char_length(nickname) not between 1 and 24 then
   raise exception using errcode='22023',message='invalid_invite';
  end if;
  select * into inv from shared_chat_private.invites where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
  if not found then raise exception using errcode='22023',message='invalid_invite'; end if;
  rid:=inv.room_id;
 else
  rid:=(p_payload->>'room_id')::uuid;
 end if;
 -- A room row is the serialization point for messages, membership, and revocation.
 select * into r from shared_chat_private.rooms where id=rid for update;
 if not found then raise exception using errcode='42501',message='room_unavailable'; end if;
 select * into m from shared_chat_private.members where room_id=rid and user_id=uid;
 if p_action='join' then
  select * into inv from shared_chat_private.invites where token_hash=inv.token_hash;
  if inv.revoked or inv.expires_at<=clock_timestamp() or inv.uses>=inv.max_uses then
   raise exception using errcode='22023',message='invalid_invite';
  end if;
  if m.status='removed' then raise exception using errcode='42501',message='room_unavailable'; end if;
  if m.status in ('active','pending') then return jsonb_build_object('room_id',rid,'status',m.status); end if;
  if (select count(*) from shared_chat_private.members where room_id=rid and status in ('active','pending'))>=50 then
   raise exception using errcode='22023',message='member_limit';
  end if;
  insert into shared_chat_private.members(room_id,user_id,name,status) values(rid,uid,nickname,'pending');
  update shared_chat_private.invites set uses=uses+1 where token_hash=inv.token_hash;
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'request_join');
  return jsonb_build_object('room_id',rid,'status','pending');
 end if;
 if m.status is distinct from 'active' then raise exception using errcode='42501',message='room_unavailable'; end if;
 if p_action='sync' then
  -- Latest 100 on initial load. before_seq supports backscroll; after_seq supports catch-up.
  if p_payload ? 'before_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden from shared_chat_private.messages
    where room_id=rid and seq<(p_payload->>'before_seq')::bigint order by seq desc limit 100
   ) x;
  elsif p_payload ? 'after_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden from shared_chat_private.messages
    where room_id=rid and seq>greatest(0,(p_payload->>'after_seq')::bigint) order by seq limit 100
   ) x;
  else
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden from shared_chat_private.messages where room_id=rid order by seq desc limit 100
   ) x;
  end if;
  -- Hidden text is never delivered, including to other admins or new sessions.
  select coalesce(jsonb_agg(case when (z->>'hidden')::boolean then z||'{"text":""}'::jsonb else z end order by ord),'[]'::jsonb)
   into result from jsonb_array_elements(result) with ordinality as a(z,ord);
  return jsonb_build_object('room',jsonb_build_object('id',rid,'name',r.name,'owner',r.owner_id=uid,'last_seq',r.last_seq),
   'messages',result,'self_id',uid,'last_read_seq',m.last_read_seq,'server_time',clock_timestamp(),
   'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',mm.user_id,'name',mm.name,'status',mm.status) order by mm.joined_at),'[]'::jsonb)
    from shared_chat_private.members mm where mm.room_id=rid and (mm.status='active' or r.owner_id=uid)));
 end if;
 if p_action='send' then
  req_id:=(p_payload->>'client_id')::uuid; body:=btrim(p_payload->>'text');
  if req_id is null or body is null or char_length(body) not between 1 and 2000 then raise exception using errcode='22023',message='invalid_message'; end if;
  select * into msg from shared_chat_private.messages where room_id=rid and user_id=uid and client_id=req_id;
  if found then return jsonb_build_object('seq',msg.seq); end if;
  update shared_chat_private.rooms set last_seq=last_seq+1 where id=rid returning last_seq into start_seq;
  insert into shared_chat_private.messages(room_id,seq,user_id,name,text,client_id) values(rid,start_seq,uid,m.name,body,req_id);
  return jsonb_build_object('seq',start_seq);
 end if;
 if p_action='read' then
  start_seq:=(p_payload->>'seq')::bigint;
  if start_seq is null or start_seq<0 or start_seq>r.last_seq then raise exception using errcode='22023',message='invalid_cursor'; end if;
  update shared_chat_private.members set last_read_seq=greatest(last_read_seq,start_seq) where room_id=rid and user_id=uid;
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='leave' then
  if r.owner_id=uid then raise exception using errcode='22023',message='owner_cannot_leave'; end if;
  update shared_chat_private.members set status='removed' where room_id=rid and user_id=uid;
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'leave');
  return '{"ok":true}'::jsonb;
 end if;
 if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;
 if p_action='invite' then
  update shared_chat_private.invites set revoked=true where room_id=rid;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into shared_chat_private.invites(token_hash,room_id,expires_at) values(encode(sha256(convert_to(token,'UTF8')),'hex'),rid,clock_timestamp()+interval '7 days');
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'invite');
  return jsonb_build_object('token',token,'expires_in_days',7);
 elsif p_action='revoke_invites' then
  update shared_chat_private.invites set revoked=true where room_id=rid;
 elsif p_action in ('approve','remove') then
  target_uid:=(p_payload->>'user_id')::uuid;
  if target_uid=uid or target_uid=r.owner_id then raise exception using errcode='22023',message='invalid_target'; end if;
  update shared_chat_private.members set status=case when p_action='approve' then 'active' else 'removed' end
   where room_id=rid and user_id=target_uid and ((p_action='approve' and status='pending') or (p_action='remove' and status in ('pending','active')));
  if not found then raise exception using errcode='22023',message='invalid_target'; end if;
 elsif p_action='hide' then
  update shared_chat_private.messages set hidden=true,text='（管理者が削除）' where room_id=rid and seq=(p_payload->>'seq')::bigint;
  if not found then raise exception using errcode='22023',message='invalid_target'; end if;
 end if;
 insert into shared_chat_private.audit(room_id,actor_id,action,target) values(rid,uid,p_action,coalesce(p_payload->>'user_id',p_payload->>'seq'));
 return '{"ok":true}'::jsonb;
 exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
 end;
end $$;
revoke all on function public.shared_chat_rpc(text,jsonb) from public,anon;
grant execute on function public.shared_chat_rpc(text,jsonb) to authenticated;
commit;
