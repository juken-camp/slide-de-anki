-- Preserve message history, shared delivery and existing usage limits.
do $migration$
declare s text;
old_due text := $old$where ai_enabled and exists(select 1 from shared_chat_private.ai_queue x
                                 where x.room_id=shared_chat_private.rooms.id and x.due_at<=clock_timestamp())$old$;
new_due text := $new$where ai_enabled and exists(select 1 from shared_chat_private.ai_queue x
                                 where x.room_id=shared_chat_private.rooms.id and x.due_at<=clock_timestamp())
        and not exists(select 1 from shared_chat_private.messages recent_ai
                       where recent_ai.room_id=shared_chat_private.rooms.id
                         and recent_ai.kind='ai'
                         and recent_ai.sent_at>clock_timestamp()-interval '20 seconds')$new$;
old_limit text := $old$order by due_at,job_id,ordinal limit 70 loop$old$;
new_limit text := $new$order by due_at,job_id,ordinal limit 1 loop$new$;
old_interval text := $old$ai_next_at=clock_timestamp()+interval '40 minutes'$old$;
new_interval text := $new$ai_next_at=clock_timestamp()+interval '2 hours'$new$;
begin
 select pg_get_functiondef('public.shared_chat_ai_rpc(text,jsonb)'::regprocedure) into s;
 if s is null
   or (length(s)-length(replace(s,old_due,'')))/length(old_due)<>1
   or (length(s)-length(replace(s,old_limit,'')))/length(old_limit)<>1
   or (length(s)-length(replace(s,old_interval,'')))/length(old_interval)<>1
 then raise exception 'unexpected shared_chat_ai_rpc definition'; end if;
 s:=replace(s,old_due,new_due);
 s:=replace(s,old_limit,new_limit);
 s:=replace(s,old_interval,new_interval);
 execute s;
end $migration$;