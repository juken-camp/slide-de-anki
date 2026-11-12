-- A pending applicant can withdraw without losing or deleting any messages.
alter table shared_chat_private.members drop constraint members_status_check;
alter table shared_chat_private.members add constraint members_status_check check(status in ('pending','active','removed','cancelled'));
do $migration$
declare s text; old text; replacement text;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into s;
 old:=$old$'hide','leave','ai_toggle','subscribe','rename','transfer_owner')$old$;
 replacement:=$new$'hide','leave','ai_toggle','subscribe','rename','transfer_owner','cancel_join')$new$;
 if s is null or (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected action list'; end if;
 s:=replace(s,old,replacement);
 old:=$old$  if (select integrated_enabled from shared_chat_private.settings where id=true) then
   insert into shared_chat_private.creators(user_id) values(uid) on conflict do nothing;
  end if;
  if not exists(select 1 from shared_chat_private.creators where user_id=uid) then
   raise exception using errcode='42501',message='creator_permission_required';
  end if;$old$;
 replacement:=$new$  insert into shared_chat_private.creators(user_id) values(uid) on conflict do nothing;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected creator permission'; end if;
 s:=replace(s,old,replacement);
 old:=$old$  insert into shared_chat_private.members(room_id,user_id,name,status) values(rid,uid,nickname,'pending');$old$;
 replacement:=$new$  if m.status='cancelled' then
   update shared_chat_private.members set status='pending',name=nickname,joined_at=clock_timestamp() where room_id=rid and user_id=uid;
  else
   insert into shared_chat_private.members(room_id,user_id,name,status) values(rid,uid,nickname,'pending');
  end if;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected join insert'; end if;
 s:=replace(s,old,replacement);
 old:=$old$ if m.status is distinct from 'active' then raise exception using errcode='42501',message='room_unavailable'; end if;$old$;
 replacement:=$new$ if p_action='cancel_join' then
  if m.status is distinct from 'pending' then raise exception using errcode='22023',message='no_pending_request'; end if;
  update shared_chat_private.members set status='cancelled' where room_id=rid and user_id=uid and status='pending';
  insert into shared_chat_private.audit(room_id,actor_id,action) values(rid,uid,'cancel_join');
  return '{"ok":true}'::jsonb;
 end if;
 if m.status is distinct from 'active' then raise exception using errcode='42501',message='room_unavailable'; end if;$new$;
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'unexpected membership check'; end if;
 execute replace(s,old,replacement);
end $migration$;
