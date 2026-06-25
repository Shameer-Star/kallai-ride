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
    const { user_id, amount, payment_method = "card" } = await req.json().catch(() => ({}));
    if (!user_id || amount === undefined) {
      return new Response(JSON.stringify({ error: "Missing user_id or amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch or create wallet
    const { data: wallet, error: getError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", user_id)
      .maybeSingle();

    if (getError) throw getError;

    let walletId = wallet?.id;
    let balance = Number(wallet?.balance ?? 0);

    if (!wallet) {
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert({ user_id, balance: 0.00 })
        .select()
        .single();
      if (createError) throw createError;
      walletId = newWallet.id;
    }

    const newBalance = balance + Number(amount);

    // Update wallet balance
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", walletId);

    if (updateError) throw updateError;

    // Create wallet transaction
    const { error: txnError } = await supabase
      .from("wallet_transactions")
      .insert({
        wallet_id: walletId,
        amount: Number(amount),
        type: "credit"
      });

    if (txnError) throw txnError;

    // Notify user
    await supabase.from("notifications").insert({
      user_id,
      title: "Wallet Credited",
      body: `Successfully added ₹${amount} to your wallet via ${payment_method}.`,
      type: "payment_success"
    });

    return new Response(JSON.stringify({ success: true, balance: newBalance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
