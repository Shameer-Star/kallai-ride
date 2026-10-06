-- Migration: Payment system improvements
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS payment_status text not null default 'pending';

CREATE OR REPLACE FUNCTION public.verify_ride_payment(_ride_id uuid, _method text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ride record;
BEGIN
  -- 1. Fetch ride details
  SELECT * INTO v_ride FROM public.rides WHERE id = _ride_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 2. Update rides table payment status
  UPDATE public.rides 
  SET payment_status = 'success' 
  WHERE id = _ride_id;

  -- 3. Insert payments record securely on the backend to avoid duplicates
  INSERT INTO public.payments (ride_id, customer_id, amount, payment_method, payment_status, transaction_id)
  SELECT _ride_id, v_ride.customer_id, v_ride.fare, _method, 'success', 'TXN-' || upper(substr(md5(random()::text), 1, 8))
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payments WHERE ride_id = _ride_id AND payment_status = 'success'
  );

  -- 4. Notify Customer
  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (
    v_ride.customer_id,
    'Payment Successful',
    'Your payment of ₹' || v_ride.fare || ' has been verified successfully.',
    'payment_success'
  );

  -- 5. Notify Captain
  IF v_ride.captain_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      v_ride.captain_id,
      'Payment Received',
      'Payment of ₹' || v_ride.fare || ' received successfully for the ride.',
      'payment_success'
    );
  END IF;

  RETURN true;
END;
$$;
