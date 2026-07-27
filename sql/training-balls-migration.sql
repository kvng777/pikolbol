-- Training Balls (50) with movable basket — per-booking add-on (Php100)
-- Adds a boolean flag mirroring `needs_balls`.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS training_balls BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.training_balls IS
  'True when the customer added the 50-training-balls + movable basket rental (Php100 per booking).';
