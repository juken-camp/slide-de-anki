-- One transaction; detects existing Phase 1/2. Does not delete records.
begin;
do $installer$
begin
if to_regclass('shared_chat_private.rooms') is null then
execute $stage_one$
-- Stage 1: Supabase Postgres. Run ONCE in SQL Editor as postgres.
-- New, isolated objects only; no Nekopon data is migrated or modified.

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

$stage_one$;
end if;
if not exists(select 1 from information_schema.columns where table_schema='shared_chat_private' and table_name='rooms' and column_name='ai_enabled') then
execute $stage_two$
-- Stage 2: incremental migration. Run ONCE after 001_shared_chat.sql.
-- All AI is OFF by default. No existing rooms or history are removed.

alter table shared_chat_private.rooms
 add column ai_enabled boolean not null default false,
 add column ai_next_at timestamptz,
 add column ai_claim_id uuid,
 add column ai_claim_until timestamptz,
 add column ai_batch_day date,
 add column ai_batches_today integer not null default 0;
alter table shared_chat_private.members
 add column notify_enabled boolean not null default false,
 add column push_subscription jsonb,
 add column last_notified_seq bigint not null default 0;
alter table shared_chat_private.messages
 alter column user_id drop not null,
 add column speaker_id integer,
 add column kind text not null default 'human' check (kind in ('human','ai'));
alter table shared_chat_private.messages add constraint shared_chat_message_identity
 check ((kind='human' and user_id is not null and speaker_id is null)
     or (kind='ai' and user_id is null and speaker_id is not null));
create table shared_chat_private.ai_queue (
 room_id uuid not null references shared_chat_private.rooms(id) on delete cascade,
 job_id uuid not null,
 ordinal integer not null,
 speaker_id integer not null,
 name text not null,
 text text not null,
 due_at timestamptz not null,
 primary key(room_id,job_id,ordinal)
);
create index on shared_chat_private.ai_queue(due_at);
alter table shared_chat_private.ai_queue enable row level security;
revoke all on shared_chat_private.ai_queue from public,anon,authenticated;
-- Keep verified-user access restricted to the original single RPC.
create or replace function public.shared_chat_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
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
 if p_action is null or p_action not in ('list','create','join','sync','send','read','invite','revoke_invites','approve','remove','hide','leave','ai_toggle','subscribe') then
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
    'unread',case when mm.status='active' then (select count(*) from shared_chat_private.messages z where z.room_id=g.id and z.seq>mm.last_read_seq and z.user_id is distinct from uid and not z.hidden) else 0 end,
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
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages
    where room_id=rid and seq<(p_payload->>'before_seq')::bigint order by seq desc limit 100
   ) x;
  elsif p_payload ? 'after_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages
    where room_id=rid and seq>greatest(0,(p_payload->>'after_seq')::bigint) order by seq limit 100
   ) x;
  else
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages where room_id=rid order by seq desc limit 100
   ) x;
  end if;
  -- Hidden text is never delivered, including to other admins or new sessions.
  select coalesce(jsonb_agg(case when (z->>'hidden')::boolean then z||'{"text":""}'::jsonb else z end order by ord),'[]'::jsonb)
   into result from jsonb_array_elements(result) with ordinality as a(z,ord);
  return jsonb_build_object('room',jsonb_build_object('id',rid,'name',r.name,'owner',r.owner_id=uid,'last_seq',r.last_seq,'ai_enabled',r.ai_enabled),
   'messages',result,'self_id',uid,'last_read_seq',m.last_read_seq,'notifications_enabled',m.notify_enabled,'server_time',clock_timestamp(),
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
 if p_action='subscribe' then
  if p_payload->'subscription' = 'null'::jsonb then
   update shared_chat_private.members set push_subscription=null,notify_enabled=false
    where room_id=rid and user_id=uid;
   return '{"ok":true}'::jsonb;
  end if;
  if jsonb_typeof(p_payload->'subscription')<>'object'
    or length(coalesce(p_payload #>> '{subscription,endpoint}','')) not between 20 and 1500
    or coalesce(p_payload #>> '{subscription,endpoint}','') !~ '^https://'
    or length(coalesce(p_payload #>> '{subscription,keys,p256dh}','')) not between 20 and 400
    or length(coalesce(p_payload #>> '{subscription,keys,auth}','')) not between 8 and 100
    or octet_length((p_payload->'subscription')::text)>4000 then
    raise exception using errcode='22023',message='invalid_subscription';
  end if;
  update shared_chat_private.members
   set push_subscription=p_payload->'subscription',notify_enabled=true
    where room_id=rid and user_id=uid;
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='leave' then
  if r.owner_id=uid then raise exception using errcode='22023',message='owner_cannot_leave'; end if;
  update shared_chat_private.members set status='removed' where room_id=rid and user_id=uid;
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'leave');
  return '{"ok":true}'::jsonb;
 end if;
 if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;
 if p_action='ai_toggle' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then
   raise exception using errcode='22023', message='invalid_toggle';
  end if;
  update shared_chat_private.rooms
   set ai_enabled=(p_payload->>'enabled')::boolean,
       ai_next_at=case when (p_payload->>'enabled')::boolean then clock_timestamp()+interval '1 minute' else null end,
       ai_claim_id=null, ai_claim_until=null
   where id=rid;
  if not (p_payload->>'enabled')::boolean then
   delete from shared_chat_private.ai_queue where room_id=rid;
  end if;
  insert into shared_chat_private.audit(room_id,actor_id,action,target)
   values(rid,uid,'ai_toggle',p_payload->>'enabled');
  return jsonb_build_object('ok',true,'ai_enabled',(p_payload->>'enabled')::boolean);
 end if;
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

-- Service-role-only operations. This RPC does not accept end-user JWTs.
-- Limit to 3 batches (=15 scenes) per room per JST calendar day.
create or replace function public.shared_chat_ai_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r shared_chat_private.rooms%rowtype;
 q shared_chat_private.ai_queue%rowtype;
 work_id uuid; rid uuid; raw jsonb; item jsonb; idx integer := 0;
 new_seq bigint; published integer := 0; staged integer := 0;
 today_jst date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
  raise exception using errcode='42501',message='server_only';
 end if;
 if not (select enabled from shared_chat_private.settings where id=true) then
  return jsonb_build_object('disabled',true);
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>125000 then
  raise exception using errcode='22023',message='invalid_payload';
 end if;
 if p_action in ('publish','claim') then
  -- Publish any due messages, IN TRANSACTION, in the same sequence as humans.
  -- Row lock serializes writes and makes multiple cron invocations safe.
  for r in select * from shared_chat_private.rooms
      where ai_enabled and exists(select 1 from shared_chat_private.ai_queue x
                                 where x.room_id=shared_chat_private.rooms.id and x.due_at<=clock_timestamp())
      order by created_at limit 50 for update skip locked loop
    for q in select * from shared_chat_private.ai_queue
        where room_id=r.id and due_at<=clock_timestamp()
        order by due_at,job_id,ordinal limit 70 loop
      update shared_chat_private.rooms set last_seq=last_seq+1
       where id=r.id returning last_seq into new_seq;
      insert into shared_chat_private.messages(room_id,seq,user_id,name,text,client_id,sent_at,speaker_id,kind)
       values(r.id,new_seq,null,q.name,q.text,gen_random_uuid(),clock_timestamp(),q.speaker_id,'ai');
      delete from shared_chat_private.ai_queue
       where room_id=q.room_id and job_id=q.job_id and ordinal=q.ordinal;
      published:=published+1;
    end loop;
  end loop;
  if p_action='publish' then return jsonb_build_object('published',published); end if;
  -- Only one job per invocation. Lease reservation precedes external AI call.
  select * into r from shared_chat_private.rooms x where x.ai_enabled
    and x.ai_next_at<=clock_timestamp()
    and (x.ai_claim_until is null or x.ai_claim_until<clock_timestamp())
    and not exists(select 1 from shared_chat_private.ai_queue y where y.room_id=x.id)
    and (case when x.ai_batch_day=today_jst then x.ai_batches_today else 0 end)<2
    and (select coalesce(sum(case when z.ai_batch_day=today_jst then z.ai_batches_today else 0 end),0)
         from shared_chat_private.rooms z)<6
    order by x.ai_next_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('published',published,'job',null); end if;
  work_id:=gen_random_uuid();
  update shared_chat_private.rooms set ai_claim_id=work_id,
    ai_claim_until=clock_timestamp()+interval '3 minutes' where id=r.id;
  return jsonb_build_object('published',published,
    'job',jsonb_build_object('room_id',r.id,'claim_id',work_id,
      'recent',(select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'text',left(t.text,240),'kind',t.kind)
                      order by t.seq),'[]'::jsonb) from (
        select seq,name,text,kind from shared_chat_private.messages
        where room_id=r.id and not hidden order by seq desc limit 10
      ) t)));
 end if;
 if p_action='notifications' then
   select coalesce(jsonb_agg(record),'[]'::jsonb) into raw from (
     select jsonb_build_object('room_id',r.id,'title',r.name,'seq',r.last_seq,
       'recipient',m.user_id,'subscription',m.push_subscription,
       'body',(select left(x.name||'：'||x.text,100) from shared_chat_private.messages x
          where x.room_id=r.id and not x.hidden and x.user_id is distinct from m.user_id
            and x.seq>greatest(m.last_read_seq,m.last_notified_seq)
          order by x.seq desc limit 1)) as record
     from shared_chat_private.members m join shared_chat_private.rooms r on r.id=m.room_id
     where m.status='active' and m.notify_enabled and m.push_subscription is not null
       and exists (select 1 from shared_chat_private.messages x
         where x.room_id=r.id and x.seq>greatest(m.last_read_seq,m.last_notified_seq)
           and x.user_id is distinct from m.user_id and not x.hidden)
     order by r.created_at,m.joined_at limit 50
     for update of m skip locked
   ) t;
   update shared_chat_private.members m set last_notified_seq=(q.record->>'seq')::bigint
     from jsonb_array_elements(raw) q(record)
     where m.room_id=(q.record->>'room_id')::uuid and m.user_id=(q.record->>'recipient')::uuid;
   return jsonb_build_object('notifications',raw);
 end if;
 if p_action not in ('stage','fail') then raise exception using errcode='22023',message='invalid_action'; end if;
 rid:=(p_payload->>'room_id')::uuid;
 work_id:=(p_payload->>'claim_id')::uuid;
 select * into r from shared_chat_private.rooms where id=rid for update;
 if not found or r.ai_claim_id is distinct from work_id
     or r.ai_claim_until < clock_timestamp() or not r.ai_enabled then
   return jsonb_build_object('staged',false,'stale',true);
 end if;
 if p_action='fail' then
   update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,
       ai_next_at=clock_timestamp()+interval '15 minutes' where id=rid;
   return jsonb_build_object('staged',false,'retry',true);
 end if;
 raw:=p_payload->'messages';
 if jsonb_typeof(raw) <> 'array' or jsonb_array_length(raw) not between 2 and 90 then
  raise exception using errcode='22023',message='invalid_messages';
 end if;
 if exists(select 1 from shared_chat_private.ai_queue where room_id=rid) then
  return jsonb_build_object('staged',false,'queue_present',true);
 end if;
 for item in select value from jsonb_array_elements(raw) loop
  idx:=idx+1;
  if jsonb_typeof(item)<>'object'
    or (item->>'speaker_id') !~ '^[0-9]{1,3}$'
    or (item->>'delay_seconds') !~ '^[0-9]{1,6}$'
    or (item->>'delay_seconds')::integer > 86400
    or char_length(coalesce(item->>'name','')) not between 1 and 40
    or char_length(coalesce(item->>'text','')) not between 1 and 1500 then
    raise exception using errcode='22023',message='invalid_message';
  end if;
  insert into shared_chat_private.ai_queue(room_id,job_id,ordinal,speaker_id,name,text,due_at)
   values(rid,work_id,idx,(item->>'speaker_id')::integer,item->>'name',item->>'text',
       clock_timestamp()+make_interval(secs=>(item->>'delay_seconds')::integer));
  staged:=staged+1;
 end loop;
 update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,
   ai_next_at=clock_timestamp()+interval '8 hours',
   ai_batch_day=today_jst,
   ai_batches_today=case when ai_batch_day=today_jst then ai_batches_today+1 else 1 end
   where id=rid;
 return jsonb_build_object('staged',true,'count',staged);
end $$;
revoke all on function public.shared_chat_ai_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_chat_ai_rpc(text,jsonb) to service_role;

$stage_two$;
end if;
if not exists(select 1 from information_schema.columns where table_schema='shared_chat_private' and table_name='settings' and column_name='integrated_enabled') then
execute $stage_three$
-- Integrated Himiko sharing. Apply once AFTER 001 and 002. No learning/chat data deletion.

alter table shared_chat_private.settings add column if not exists integrated_enabled boolean not null default false;
alter table shared_chat_private.settings add column if not exists room_daily_batches integer not null default 12 check(room_daily_batches between 1 and 100);
alter table shared_chat_private.settings add column if not exists global_daily_batches integer not null default 120 check(global_daily_batches between 1 and 5000);
alter table shared_chat_private.messages drop constraint messages_kind_check;
alter table shared_chat_private.messages drop constraint shared_chat_message_identity;
alter table shared_chat_private.messages add constraint messages_kind_check check(kind in ('human','ai','system'));
alter table shared_chat_private.messages add constraint shared_chat_message_identity check(
 (kind='human' and user_id is not null and speaker_id is null) or
 (kind='ai' and user_id is null and speaker_id is not null) or
 (kind='system' and user_id is null and speaker_id is null));
create or replace function shared_chat_private.member_event(rid uuid, body text)
returns void language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 update shared_chat_private.rooms set last_seq=last_seq+1 where id=rid returning last_seq into n;
 insert into shared_chat_private.messages(room_id,seq,user_id,name,text,client_id,kind)
 values(rid,n,null,'お知らせ',body,gen_random_uuid(),'system');
end $$;
revoke all on function shared_chat_private.member_event(uuid,text) from public,anon,authenticated;
create or replace function shared_chat_private.publish_room(rid uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare q shared_chat_private.ai_queue%rowtype; n bigint; total integer:=0;
begin
 perform 1 from shared_chat_private.rooms where id=rid and ai_enabled for update;
 if not found then return 0; end if;
 for q in select * from shared_chat_private.ai_queue where room_id=rid and due_at<=clock_timestamp()
   order by due_at,job_id,ordinal limit 70 loop
  update shared_chat_private.rooms set last_seq=last_seq+1 where id=rid returning last_seq into n;
  insert into shared_chat_private.messages(room_id,seq,user_id,name,text,client_id,sent_at,speaker_id,kind)
   values(rid,n,null,q.name,q.text,gen_random_uuid(),clock_timestamp(),q.speaker_id,'ai');
  delete from shared_chat_private.ai_queue where room_id=rid and job_id=q.job_id and ordinal=q.ordinal;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function shared_chat_private.publish_room(uuid) from public,anon,authenticated;
create or replace function public.shared_chat_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
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
 if p_action is null or p_action not in ('list','create','join','sync','send','read','invite','revoke_invites','approve','remove','hide','leave','ai_toggle','subscribe','rename') then
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
    'unread',case when mm.status='active' then (select count(*) from shared_chat_private.messages z where z.room_id=g.id and z.seq>mm.last_read_seq and z.user_id is distinct from uid and not z.hidden) else 0 end,
    'created_at',g.created_at) x
   from shared_chat_private.rooms g join shared_chat_private.members mm on mm.room_id=g.id
   where mm.user_id=uid and mm.status in ('active','pending')
  ) q;
  return jsonb_build_object('rooms',result);
 end if;
 if p_action='create' then
  if (select integrated_enabled from shared_chat_private.settings where id=true) then
   insert into shared_chat_private.creators(user_id) values(uid) on conflict do nothing;
  end if;
  if not exists(select 1 from shared_chat_private.creators where user_id=uid) then
   raise exception using errcode='42501',message='creator_permission_required';
  end if;
  -- Serialize per creator so concurrent creation cannot bypass the cap.
  perform 1 from shared_chat_private.creators where user_id=uid for update;
  if (select count(*) from shared_chat_private.rooms where owner_id=uid)>=(case when (select integrated_enabled from shared_chat_private.settings where id=true) then 1 else 10 end) then
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
  perform shared_chat_private.publish_room(rid);
  -- Latest 100 on initial load. before_seq supports backscroll; after_seq supports catch-up.
  if p_payload ? 'before_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages
    where room_id=rid and seq<(p_payload->>'before_seq')::bigint order by seq desc limit 100
   ) x;
  elsif p_payload ? 'from_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages
    where room_id=rid and seq>=greatest(0,(p_payload->>'from_seq')::bigint) order by seq desc limit 500
   ) x;
  elsif p_payload ? 'after_seq' then
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages
    where room_id=rid and seq>greatest(0,(p_payload->>'after_seq')::bigint) order by seq limit 100
   ) x;
  else
   select coalesce(jsonb_agg(x order by seq),'[]'::jsonb) into result from (
    select seq,name,user_id,text,sent_at,hidden,speaker_id,kind from shared_chat_private.messages where room_id=rid order by seq desc limit 100
   ) x;
  end if;
  -- Hidden text is never delivered, including to other admins or new sessions.
  select coalesce(jsonb_agg(case when (z->>'hidden')::boolean then z||'{"text":""}'::jsonb else z end order by ord),'[]'::jsonb)
   into result from jsonb_array_elements(result) with ordinality as a(z,ord);
  return jsonb_build_object('room',jsonb_build_object('id',rid,'name',r.name,'owner',r.owner_id=uid,'last_seq',(select last_seq from shared_chat_private.rooms where id=rid),'ai_enabled',r.ai_enabled),
   'typing',(select jsonb_build_object('speaker_id',q.speaker_id,'name',q.name,'at',q.due_at) from shared_chat_private.ai_queue q where q.room_id=rid and q.due_at>clock_timestamp() order by q.due_at,q.ordinal limit 1),
   'unread_count',(select count(*) from shared_chat_private.messages u where u.room_id=rid and u.seq>m.last_read_seq and u.user_id is distinct from uid and not u.hidden),
   'messages',(select coalesce(jsonb_agg(z || jsonb_build_object('read_count',(select count(*) from shared_chat_private.members rr where rr.room_id=rid and rr.status='active' and rr.user_id is distinct from (z->>'user_id')::uuid and rr.last_read_seq >= (z->>'seq')::bigint)) order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality a(z,ord)),'self_id',uid,'last_read_seq',m.last_read_seq,'notifications_enabled',m.notify_enabled,'server_time',clock_timestamp(),
   'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',mm.user_id,'name',mm.name,'status',mm.status,'last_read_seq',mm.last_read_seq) order by mm.joined_at),'[]'::jsonb)
    from shared_chat_private.members mm where mm.room_id=rid and (mm.status='active' or r.owner_id=uid)));
 end if;
 if p_action='send' then
  req_id:=(p_payload->>'client_id')::uuid; body:=btrim(p_payload->>'text');
  if req_id is null or body is null or char_length(body) not between 1 and 2000 then raise exception using errcode='22023',message='invalid_message'; end if;
  select * into msg from shared_chat_private.messages where room_id=rid and user_id=uid and client_id=req_id;
  if found then return jsonb_build_object('seq',msg.seq); end if;
  perform shared_chat_private.publish_room(rid);
  delete from shared_chat_private.ai_queue where room_id=rid;
  update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,ai_next_at=case when ai_enabled then clock_timestamp() else null end where id=rid;
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
 if p_action='subscribe' then
  if p_payload->'subscription' = 'null'::jsonb then
   update shared_chat_private.members set push_subscription=null,notify_enabled=false
    where room_id=rid and user_id=uid;
   return '{"ok":true}'::jsonb;
  end if;
  if jsonb_typeof(p_payload->'subscription')<>'object'
    or length(coalesce(p_payload #>> '{subscription,endpoint}','')) not between 20 and 1500
    or coalesce(p_payload #>> '{subscription,endpoint}','') !~ '^https://'
    or length(coalesce(p_payload #>> '{subscription,keys,p256dh}','')) not between 20 and 400
    or length(coalesce(p_payload #>> '{subscription,keys,auth}','')) not between 8 and 100
    or octet_length((p_payload->'subscription')::text)>4000 then
    raise exception using errcode='22023',message='invalid_subscription';
  end if;
  update shared_chat_private.members
   set push_subscription=p_payload->'subscription',notify_enabled=true
    where room_id=rid and user_id=uid;
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='leave' then
  if r.owner_id=uid then raise exception using errcode='22023',message='owner_cannot_leave'; end if;
  perform shared_chat_private.member_event(rid,m.name||'が退会しました。');
  update shared_chat_private.members set status='removed' where room_id=rid and user_id=uid;
  delete from shared_chat_private.ai_queue where room_id=rid;
  update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,ai_next_at=case when ai_enabled then clock_timestamp() else null end where id=rid;
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'leave');
  return '{"ok":true}'::jsonb;
 end if;
 if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;
 if p_action='ai_toggle' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then
   raise exception using errcode='22023', message='invalid_toggle';
  end if;
  update shared_chat_private.rooms
   set ai_enabled=(p_payload->>'enabled')::boolean,
       ai_next_at=case when (p_payload->>'enabled')::boolean then clock_timestamp() else null end,
       ai_claim_id=null, ai_claim_until=null
   where id=rid;
  if not (p_payload->>'enabled')::boolean then
   delete from shared_chat_private.ai_queue where room_id=rid;
  end if;
 insert into shared_chat_private.audit(room_id,actor_id,action,target)
   values(rid,uid,'ai_toggle',p_payload->>'enabled');
  return jsonb_build_object('ok',true,'ai_enabled',(p_payload->>'enabled')::boolean);
 end if;
 if p_action='invite' then
  update shared_chat_private.invites set revoked=true where room_id=rid;
  token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into shared_chat_private.invites(token_hash,room_id,expires_at) values(encode(sha256(convert_to(token,'UTF8')),'hex'),rid,clock_timestamp()+interval '7 days');
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'invite');
  return jsonb_build_object('token',token,'expires_in_days',7);
 elsif p_action='rename' then
  title:=btrim(p_payload->>'name');
  if title is null or char_length(title) not between 1 and 30 then raise exception using errcode='22023',message='invalid_name'; end if;
  update shared_chat_private.rooms set name=title where id=rid;
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
 if p_action in ('approve','remove') then
  perform shared_chat_private.member_event(rid,(select name from shared_chat_private.members where room_id=rid and user_id=target_uid)||case when p_action='approve' then 'が参加しました。' else 'が退会しました。' end);
 end if;
 if p_action in ('approve','remove','hide') then
  delete from shared_chat_private.ai_queue where room_id=rid;
  update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,ai_next_at=case when ai_enabled then clock_timestamp() else null end where id=rid;
 end if;
 insert into shared_chat_private.audit(room_id,actor_id,action,target) values(rid,uid,p_action,coalesce(p_payload->>'user_id',p_payload->>'seq'));
 return '{"ok":true}'::jsonb;
 exception when others then
  return jsonb_build_object('error',sqlerrm,'code',sqlstate);
 end;
end $$;

-- Service-role-only operations. This RPC does not accept end-user JWTs.
-- Per-room/global daily budgets are configured in the private settings row.
create or replace function public.shared_chat_ai_rpc(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r shared_chat_private.rooms%rowtype;
 q shared_chat_private.ai_queue%rowtype;
 work_id uuid; rid uuid; raw jsonb; item jsonb; idx integer := 0;
 new_seq bigint; published integer := 0; staged integer := 0;
 today_jst date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
  raise exception using errcode='42501',message='server_only';
 end if;
 if not (select enabled from shared_chat_private.settings where id=true) then
  return jsonb_build_object('disabled',true);
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text)>125000 then
  raise exception using errcode='22023',message='invalid_payload';
 end if;
 if p_action='claim' then perform 1 from shared_chat_private.settings where id=true for update; end if;
 if p_action in ('publish','claim') then
  -- Publish any due messages, IN TRANSACTION, in the same sequence as humans.
  -- Row lock serializes writes and makes multiple cron invocations safe.
  for r in select * from shared_chat_private.rooms
      where ai_enabled and exists(select 1 from shared_chat_private.ai_queue x
                                 where x.room_id=shared_chat_private.rooms.id and x.due_at<=clock_timestamp())
      order by created_at limit 50 for update skip locked loop
    for q in select * from shared_chat_private.ai_queue
        where room_id=r.id and due_at<=clock_timestamp()
        order by due_at,job_id,ordinal limit 70 loop
      update shared_chat_private.rooms set last_seq=last_seq+1
       where id=r.id returning last_seq into new_seq;
      insert into shared_chat_private.messages(room_id,seq,user_id,name,text,client_id,sent_at,speaker_id,kind)
       values(r.id,new_seq,null,q.name,q.text,gen_random_uuid(),clock_timestamp(),q.speaker_id,'ai');
      delete from shared_chat_private.ai_queue
       where room_id=q.room_id and job_id=q.job_id and ordinal=q.ordinal;
      published:=published+1;
    end loop;
  end loop;
  if p_action='publish' then return jsonb_build_object('published',published); end if;
  -- Only one job per invocation. Lease reservation precedes external AI call.
  select * into r from shared_chat_private.rooms x where x.ai_enabled
    and (not (p_payload ? 'room_id') or x.id=(p_payload->>'room_id')::uuid)
    and x.ai_next_at<=clock_timestamp()
    and (x.ai_claim_until is null or x.ai_claim_until<clock_timestamp())
    and not exists(select 1 from shared_chat_private.ai_queue y where y.room_id=x.id)
    and (case when x.ai_batch_day=today_jst then x.ai_batches_today else 0 end)<(select room_daily_batches from shared_chat_private.settings where id=true)
    and (select coalesce(sum(case when z.ai_batch_day=today_jst then z.ai_batches_today else 0 end),0)
         from shared_chat_private.rooms z)<(select global_daily_batches from shared_chat_private.settings where id=true)
    order by x.ai_next_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('published',published,'job',null); end if;
  work_id:=gen_random_uuid();
  update shared_chat_private.rooms set ai_claim_id=work_id,
    ai_claim_until=clock_timestamp()+interval '3 minutes',ai_batch_day=today_jst,
    ai_batches_today=case when ai_batch_day=today_jst then ai_batches_today+1 else 1 end where id=r.id;
  return jsonb_build_object('published',published,
    'job',jsonb_build_object('room_id',r.id,'claim_id',work_id,
      'recent',(select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'text',left(t.text,2000),'kind',t.kind,'user_id',t.user_id)
                      order by t.seq),'[]'::jsonb) from (
        select seq,name,text,kind,user_id from shared_chat_private.messages
        where room_id=r.id and not hidden order by seq desc limit 10
      ) t)));
 end if;
 if p_action='notifications' then
   select coalesce(jsonb_agg(record),'[]'::jsonb) into raw from (
     select jsonb_build_object('room_id',r.id,'title',r.name,'seq',r.last_seq,
       'recipient',m.user_id,'subscription',m.push_subscription,
       'body',(select left(x.name||'：'||x.text,100) from shared_chat_private.messages x
          where x.room_id=r.id and not x.hidden and x.user_id is distinct from m.user_id
            and x.seq>greatest(m.last_read_seq,m.last_notified_seq)
          order by x.seq desc limit 1)) as record
     from shared_chat_private.members m join shared_chat_private.rooms r on r.id=m.room_id
     where m.status='active' and m.notify_enabled and m.push_subscription is not null
       and exists (select 1 from shared_chat_private.messages x
         where x.room_id=r.id and x.seq>greatest(m.last_read_seq,m.last_notified_seq)
           and x.user_id is distinct from m.user_id and not x.hidden)
     order by r.created_at,m.joined_at limit 50
     for update of m skip locked
   ) t;
   update shared_chat_private.members m set last_notified_seq=(q.record->>'seq')::bigint
     from jsonb_array_elements(raw) q(record)
     where m.room_id=(q.record->>'room_id')::uuid and m.user_id=(q.record->>'recipient')::uuid;
   return jsonb_build_object('notifications',raw);
 end if;
 if p_action not in ('stage','fail') then raise exception using errcode='22023',message='invalid_action'; end if;
 rid:=(p_payload->>'room_id')::uuid;
 work_id:=(p_payload->>'claim_id')::uuid;
 select * into r from shared_chat_private.rooms where id=rid for update;
 if not found or r.ai_claim_id is distinct from work_id
     or r.ai_claim_until < clock_timestamp() or not r.ai_enabled then
   return jsonb_build_object('staged',false,'stale',true);
 end if;
 if p_action='fail' then
   update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,
       ai_next_at=clock_timestamp()+interval '1 minute' where id=rid;
   return jsonb_build_object('staged',false,'retry',true);
 end if;
 raw:=p_payload->'messages';
 if jsonb_typeof(raw) <> 'array' or jsonb_array_length(raw) not between 2 and 90 then
  raise exception using errcode='22023',message='invalid_messages';
 end if;
 if exists(select 1 from shared_chat_private.ai_queue where room_id=rid) then
  return jsonb_build_object('staged',false,'queue_present',true);
 end if;
 for item in select value from jsonb_array_elements(raw) loop
  idx:=idx+1;
  if jsonb_typeof(item)<>'object'
    or (item->>'speaker_id') !~ '^[0-9]{1,3}$'
    or (item->>'delay_seconds') !~ '^[0-9]{1,6}$'
    or (item->>'delay_seconds')::integer > 86400
    or char_length(coalesce(item->>'name','')) not between 1 and 40
    or char_length(coalesce(item->>'text','')) not between 1 and 1500 then
    raise exception using errcode='22023',message='invalid_message';
  end if;
  insert into shared_chat_private.ai_queue(room_id,job_id,ordinal,speaker_id,name,text,due_at)
   values(rid,work_id,idx,(item->>'speaker_id')::integer,item->>'name',item->>'text',
       clock_timestamp()+make_interval(secs=>(item->>'delay_seconds')::integer));
  staged:=staged+1;
 end loop;
 update shared_chat_private.rooms set ai_claim_id=null,ai_claim_until=null,
   ai_next_at=clock_timestamp()+interval '40 minutes'
   where id=rid;
 return jsonb_build_object('staged',true,'count',staged);
end $$;
revoke all on function public.shared_chat_ai_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.shared_chat_ai_rpc(text,jsonb) to service_role;


$stage_three$;
end if;
end
$installer$;
commit;
