-- Roles enum
create type public.app_role as enum ('customer', 'captain', 'admin');
create type public.vehicle_type as enum ('bike', 'auto');
create type public.ride_status as enum ('requested', 'accepted', 'started', 'completed', 'cancelled');

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- User roles table (separate, to prevent privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users view own roles"
  on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "Users insert own role on signup"
  on public.user_roles for insert to authenticated with check (user_id = auth.uid());

-- Captains table (driver-specific data)
create table public.captains (
  id uuid primary key references auth.users(id) on delete cascade,
  vehicle_type vehicle_type not null,
  vehicle_number text,
  license_number text,
  license_url text,
  rc_url text,
  photo_url text,
  verified boolean not null default false,
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.captains enable row level security;

create policy "Anyone authenticated can view captains"
  on public.captains for select to authenticated using (true);
create policy "Captain insert own row"
  on public.captains for insert to authenticated with check (auth.uid() = id);
create policy "Captain update own row"
  on public.captains for update to authenticated using (auth.uid() = id);

-- Rides table
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  captain_id uuid references auth.users(id) on delete set null,
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  drop_address text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  vehicle_type vehicle_type not null,
  distance_km numeric(8,2) not null,
  fare numeric(10,2) not null,
  status ride_status not null default 'requested',
  rejected_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);
alter table public.rides enable row level security;

create policy "Customer views own rides"
  on public.rides for select to authenticated
  using (customer_id = auth.uid() or captain_id = auth.uid()
    or (status = 'requested' and public.has_role(auth.uid(), 'captain')
        and not (auth.uid() = any(rejected_by))));

create policy "Customer creates own ride"
  on public.rides for insert to authenticated
  with check (customer_id = auth.uid());

create policy "Customer or captain updates ride"
  on public.rides for update to authenticated
  using (customer_id = auth.uid() or captain_id = auth.uid()
    or (status = 'requested' and public.has_role(auth.uid(), 'captain')));

-- Trigger: auto-create profile + role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _role app_role;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  );
  _role := coalesce((new.raw_user_meta_data->>'role')::app_role, 'customer');
  insert into public.user_roles (user_id, role) values (new.id, _role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger captains_updated_at before update on public.captains
  for each row execute function public.set_updated_at();

-- Realtime
alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.captains;
alter table public.rides replica identity full;
alter table public.captains replica identity full;

-- Storage bucket for captain documents
insert into storage.buckets (id, name, public) values ('captain-docs', 'captain-docs', true);

create policy "Captain docs publicly readable"
  on storage.objects for select using (bucket_id = 'captain-docs');
create policy "Captain uploads own docs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'captain-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Captain updates own docs"
  on storage.objects for update to authenticated
  using (bucket_id = 'captain-docs' and (storage.foldername(name))[1] = auth.uid()::text);