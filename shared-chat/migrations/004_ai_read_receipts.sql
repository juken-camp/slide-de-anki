-- Record AI participants who have been queued to respond to a human message.
-- Private server-side state: existing messages and rooms are preserved.
create table shared_chat_private.ai_message_reads (
 room_id uuid not null,
 message_seq bigint not null,
 speaker_id integer not null,
 primary key (room_id,message_seq,speaker_id),
 foreign key (room_id,message_seq) references shared_chat_private.messages(room_id,seq) on delete cascade
);
alter table shared_chat_private.ai_message_reads enable row level security;
revoke all on shared_chat_private.ai_message_reads from public,anon,authenticated;

create function shared_chat_private.record_queued_ai_read()
returns trigger language plpgsql security definer set search_path = '' as $$
declare last_message record;
begin
 select seq,kind into last_message from shared_chat_private.messages
 where room_id=new.room_id order by seq desc limit 1;
 if last_message.kind='human' then
  insert into shared_chat_private.ai_message_reads(room_id,message_seq,speaker_id)
  values(new.room_id,last_message.seq,new.speaker_id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function shared_chat_private.record_queued_ai_read() from public,anon,authenticated;
create trigger record_queued_ai_read after insert on shared_chat_private.ai_queue
 for each row execute function shared_chat_private.record_queued_ai_read();

-- A speaker who has already replied has necessarily read the preceding message.
insert into shared_chat_private.ai_message_reads(room_id,message_seq,speaker_id)
select distinct h.room_id,h.seq,a.speaker_id
from shared_chat_private.messages h
join shared_chat_private.messages a on a.room_id=h.room_id and a.kind='ai' and a.speaker_id is not null and a.seq>h.seq
where h.kind='human' and not exists (
 select 1 from shared_chat_private.messages n
 where n.room_id=h.room_id and n.kind='human' and n.seq>h.seq and n.seq<a.seq
) on conflict do nothing;

do $$
declare source text; old_part text := $old$(select count(*) from shared_chat_private.members rr where rr.room_id=rid and rr.status='active' and rr.user_id is distinct from (z->>'user_id')::uuid and rr.last_read_seq >= (z->>'seq')::bigint)$old$;
 new_part text := $new$((select count(*) from shared_chat_private.members rr where rr.room_id=rid and rr.status='active' and rr.user_id is distinct from (z->>'user_id')::uuid and rr.last_read_seq >= (z->>'seq')::bigint) + (select count(*) from shared_chat_private.ai_message_reads ar where ar.room_id=rid and ar.message_seq=(z->>'seq')::bigint))$new$;
begin
 select pg_get_functiondef('public.shared_chat_rpc(text,jsonb)'::regprocedure) into source;
 if source is null or (length(source)-length(replace(source,old_part,'')))/length(old_part)<>1 then
  raise exception 'unexpected shared_chat_rpc definition; migration aborted';
 end if;
 execute replace(source,old_part,new_part);
end $$;
