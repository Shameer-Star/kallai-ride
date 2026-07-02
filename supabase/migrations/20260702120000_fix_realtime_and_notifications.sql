-- 1. Enable realtime for notifications table
do $$
begin
  if not exists (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

alter table public.notifications replica identity full;

-- 2. Drop and recreate policy on realtime.messages to allow all frontend channels
drop policy if exists "Authenticated users can read own realtime topics" on realtime.messages;

create policy "Authenticated users can read own realtime topics"
on realtime.messages
for select
to authenticated
using (
  (realtime.topic() like 'captain-feed-' || auth.uid()::text)
  or (realtime.topic() like 'customer-feed-' || auth.uid()::text)
  or (realtime.topic() like 'customer-rides-' || auth.uid()::text)
  or (realtime.topic() like 'captain-live-%')
  or (realtime.topic() = 'admin-feed' and public.has_role(auth.uid(), 'admin'::app_role))
  or exists (
    select 1 from public.rides r
    where (r.customer_id = auth.uid() or r.captain_id = auth.uid())
      and realtime.topic() = 'ride-' || r.id::text
  )
);
