alter table shared_chat_private.ai_message_reads add column if not exists read_at timestamptz not null default clock_timestamp();

create or replace function shared_chat_private.record_queued_ai_read()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare last_message record;
begin
 select seq,kind into last_message from shared_chat_private.messages where room_id=new.room_id order by seq desc limit 1;
 if last_message.kind='human' then
  insert into shared_chat_private.ai_message_reads(room_id,message_seq,speaker_id,read_at)
  values(new.room_id,last_message.seq,new.speaker_id,greatest(clock_timestamp(),new.due_at-interval '5 seconds'))
  on conflict (room_id,message_seq,speaker_id) do update
    set read_at=least(shared_chat_private.ai_message_reads.read_at,excluded.read_at);
 end if;
 return new;
end $fn$;

create or replace function shared_chat_private.clear_cancelled_ai_read()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if not exists(select 1 from shared_chat_private.ai_queue q where q.room_id=old.room_id and q.speaker_id=old.speaker_id) then
  delete from shared_chat_private.ai_message_reads ar
   where ar.room_id=old.room_id and ar.speaker_id=old.speaker_id and ar.read_at>clock_timestamp();
 end if;
 return old;
end $fn$;
revoke all on function shared_chat_private.clear_cancelled_ai_read() from public,anon,authenticated;
drop trigger if exists clear_cancelled_ai_read on shared_chat_private.ai_queue;
create trigger clear_cancelled_ai_read after delete on shared_chat_private.ai_queue for each row execute function shared_chat_private.clear_cancelled_ai_read();

do $migration$
declare source text;
old_part text := $old$(select count(*) from shared_chat_private.ai_message_reads ar where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint)$old$;
new_part text := $new$(select count(*) from shared_chat_private.ai_message_reads ar where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint and ar.read_at<=clock_timestamp())$new$;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into source;
 if source is null or (length(source)-length(replace(source,old_part,'')))/length(old_part)<>1 then raise exception 'unexpected shared_chat_rpc definition'; end if;
 execute replace(source,old_part,new_part);
end $migration$;