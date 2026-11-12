-- New members can read only messages created after their approval.
-- Existing participants retain their existing history access.
alter table shared_chat_private.members
 add column history_start_seq bigint not null default 0 check (history_start_seq >= 0);

do $migration$
declare
 source text;
 old_parts text[] := array[
  $a$update shared_chat_private.members set status=case when p_action='approve' then 'active' else 'removed' end$a$,
  $a$where room_id=rid and seq<(p_payload->>'before_seq')::bigint$a$,
  $a$where room_id=rid and seq>=greatest(0,(p_payload->>'from_seq')::bigint)$a$,
  $a$where room_id=rid and seq>greatest(0,(p_payload->>'after_seq')::bigint)$a$,
  $a$where room_id=rid order by seq desc limit 100$a$
 ];
 new_parts text[] := array[
  $b$update shared_chat_private.members set status=case when p_action='approve' then 'active' else 'removed' end, history_start_seq=case when p_action='approve' then r.last_seq+1 else history_start_seq end, last_read_seq=case when p_action='approve' then greatest(last_read_seq,r.last_seq) else last_read_seq end$b$,
  $b$where room_id=rid and seq>=m.history_start_seq and seq<(p_payload->>'before_seq')::bigint$b$,
  $b$where room_id=rid and seq>=greatest(m.history_start_seq,(p_payload->>'from_seq')::bigint)$b$,
  $b$where room_id=rid and seq>=m.history_start_seq and seq>greatest(0,(p_payload->>'after_seq')::bigint)$b$,
  $b$where room_id=rid and seq>=m.history_start_seq order by seq desc limit 100$b$
 ];
 i integer;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into source;
 for i in 1..array_length(old_parts,1) loop
  if source is null or (length(source)-length(replace(source,old_parts[i],'')))/length(old_parts[i])<>1 then
   raise exception 'shared_chat_rpc unexpected at step %',i;
  end if;
  source:=replace(source,old_parts[i],new_parts[i]);
 end loop;
 execute source;
 -- Conversation generation must not receive messages older than the latest
 -- active member's visibility boundary.
 select pg_get_functiondef('public.shared_chat_ai_rpc(text,jsonb)'::regprocedure) into source;
 if source is null or (length(source)-length(replace(source,$a$where room_id=r.id and not hidden order by seq desc limit 10$a$,'')))/length($a$where room_id=r.id and not hidden order by seq desc limit 10$a$)<>1 then
  raise exception 'shared_chat_ai_rpc unexpected';
 end if;
 source:=replace(source,$a$where room_id=r.id and not hidden order by seq desc limit 10$a$,
  $b$where room_id=r.id and not hidden and seq>=coalesce((select max(mm.history_start_seq) from shared_chat_private.members mm where mm.room_id=r.id and mm.status='active'),0) order by seq desc limit 10$b$);
 execute source;
end $migration$;
