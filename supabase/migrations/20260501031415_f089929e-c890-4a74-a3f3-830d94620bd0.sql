-- 1. Add ride type enum
DO $$ BEGIN
  CREATE TYPE public.ride_type AS ENUM ('passenger', 'parcel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend rides table
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS ride_type ride_type NOT NULL DEFAULT 'passenger',
  ADD COLUMN IF NOT EXISTS otp text,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS receiver_name text,
  ADD COLUMN IF NOT EXISTS receiver_phone text,
  ADD COLUMN IF NOT EXISTS item_description text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- 3. Extend captains table with performance fields
ALTER TABLE public.captains
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS rating numeric NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS total_rides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_rides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_rides integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_cancel_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_cancel_date date,
  ADD COLUMN IF NOT EXISTS warning_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS phone text;

-- 4. Cancellations log
CREATE TABLE IF NOT EXISTS public.cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL,
  cancelled_by uuid NOT NULL,
  cancelled_by_role text NOT NULL CHECK (cancelled_by_role IN ('customer','captain')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cancellations"
  ON public.cancellations FOR SELECT TO authenticated
  USING (cancelled_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.rides r WHERE r.id = ride_id
      AND (r.customer_id = auth.uid() OR r.captain_id = auth.uid())
  ));

CREATE POLICY "Users can insert their own cancellations"
  ON public.cancellations FOR INSERT TO authenticated
  WITH CHECK (cancelled_by = auth.uid());

-- 5. Trigger: when a captain cancels, increment daily counter and auto-offline at 3
CREATE OR REPLACE FUNCTION public.handle_captain_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := current_date;
  new_count integer;
BEGIN
  IF NEW.cancelled_by_role = 'captain' THEN
    UPDATE public.captains
    SET
      cancelled_rides = cancelled_rides + 1,
      daily_cancel_count = CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END,
      daily_cancel_date = today,
      warning_level = CASE WHEN (CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END) >= 3 THEN warning_level + 1 ELSE warning_level END,
      is_online = CASE WHEN (CASE WHEN daily_cancel_date = today THEN daily_cancel_count + 1 ELSE 1 END) >= 3 THEN false ELSE is_online END,
      rating = GREATEST(1.0, rating - 0.2)
    WHERE id = NEW.cancelled_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_captain_cancellation ON public.cancellations;
CREATE TRIGGER trg_captain_cancellation
  AFTER INSERT ON public.cancellations
  FOR EACH ROW EXECUTE FUNCTION public.handle_captain_cancellation();

-- 6. Trigger: increment captain's completed rides on completion
CREATE OR REPLACE FUNCTION public.handle_ride_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' AND NEW.captain_id IS NOT NULL THEN
    UPDATE public.captains
    SET completed_rides = completed_rides + 1,
        total_rides = total_rides + 1
    WHERE id = NEW.captain_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ride_completion ON public.rides;
CREATE TRIGGER trg_ride_completion
  AFTER UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.handle_ride_completion();

-- 7. Auto-generate OTP when ride is created
CREATE OR REPLACE FUNCTION public.set_ride_otp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.otp IS NULL THEN
    NEW.otp := lpad((floor(random() * 10000))::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_ride_otp ON public.rides;
CREATE TRIGGER trg_set_ride_otp
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.set_ride_otp();