-- Preserve the historical fact that an AI participant read a message even if later removed.
do $migration$
declare s text; old_text text; new_text text;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into s;
 old_text:=$old$(select count(*) from shared_chat_private.ai_message_reads ar join shared_chat_private.room_personas p on p.room_id=ar.room_id and p.persona_id=ar.speaker_id and p.active where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint)$old$;
 new_text:=$new$(select count(*) from shared_chat_private.ai_message_reads ar where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint)$new$;
 if s is null or (length(s)-length(replace(s,old_text,'')))/length(old_text)<>1 then raise exception 'unexpected shared_chat_rpc definition'; end if;
 execute replace(s,old_text,new_text);
end $migration$;
