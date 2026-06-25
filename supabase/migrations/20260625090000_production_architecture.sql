-- Migration: Complete Supabase Production Architecture for Kallai Ride

-- ========================================================
-- 1. Create users table and trigger sync with profiles
-- ========================================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text not null,
  email text,
  phone text,
  role public.app_role not null,
  profile_image text,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Populate users table with existing profiles/roles
INSERT INTO public.users (id, full_name, email, phone, role)
SELECT 
  p.id, 
  p.full_name, 
  au.email, 
  p.phone, 
  COALESCE(ur.role, 'customer'::public.app_role)
FROM public.profiles p
JOIN auth.users au ON p.id = au.id
LEFT JOIN public.user_roles ur ON p.id = ur.user_id
ON CONFLICT (id) DO NOTHING;

-- Modify handle_new_user to populate profiles, user_roles, users, and wallets
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _requested text;
  _role app_role;
  _full_name text;
  _phone text;
begin
  _full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  _phone := new.raw_user_meta_data->>'phone';

  insert into public.profiles (id, full_name, phone)
  values (new.id, _full_name, _phone);

  _requested := new.raw_user_meta_data->>'role';
  if new.email = 'kallairideadmin@kallai.ride' then
    _role := 'admin'::app_role;
  elsif _requested = 'captain' then
    _role := 'captain'::app_role;
  else
    _role := 'customer'::app_role;
  end if;

  insert into public.user_roles (user_id, role) values (new.id, _role);

  -- Insert into public.users
  insert into public.users (id, full_name, email, phone, role, profile_image)
  values (
    new.id,
    _full_name,
    new.email,
    _phone,
    _role,
    new.raw_user_meta_data->>'profile_image'
  );

  -- Create wallet
  insert into public.wallets (user_id, balance)
  values (
    new.id,
    case when _role = 'customer'::app_role then 100.00 else 0.00 end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Create sync triggers between public.profiles and public.users
CREATE OR REPLACE FUNCTION public.sync_profiles_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.users
  SET full_name = NEW.full_name,
      phone = NEW.phone
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_to_users ON public.profiles;
CREATE TRIGGER trg_sync_profiles_to_users
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profiles_to_users();


CREATE OR REPLACE FUNCTION public.sync_users_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET full_name = NEW.full_name,
      phone = NEW.phone
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_users_to_profiles ON public.users;
CREATE TRIGGER trg_sync_users_to_profiles
  AFTER UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_users_to_profiles();


-- Trigger to sync public.users.role with public.user_roles.role changes
CREATE OR REPLACE FUNCTION public.sync_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.users
    SET role = NEW.role
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_role ON public.user_roles;
CREATE TRIGGER trg_sync_user_role
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role();


-- ========================================================
-- 2. Extend captains table and sync triggers
-- ========================================================
ALTER TABLE public.captains
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_verified boolean,
  ADD COLUMN IF NOT EXISTS online_status text;

UPDATE public.captains SET user_id = id WHERE user_id IS NULL;
UPDATE public.captains SET is_verified = verified WHERE is_verified IS NULL;
UPDATE public.captains SET online_status = CASE WHEN is_online THEN 'online' ELSE 'offline' END WHERE online_status IS NULL;

-- Trigger to sync captain fields: verified <=> is_verified, is_online <=> online_status
CREATE OR REPLACE FUNCTION public.sync_captain_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := COALESCE(NEW.user_id, NEW.id);
    IF NEW.is_verified IS NULL AND NEW.verified IS NOT NULL THEN
      NEW.is_verified := NEW.verified;
    ELSIF NEW.verified IS NULL AND NEW.is_verified IS NOT NULL THEN
      NEW.verified := NEW.is_verified;
    END IF;
    IF NEW.online_status IS NULL THEN
      NEW.online_status := CASE WHEN NEW.is_online THEN 'online' ELSE 'offline' END;
    ELSIF NEW.is_online IS NULL THEN
      NEW.is_online := (NEW.online_status = 'online');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.verified IS DISTINCT FROM OLD.verified THEN
      NEW.is_verified := NEW.verified;
    ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      NEW.verified := NEW.is_verified;
    END IF;
    IF NEW.is_online IS DISTINCT FROM OLD.is_online THEN
      NEW.online_status := CASE WHEN NEW.is_online THEN 'online' ELSE 'offline' END;
    ELSIF NEW.online_status IS DISTINCT FROM OLD.online_status THEN
      NEW.is_online := (NEW.online_status = 'online');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_captain_fields ON public.captains;
CREATE TRIGGER trg_sync_captain_fields
  BEFORE INSERT OR UPDATE ON public.captains
  FOR EACH ROW EXECUTE FUNCTION public.sync_captain_fields();

-- Lock is_verified for non-admins as well
CREATE OR REPLACE FUNCTION public.lock_captain_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  NEW.verified := OLD.verified;
  NEW.is_verified := OLD.is_verified;
  NEW.warning_level := OLD.warning_level;
  NEW.cancelled_rides := OLD.cancelled_rides;
  NEW.daily_cancel_count := OLD.daily_cancel_count;
  NEW.daily_cancel_date := OLD.daily_cancel_date;
  NEW.completed_rides := OLD.completed_rides;
  NEW.total_rides := OLD.total_rides;
  NEW.rating := OLD.rating;
  RETURN NEW;
END $$;


-- ========================================================
-- 3. Extend rides table and sync triggers
-- ========================================================
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS pickup_location text,
  ADD COLUMN IF NOT EXISTS drop_location text,
  ADD COLUMN IF NOT EXISTS ride_status text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

UPDATE public.rides SET pickup_location = pickup_address WHERE pickup_location IS NULL;
UPDATE public.rides SET drop_location = drop_address WHERE drop_location IS NULL;
UPDATE public.rides SET ride_status = status::text WHERE ride_status IS NULL;

CREATE OR REPLACE FUNCTION public.sync_ride_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pickup_location IS NULL AND NEW.pickup_address IS NOT NULL THEN
      NEW.pickup_location := NEW.pickup_address;
    ELSIF NEW.pickup_address IS NULL AND NEW.pickup_location IS NOT NULL THEN
      NEW.pickup_address := NEW.pickup_location;
    END IF;

    IF NEW.drop_location IS NULL AND NEW.drop_address IS NOT NULL THEN
      NEW.drop_location := NEW.drop_address;
    ELSIF NEW.drop_address IS NULL AND NEW.drop_location IS NOT NULL THEN
      NEW.drop_address := NEW.drop_location;
    END IF;

    IF NEW.ride_status IS NULL AND NEW.status IS NOT NULL THEN
      NEW.ride_status := NEW.status::text;
    ELSIF NEW.status IS NULL AND NEW.ride_status IS NOT NULL THEN
      NEW.status := NEW.ride_status::public.ride_status;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.pickup_address IS DISTINCT FROM OLD.pickup_address THEN
      NEW.pickup_location := NEW.pickup_address;
    ELSIF NEW.pickup_location IS DISTINCT FROM OLD.pickup_location THEN
      NEW.pickup_address := NEW.pickup_location;
    END IF;

    IF NEW.drop_address IS DISTINCT FROM OLD.drop_address THEN
      NEW.drop_location := NEW.drop_address;
    ELSIF NEW.drop_location IS DISTINCT FROM OLD.drop_location THEN
      NEW.drop_address := NEW.drop_location;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.ride_status := NEW.status::text;
    ELSIF NEW.ride_status IS DISTINCT FROM OLD.ride_status THEN
      NEW.status := NEW.ride_status::public.ride_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ride_fields ON public.rides;
CREATE TRIGGER trg_sync_ride_fields
  BEFORE INSERT OR UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.sync_ride_fields();


-- ========================================================
-- 4. Create remaining tables
-- ========================================================

-- ride_requests
CREATE TABLE IF NOT EXISTS public.ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES public.rides(id) ON DELETE CASCADE,
  captain_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  request_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid REFERENCES public.rides(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(10,2) not null,
  payment_method text not null,
  payment_status text not null default 'pending',
  transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text not null,
  body text not null,
  type text not null,
  is_read boolean not null default false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- captain_locations
CREATE TABLE IF NOT EXISTS public.captain_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captain_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- emergency_alerts
CREATE TABLE IF NOT EXISTS public.emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  captain_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  alert_type text not null,
  location text not null,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- support_tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  issue text not null,
  status text not null default 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  balance numeric(10,2) not null default 0.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- wallet_transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric(10,2) not null,
  type text not null,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grant privileges for new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_requests TO authenticated;
GRANT ALL ON public.ride_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.captain_locations TO authenticated;
GRANT ALL ON public.captain_locations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_alerts TO authenticated;
GRANT ALL ON public.emergency_alerts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

-- Pre-populate wallets for existing users
INSERT INTO public.wallets (user_id, balance)
SELECT id, 100.00 FROM public.users WHERE role = 'customer'::public.app_role
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.wallets (user_id, balance)
SELECT id, 0.00 FROM public.users WHERE role = 'captain'::public.app_role
ON CONFLICT (user_id) DO NOTHING;


-- ========================================================
-- 5. Row Level Security Policies
-- ========================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captain_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- users policies
DROP POLICY IF EXISTS "Users view own row" ON public.users;
CREATE POLICY "Users view own row" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own row" ON public.users;
CREATE POLICY "Users update own row" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins view all users" ON public.users;
CREATE POLICY "Admins view all users" ON public.users FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Ride participants view each other users" ON public.users;
CREATE POLICY "Ride participants view each other users" ON public.users FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.status IN ('accepted'::ride_status, 'started'::ride_status)
      AND ((r.customer_id = auth.uid() AND r.captain_id = users.id)
        OR (r.captain_id = auth.uid() AND r.customer_id = users.id))
  )
);

-- ride_requests policies
DROP POLICY IF EXISTS "Captains view own ride requests" ON public.ride_requests;
CREATE POLICY "Captains view own ride requests" ON public.ride_requests FOR SELECT TO authenticated USING (captain_id = auth.uid());

DROP POLICY IF EXISTS "Customers view own ride requests" ON public.ride_requests;
CREATE POLICY "Customers view own ride requests" ON public.ride_requests FOR SELECT TO authenticated USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all ride requests" ON public.ride_requests;
CREATE POLICY "Admins view all ride requests" ON public.ride_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- payments policies
DROP POLICY IF EXISTS "Customers view own payments" ON public.payments;
CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT TO authenticated USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Captains view own payments" ON public.payments;
CREATE POLICY "Captains view own payments" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.rides r WHERE r.id = payments.ride_id AND r.captain_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins view all payments" ON public.payments;
CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- notifications policies
DROP POLICY IF EXISTS "Users view/manage own notifications" ON public.notifications;
CREATE POLICY "Users view/manage own notifications" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- captain_locations policies
DROP POLICY IF EXISTS "Anyone authenticated view captain locations" ON public.captain_locations;
CREATE POLICY "Anyone authenticated view captain locations" ON public.captain_locations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins view all captain locations" ON public.captain_locations;
CREATE POLICY "Admins view all captain locations" ON public.captain_locations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- emergency_alerts policies
DROP POLICY IF EXISTS "Admins manage emergency alerts" ON public.emergency_alerts;
CREATE POLICY "Admins manage emergency alerts" ON public.emergency_alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Ride participants insert alerts" ON public.emergency_alerts;
CREATE POLICY "Ride participants insert alerts" ON public.emergency_alerts FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = customer_id OR auth.uid() = captain_id
);

DROP POLICY IF EXISTS "Ride participants select alerts" ON public.emergency_alerts;
CREATE POLICY "Ride participants select alerts" ON public.emergency_alerts FOR SELECT TO authenticated USING (
  auth.uid() = customer_id OR auth.uid() = captain_id
);

-- support_tickets policies
DROP POLICY IF EXISTS "Users manage own support tickets" ON public.support_tickets;
CREATE POLICY "Users manage own support tickets" ON public.support_tickets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view/update support tickets" ON public.support_tickets;
CREATE POLICY "Admins view/update support tickets" ON public.support_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- wallets policies
DROP POLICY IF EXISTS "Users view own wallet" ON public.wallets;
CREATE POLICY "Users view own wallet" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view/update wallets" ON public.wallets;
CREATE POLICY "Admins view/update wallets" ON public.wallets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- wallet_transactions policies
DROP POLICY IF EXISTS "Users view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users view own transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins view wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admins view wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));


-- ========================================================
-- 6. Trigger side effects on Ride updates and Captain movements
-- ========================================================

-- Trigger for ride state changes, payments, wallets, notifications
CREATE OR REPLACE FUNCTION public.handle_ride_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap_record RECORD;
  cust_wallet_id uuid;
  cap_wallet_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 1. Notify customer
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      NEW.customer_id,
      'Ride Request Sent',
      'Searching for a captain near your location.',
      'new_ride_request'
    );

    -- 2. Broadcast to nearby captains (insert into ride_requests)
    FOR cap_record IN
      SELECT id FROM public.get_nearby_captains(NEW.vehicle_type, NEW.pickup_lat, NEW.pickup_lng, 5.0)
    LOOP
      INSERT INTO public.ride_requests (customer_id, ride_id, captain_id, request_status)
      VALUES (NEW.customer_id, NEW.id, cap_record.id, 'pending');

      -- Notify captain
      INSERT INTO public.notifications (user_id, title, body, type)
      VALUES (
        cap_record.id,
        'New Ride Request Nearby',
        'A ride is available near your current location.',
        'new_ride_request'
      );
    END LOOP;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status transitions
    IF NEW.status = 'accepted'::public.ride_status AND OLD.status = 'requested'::public.ride_status THEN
      -- 1. Notify customer
      INSERT INTO public.notifications (user_id, title, body, type)
      VALUES (
        NEW.customer_id,
        'Captain Assigned',
        'Your captain is on the way.',
        'captain_assigned'
      );

      -- 2. Update ride request
      UPDATE public.ride_requests
      SET request_status = 'accepted'
      WHERE ride_id = NEW.id AND captain_id = NEW.captain_id;

      UPDATE public.ride_requests
      SET request_status = 'rejected'
      WHERE ride_id = NEW.id AND captain_id <> NEW.captain_id;

    ELSIF NEW.status = 'started'::public.ride_status AND OLD.status = 'accepted'::public.ride_status THEN
      -- Notify customer
      INSERT INTO public.notifications (user_id, title, body, type)
      VALUES (
        NEW.customer_id,
        'Ride Started',
        'Have a safe trip!',
        'ride_started'
      );

    ELSIF NEW.status = 'completed'::public.ride_status AND OLD.status = 'started'::public.ride_status THEN
      -- 1. Notify customer
      INSERT INTO public.notifications (user_id, title, body, type)
      VALUES (
        NEW.customer_id,
        'Ride Completed',
        'Thank you for riding with us.',
        'ride_completed'
      );

      -- 2. Create Payment record
      INSERT INTO public.payments (ride_id, customer_id, amount, payment_method, payment_status, transaction_id)
      VALUES (
        NEW.id,
        NEW.customer_id,
        NEW.fare,
        'wallet',
        'completed',
        'TXN-' || encode(gen_random_bytes(6), 'hex')
      );

      -- 3. Settle wallets
      -- Fetch or create customer wallet
      INSERT INTO public.wallets (user_id, balance)
      VALUES (NEW.customer_id, 0.00)
      ON CONFLICT (user_id) DO NOTHING;
      
      SELECT id INTO cust_wallet_id FROM public.wallets WHERE user_id = NEW.customer_id;

      UPDATE public.wallets
      SET balance = balance - NEW.fare, updated_at = now()
      WHERE id = cust_wallet_id;

      INSERT INTO public.wallet_transactions (wallet_id, amount, type)
      VALUES (cust_wallet_id, NEW.fare, 'debit');

      -- Fetch or create captain wallet
      IF NEW.captain_id IS NOT NULL THEN
        INSERT INTO public.wallets (user_id, balance)
        VALUES (NEW.captain_id, 0.00)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT id INTO cap_wallet_id FROM public.wallets WHERE user_id = NEW.captain_id;

        UPDATE public.wallets
        SET balance = balance + NEW.fare, updated_at = now()
        WHERE id = cap_wallet_id;

        INSERT INTO public.wallet_transactions (wallet_id, amount, type)
        VALUES (cap_wallet_id, NEW.fare, 'credit');

        -- Notify captain of earnings
        INSERT INTO public.notifications (user_id, title, body, type)
        VALUES (
          NEW.captain_id,
          'Earnings Credited',
          'Fare of ₹' || NEW.fare || ' credited to your wallet.',
          'payment_success'
        );
      END IF;

    ELSIF NEW.status = 'cancelled'::public.ride_status AND OLD.status IN ('requested'::public.ride_status, 'accepted'::public.ride_status) THEN
      -- Notify customer and captain
      INSERT INTO public.notifications (user_id, title, body, type)
      VALUES (
        NEW.customer_id,
        'Ride Cancelled',
        'The ride has been cancelled.',
        'ride_cancelled'
      );

      IF NEW.captain_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, body, type)
        VALUES (
          NEW.captain_id,
          'Ride Cancelled by Customer',
          'The customer cancelled the ride request.',
          'ride_cancelled'
        );

        -- Update ride request status
        UPDATE public.ride_requests
        SET request_status = 'cancelled'
        WHERE ride_id = NEW.id AND captain_id = NEW.captain_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_ride_side_effects ON public.rides;
CREATE TRIGGER trg_handle_ride_side_effects
  AFTER INSERT OR UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.handle_ride_side_effects();

-- Trigger to track captain location movements
CREATE OR REPLACE FUNCTION public.track_captain_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.current_lat IS DISTINCT FROM OLD.current_lat) OR (NEW.current_lng IS DISTINCT FROM OLD.current_lng) THEN
    IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
      INSERT INTO public.captain_locations (captain_id, latitude, longitude)
      VALUES (NEW.id, NEW.current_lat, NEW.current_lng);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_captain_location ON public.captains;
CREATE TRIGGER trg_track_captain_location
  AFTER UPDATE ON public.captains
  FOR EACH ROW EXECUTE FUNCTION public.track_captain_location();

-- Trigger for emergency SOS realtime alerts
CREATE OR REPLACE FUNCTION public.handle_emergency_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_rec RECORD;
BEGIN
  FOR admin_rec IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      admin_rec.user_id,
      'EMERGENCY SOS ALERT',
      'An SOS alert was triggered for ride ' || COALESCE(NEW.ride_id::text, 'unknown'),
      'emergency_sos'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_emergency_alert ON public.emergency_alerts;
CREATE TRIGGER trg_handle_emergency_alert
  AFTER INSERT ON public.emergency_alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_emergency_alert();
