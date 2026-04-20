-- Fix function search_path
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- Make captain-docs bucket private and scope reads
update storage.buckets set public = false where id = 'captain-docs';

drop policy if exists "Captain docs publicly readable" on storage.objects;

create policy "Captain reads own docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'captain-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Admins read captain docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'captain-docs' and public.has_role(auth.uid(), 'admin'));