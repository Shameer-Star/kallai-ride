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
    const { ride_id } = await req.json().catch(() => ({}));
    if (!ride_id) {
      return new Response(JSON.stringify({ error: "Missing ride_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: ride, error: getError } = await supabase
      .from("rides")
      .select("customer_id, captain_id, fare, distance_km, created_at, completed_at")
      .eq("id", ride_id)
      .single();

    if (getError) throw getError;

    let isSuspect = false;
    const reasons: string[] = [];

    // Check fare / distance ratio
    const ratio = Number(ride.fare) / Math.max(0.1, Number(ride.distance_km));
    if (ratio > 100) {
      isSuspect = true;
      reasons.push("Excessive fare for distance");
    } else if (ratio < 2) {
      isSuspect = true;
      reasons.push("Suspiciously low fare for distance");
    }

    // Check speed (if completed)
    if (ride.completed_at && ride.created_at) {
      const durationHours = (new Date(ride.completed_at).getTime() - new Date(ride.created_at).getTime()) / (1000 * 60 * 60);
      if (durationHours > 0) {
        const speedKmh = Number(ride.distance_km) / durationHours;
        if (speedKmh > 120) {
          isSuspect = true;
          reasons.push(`Physically improbable speed: ${speedKmh.toFixed(1)} km/h`);
        }
      }
    }

    return new Response(JSON.stringify({ suspect: isSuspect, reasons }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
