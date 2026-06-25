import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { vehicle_type, distance_km } = await req.json().catch(() => ({}));
    if (!vehicle_type || distance_km === undefined) {
      return new Response(JSON.stringify({ error: "Missing vehicle_type or distance_km" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    const base = vehicle_type === "bike" ? 20 : 30;
    const perKm = vehicle_type === "bike" ? 8 : 12;
    const fare = Math.round(base + perKm * Math.max(0, Number(distance_km)));
    return new Response(JSON.stringify({ fare }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
