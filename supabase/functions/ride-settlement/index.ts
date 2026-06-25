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
      .select("customer_id, captain_id, fare, status, payment_status")
      .eq("id", ride_id)
      .single();

    if (getError) throw getError;

    if (ride.status !== "completed") {
      return new Response(JSON.stringify({ error: "Ride is not completed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (ride.payment_status === "completed") {
      return new Response(JSON.stringify({ success: true, message: "Ride already settled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: updateError } = await supabase
      .from("rides")
      .update({ payment_status: "completed" })
      .eq("id", ride_id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, message: "Ride settled successfully" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
