create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  origin_street text not null,
  origin_unit text,
  origin_city text not null,
  origin_state text not null,
  origin_zip text not null,
  destination_street text not null,
  destination_unit text,
  destination_city text not null,
  destination_state text not null,
  destination_zip text not null,
  distance_miles numeric(8,1) not null,
  home_size smallint not null check (home_size between 0 and 4),
  estimated_hours smallint not null check (estimated_hours between 2 and 8),
  estimated_price integer not null,
  move_date date not null,
  arrival_window text not null,
  origin_property_type text,
  origin_access text,
  destination_property_type text,
  destination_access text,
  specialty_items jsonb not null default '[]'::jsonb,
  notes text,
  needs_review boolean not null default false,
  status text not null default 'reserved'
    check (status in ('reserved', 'confirmed', 'completed', 'cancelled')),
  google_event_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create sequence if not exists public.booking_reference_seq start with 17369;

create or replace function public.next_booking_reference()
returns text
language sql
as $$
  select 'FL' || nextval('public.booking_reference_seq')::text;
$$;

create table if not exists public.rate_limits (
  key text primary key,
  hits integer not null default 1,
  window_start timestamptz not null default now()
);

alter table public.bookings enable row level security;
alter table public.rate_limits enable row level security;

-- No anonymous policies: only the service role used by Edge Functions can read/write.
revoke all on table public.bookings from public, anon, authenticated;
revoke all on table public.rate_limits from public, anon, authenticated;
revoke all on sequence public.booking_reference_seq from public, anon, authenticated;
revoke all on function public.next_booking_reference() from public, anon, authenticated;
grant execute on function public.next_booking_reference() to service_role;
grant usage, select on sequence public.booking_reference_seq to service_role;
