-- Customers can now reserve a move with just a city/state (or ZIP) instead
-- of a full street address, so these columns are no longer guaranteed to be
-- populated at booking time.
alter table public.bookings alter column origin_street drop not null;
alter table public.bookings alter column origin_city drop not null;
alter table public.bookings alter column origin_zip drop not null;
alter table public.bookings alter column destination_street drop not null;
alter table public.bookings alter column destination_city drop not null;
alter table public.bookings alter column destination_zip drop not null;
