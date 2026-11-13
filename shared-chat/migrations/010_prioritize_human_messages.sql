-- Preserve the autonomous daily limit while reserving bounded capacity for unanswered human messages.
do $migration$
declare s text; old_text text; new_text text;
begin
 select pg_get_functiondef('public.shared_chat_ai_rpc(text,jsonb)'::regprocedure) into s;
 old_text := $old$and (case when x.ai_batch_day=today_jst then x.ai_batches_today else 0 end)<(select room_daily_batches from shared_chat_private.settings where id=true)$old$;
 new_text := $new$and (case when x.ai_batch_day=today_jst then x.ai_batches_today else 0 end)
       < (select room_daily_batches from shared_chat_private.settings where id=true)
         + case when (select last_msg.kind from shared_chat_private.messages last_msg
                      where last_msg.room_id=x.id and not last_msg.hidden
                      order by last_msg.seq desc limit 1)='human'
                then 12 else 0 end$new$;
 if s is null or (length(s)-length(replace(s,old_text,'')))/length(old_text)<>1 then
  raise exception 'unexpected shared_chat_ai_rpc quota condition';
 end if;
 execute replace(s,old_text,new_text);
end $migration$;
