import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { pickup_lat, pickup_lng, vehicle_type, radius_km = 5.0 } = await req.json().catch(() => ({}));
    if (pickup_lat === undefined || pickup_lng === undefined || !vehicle_type) {
      return new Response(JSON.stringify({ error: "Missing pickup_lat, pickup_lng, or vehicle_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc("get_nearby_captains", {
      _vehicle: vehicle_type,
      _lat: Number(pickup_lat),
      _lng: Number(pickup_lng),
      _radius_km: Number(radius_km)
    });

    if (error) throw error;

    return new Response(JSON.stringify({ captains: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
