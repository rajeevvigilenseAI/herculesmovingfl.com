-- Customers can optionally pick a distance range ("100-150") instead of
-- letting the estimate derive mileage from the two locations. Recording which
-- range they chose tells the office whether distance_miles came from the
-- customer or from our own coordinate math.
alter table public.bookings add column if not exists distance_band text;
