-- Show who removed a persona in new group chat events.
do $migration$
declare s text; old_text text; new_text text;
begin
 select pg_get_functiondef('public.shared_chat_cast(text,jsonb)'::regprocedure) into s;
 old_text := $old$else persona_name||'が退会しました。' end$old$;
 new_text := $new$else member_row.name||'が'||persona_name||'を退会させました。' end$new$;
 if s is null or (length(s)-length(replace(s,old_text,'')))/length(old_text)<>1 then
  raise exception 'unexpected shared_chat_cast definition';
 end if;
 execute replace(s,old_text,new_text);
end $migration$;
