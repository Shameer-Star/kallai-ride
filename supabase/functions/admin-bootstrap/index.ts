// Bootstrap / reset the Adhaiyur Ride admin auth user using the service role.
// Validates a hardcoded passcode before doing anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ADMIN_EMAIL = "admin@adhaiyur.ride";
const ADMIN_PASSCODE_1 = "ride123";
const ADMIN_PASSCODE_2 = "ride123.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { passcode } = await req.json().catch(() => ({}));
    if (passcode !== ADMIN_PASSCODE_1 && passcode !== ADMIN_PASSCODE_2) {
      return new Response(JSON.stringify({ error: "Invalid passcode" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find existing user by email
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);

    let userId: string;
    if (!existing) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: passcode,
        email_confirm: true,
        user_metadata: { full_name: "Adhaiyur Ride Admin", role: "customer" },
      });
      if (createErr) throw createErr;
      userId = created.user!.id;
    } else {
      userId = existing.id;
      // Reset password + confirm email to guarantee sign-in works
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password: passcode,
        email_confirm: true,
      });
      if (updErr) throw updErr;
    }

    // Grant admin role, remove customer role
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role" }
    );
    await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "customer");

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
