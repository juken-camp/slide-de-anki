-- Shared group roster. Existing rooms and history are retained.
create table shared_chat_private.persona_catalog (
 id integer primary key,
 name text not null
);
create table shared_chat_private.room_personas (
 room_id uuid not null references shared_chat_private.rooms(id) on delete cascade,
 persona_id integer not null references shared_chat_private.persona_catalog(id),
 active boolean not null default true,
 primary key(room_id,persona_id)
);
alter table shared_chat_private.persona_catalog enable row level security;
alter table shared_chat_private.room_personas enable row level security;
revoke all on shared_chat_private.persona_catalog,shared_chat_private.room_personas from public,anon,authenticated;
insert into shared_chat_private.persona_catalog(id,name) values
(0,'AI先生'),
(80,'ハンムラビ王'),
(81,'釈迦（ブッダ）'),
(34,'孔子'),
(33,'始皇帝'),
(75,'イエス・キリスト'),
(1,'卑弥呼'),
(35,'ムハンマド'),
(2,'聖徳太子'),
(105,'小野妹子'),
(3,'中大兄皇子'),
(57,'行基'),
(106,'中臣鎌足'),
(84,'鑑真'),
(4,'聖武天皇'),
(96,'桓武天皇'),
(58,'最澄'),
(62,'空海'),
(107,'坂上田村麻呂'),
(108,'菅原道真'),
(5,'藤原道長'),
(109,'清少納言'),
(6,'紫式部'),
(110,'白河上皇'),
(159,'藤原清衡'),
(72,'平清盛'),
(152,'栄西'),
(97,'法然'),
(7,'源頼朝'),
(8,'北条政子'),
(85,'源義経'),
(36,'チンギス・ハン'),
(98,'親鸞'),
(111,'後鳥羽上皇'),
(86,'北条泰時'),
(99,'道元'),
(112,'北条時宗'),
(9,'フビライ・ハン'),
(113,'運慶'),
(100,'日蓮'),
(60,'一遍'),
(59,'後醍醐天皇'),
(87,'足利尊氏'),
(10,'足利義満'),
(114,'足利義政'),
(115,'世阿弥'),
(116,'尚巴志'),
(11,'雪舟'),
(145,'バスコ・ダ・ガマ'),
(37,'コロンブス'),
(77,'レオナルド・ダ・ヴィンチ'),
(88,'マゼラン'),
(38,'ルター'),
(117,'ザビエル'),
(164,'足利義昭'),
(160,'武田信玄'),
(161,'上杉謙信'),
(12,'織田信長'),
(118,'千利休'),
(158,'狩野永徳'),
(13,'豊臣秀吉'),
(14,'徳川家康'),
(119,'徳川家光'),
(90,'ロック'),
(89,'松尾芭蕉'),
(101,'徳川綱吉'),
(153,'井原西鶴'),
(154,'尾形光琳'),
(155,'菱川師宣'),
(162,'俵屋宗達'),
(15,'近松門左衛門'),
(102,'新井白石'),
(120,'徳川吉宗'),
(91,'モンテスキュー'),
(40,'ルソー'),
(121,'田沼意次'),
(156,'十返舎一九'),
(157,'滝沢馬琴'),
(17,'本居宣長'),
(122,'松平定信'),
(146,'ワット'),
(39,'ワシントン'),
(16,'杉田玄白'),
(125,'伊能忠敬'),
(123,'水野忠邦'),
(126,'葛飾北斎'),
(127,'歌川広重'),
(41,'ナポレオン'),
(124,'大塩平八郎'),
(43,'リンカーン'),
(42,'マルクス'),
(128,'ペリー'),
(129,'井伊直弼'),
(149,'勝海舟'),
(92,'西郷隆盛'),
(130,'徳川慶喜'),
(131,'木戸孝允（桂小五郎）'),
(132,'岩倉具視'),
(93,'大久保利通'),
(133,'大隈重信'),
(140,'渋沢栄一'),
(20,'福沢諭吉'),
(165,'吉田松陰'),
(18,'坂本龍馬'),
(94,'板垣退助'),
(21,'伊藤博文'),
(95,'陸奥宗光'),
(19,'明治天皇'),
(134,'小村寿太郎'),
(135,'尚泰'),
(136,'田中正造'),
(151,'東郷平八郎'),
(24,'夏目漱石'),
(137,'津田梅子'),
(138,'北里柴三郎'),
(141,'原敬'),
(46,'ガンジー'),
(147,'孫文'),
(148,'ウィルソン'),
(45,'レーニン'),
(139,'樋口一葉'),
(23,'野口英世'),
(142,'吉野作造'),
(22,'与謝野晶子'),
(27,'吉田茂'),
(51,'ルーズベルト'),
(25,'平塚らいてう'),
(49,'ヒトラー'),
(52,'毛沢東'),
(143,'マッカーサー'),
(144,'佐藤栄作'),
(53,'田中角栄');
-- Previously existing rooms had the full cast. New rooms have no cast by default.
insert into shared_chat_private.room_personas(room_id,persona_id)
 select r.id,c.id from shared_chat_private.rooms r cross join shared_chat_private.persona_catalog c;
update shared_chat_private.rooms set name='みんなでグルチャ' where name in ('みんなで異次元グルチャ','異次元の共有グルチャ');
create unique index shared_one_membership_per_user
 on shared_chat_private.members(user_id) where status in ('active','pending');

-- Every authenticated active human may add or remove a persona.
create function public.shared_chat_cast(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; pid integer; member_row shared_chat_private.members%rowtype;
 persona_name text; old_active boolean; active_count integer; attempts integer; bucket timestamptz;
begin
 if uid is null or not exists(select 1 from auth.users u where u.id=uid and u.email_confirmed_at is not null and coalesce(u.email,'')<>'' and not coalesce(u.is_anonymous,false)) then
  raise exception using errcode='42501',message='verified_login_required';
 end if;
 if not (select enabled from shared_chat_private.settings where id=true) then raise exception using errcode='42501',message='shared_chat_disabled'; end if;
 if p_action is null or p_action not in ('add','remove') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>2000 then raise exception using errcode='22023',message='invalid_payload'; end if;
 rid:=(p_payload->>'room_id')::uuid;
 if coalesce(p_payload->>'persona_id','') !~ '^[0-9]{1,3}$' then raise exception using errcode='22023',message='invalid_persona'; end if;
 pid:=(p_payload->>'persona_id')::integer;
 select name into persona_name from shared_chat_private.persona_catalog where id=pid;
 if persona_name is null then raise exception using errcode='22023',message='invalid_persona'; end if;
 perform 1 from shared_chat_private.rooms where id=rid for update;
 if not found then raise exception using errcode='42501',message='room_unavailable'; end if;
 select * into member_row from shared_chat_private.members where room_id=rid and user_id=uid and status='active';
 if not found then raise exception using errcode='42501',message='room_unavailable'; end if;
 bucket:=date_trunc('minute',clock_timestamp());
 insert into shared_chat_private.limits values(uid,'persona_change',bucket,1)
 on conflict(user_id,action,window_at) do update set count=shared_chat_private.limits.count+1 returning count into attempts;
 if attempts>60 then return jsonb_build_object('error','rate_limited'); end if;
 select active into old_active from shared_chat_private.room_personas where room_id=rid and persona_id=pid;
 if coalesce(old_active,false)=(p_action='add') then return jsonb_build_object('ok',true,'changed',false); end if;
 insert into shared_chat_private.room_personas(room_id,persona_id,active) values(rid,pid,p_action='add')
 on conflict(room_id,persona_id) do update set active=excluded.active;
 perform shared_chat_private.member_event(rid,case when p_action='add' then member_row.name||'が'||persona_name||'を招待しました。' else persona_name||'が退会しました。' end);
 delete from shared_chat_private.ai_queue where room_id=rid;
 select count(*) into active_count from shared_chat_private.room_personas where room_id=rid and active;
 -- Give people a short window to select multiple participants without paying
 -- for generations that would immediately be discarded by the next change.
 update shared_chat_private.rooms set ai_enabled=(active_count>0),ai_next_at=case when active_count>0 then clock_timestamp()+interval '10 seconds' else null end,ai_claim_id=null,ai_claim_until=null where id=rid;
 insert into shared_chat_private.audit(room_id,actor_id,action,target) values(rid,uid,'persona_'||p_action,pid::text);
 return jsonb_build_object('ok',true,'changed',true,'active_count',active_count);
end $$;
revoke all on function public.shared_chat_cast(text,jsonb) from public,anon;
grant execute on function public.shared_chat_cast(text,jsonb) to authenticated;

-- Keep previous read and history-privacy changes while adding cast to sync.
do $migration$
declare s text; old text; replacement text;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into s;
 old:=$old$'notifications_enabled',m.notify_enabled,'server_time',clock_timestamp()$old$;
 replacement:=$new$'notifications_enabled',m.notify_enabled,'cast',(select coalesce(jsonb_agg(p.persona_id order by p.persona_id),'[]'::jsonb) from shared_chat_private.room_personas p where p.room_id=rid and p.active),'server_time',clock_timestamp()$new$;
 if s is null or (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected sync function'; end if;
 s:=replace(s,old,replacement);
 old:=$old$(select count(*) from shared_chat_private.ai_message_reads ar where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint)$old$;
 replacement:=$new$(select count(*) from shared_chat_private.ai_message_reads ar join shared_chat_private.room_personas p on p.room_id=ar.room_id and p.persona_id=ar.speaker_id and p.active where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint)$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected AI read-count function'; end if;
 s:=replace(s,old,replacement);
 old:=$old$ if p_action='create' then
  if (select integrated_enabled from shared_chat_private.settings where id=true) then$old$;
 replacement:=$new$ if p_action='create' then
  if exists(select 1 from shared_chat_private.members where user_id=uid and status in ('active','pending')) then
   raise exception using errcode='22023',message='already_in_group';
  end if;
  if (select integrated_enabled from shared_chat_private.settings where id=true) then$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected create function'; end if;
 s:=replace(s,old,replacement);
 old:=$old$ if p_action='join' then
  select * into inv from shared_chat_private.invites where token_hash=inv.token_hash;$old$;
 replacement:=$new$ if p_action='join' then
  if exists(select 1 from shared_chat_private.members where user_id=uid and room_id<>rid and status in ('active','pending')) then
   raise exception using errcode='22023',message='already_in_group';
  end if;
  select * into inv from shared_chat_private.invites where token_hash=inv.token_hash;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected join function'; end if;
 s:=replace(s,old,replacement);
 old:=$old$'hide','leave','ai_toggle','subscribe','rename')$old$;
 replacement:=$new$'hide','leave','ai_toggle','subscribe','rename','transfer_owner')$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected action list'; end if;
 s:=replace(s,old,replacement);
 -- Archived rooms are retained, but no longer prevent their former owner from
 -- starting another group after leaving as the final participant.
 old:=$old$(select count(*) from shared_chat_private.rooms where owner_id=uid)>=$old$;
 replacement:=$new$(select count(*) from shared_chat_private.rooms g join shared_chat_private.members mm on mm.room_id=g.id and mm.user_id=uid and mm.status='active' where g.owner_id=uid)>=$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected owner room limit'; end if;
 s:=replace(s,old,replacement);
 old:=$old$  if r.owner_id=uid then raise exception using errcode='22023',message='owner_cannot_leave'; end if;$old$;
 replacement:=$new$  if r.owner_id=uid then
   if exists(select 1 from shared_chat_private.members x where x.room_id=rid and x.user_id<>uid and x.status in ('active','pending')) then
    raise exception using errcode='22023',message='owner_transfer_required';
   end if;
   update shared_chat_private.rooms set ai_enabled=false,ai_next_at=null where id=rid;
   update shared_chat_private.invites set revoked=true where room_id=rid;
  end if;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected owner leave condition'; end if;
 s:=replace(s,old,replacement);
 -- Room names can be changed by every active human member.
 old:=$old$ if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;$old$;
 replacement:=$new$ if p_action='rename' then
  title:=btrim(p_payload->>'name');
  if title is null or char_length(title) not between 1 and 30 then raise exception using errcode='22023',message='invalid_name'; end if;
  update shared_chat_private.rooms set name=title where id=rid;
  insert into shared_chat_private.audit(room_id,actor_id,action,target) values(rid,uid,'rename',null);
  return '{"ok":true}'::jsonb;
 end if;
 if p_action='transfer_owner' then
  if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;
  target_uid:=(p_payload->>'user_id')::uuid;
  if target_uid=uid or not exists(select 1 from shared_chat_private.members x where x.room_id=rid and x.user_id=target_uid and x.status='active') then
   raise exception using errcode='22023',message='invalid_target';
  end if;
  update shared_chat_private.rooms set owner_id=target_uid where id=rid;
  perform shared_chat_private.member_event(rid,(select name from shared_chat_private.members where room_id=rid and user_id=target_uid)||'が管理者になりました。');
  insert into shared_chat_private.audit(room_id,actor_id,action,target) values(rid,uid,'transfer_owner',target_uid::text);
  return '{"ok":true}'::jsonb;
 end if;
 if r.owner_id<>uid then raise exception using errcode='42501',message='owner_required'; end if;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected owner check'; end if;
 execute replace(s,old,replacement);

 select pg_get_functiondef('public.shared_chat_ai_rpc(text,jsonb)'::regprocedure) into s;
 old:=$old$and x.ai_next_at<=clock_timestamp()$old$;
 replacement:=$new$and exists(select 1 from shared_chat_private.room_personas p where p.room_id=x.id and p.active)
    and x.ai_next_at<=clock_timestamp()$new$;
 if s is null or (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected AI claim condition'; end if;
 s:=replace(s,old,replacement);
 old:=$old$'job',jsonb_build_object('room_id',r.id,'claim_id',work_id,$old$;
 replacement:=$new$'job',jsonb_build_object('room_id',r.id,'claim_id',work_id,'cast',(select coalesce(jsonb_agg(p.persona_id order by p.persona_id),'[]'::jsonb) from shared_chat_private.room_personas p where p.room_id=r.id and p.active),$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected AI job'; end if;
 s:=replace(s,old,replacement);
 old:=$old$jsonb_array_length(raw) not between 2 and 90$old$;
 replacement:=$new$jsonb_array_length(raw) not between 1 and 90$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected AI message minimum'; end if;
 s:=replace(s,old,replacement);
 old:=$old$  insert into shared_chat_private.ai_queue(room_id,job_id,ordinal,speaker_id,name,text,due_at)$old$;
 replacement:=$new$  if not exists(select 1 from shared_chat_private.room_personas p where p.room_id=rid and p.persona_id=(item->>'speaker_id')::integer and p.active) then
   raise exception using errcode='22023',message='persona_not_active';
  end if;
  insert into shared_chat_private.ai_queue(room_id,job_id,ordinal,speaker_id,name,text,due_at)$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected AI stage'; end if;
 execute replace(s,old,replacement);
end $migration$;
