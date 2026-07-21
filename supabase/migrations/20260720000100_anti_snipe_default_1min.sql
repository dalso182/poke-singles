-- Shorten the anti-snipe extension default from 5 minutes to 1: a last-second
-- bid now pushes the close to just now() + 1 min, keeping endings snappy while
-- still giving the outbid party a window to respond. Per-auction override via
-- the admin form is unchanged (0-60 check stays).
--
-- The UPDATE re-points rows still carrying the old default (dev test data;
-- prod has no auctions yet). Deliberately-set other values are untouched.

alter table public.auctions
  alter column anti_snipe_minutes set default 1;

update public.auctions
set anti_snipe_minutes = 1
where anti_snipe_minutes = 5;
