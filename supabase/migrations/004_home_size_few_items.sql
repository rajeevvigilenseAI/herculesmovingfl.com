-- Home size 5 is "Just a Few Items", a job smaller than a studio. It was added
-- after 0-4 rather than renumbering so existing rows keep their meaning.
alter table public.bookings drop constraint if exists bookings_home_size_check;
alter table public.bookings add constraint bookings_home_size_check
  check (home_size between 0 and 5);
