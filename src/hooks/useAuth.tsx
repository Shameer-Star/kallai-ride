import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "captain" | "admin";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe FIRST, then check session
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === "PASSWORD_RECOVERY") {
        window.location.hash = ""; // Clear hash
        window.location.pathname = "/reset-password";
        return;
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        await fetchRole(sess.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        await fetchRole(sess.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  }

  return (
    <Ctx.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
