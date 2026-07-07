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

  async function fetchRole(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole) ?? null;
    } catch (err) {
      console.error("fetchRole error:", err);
      return null;
    }
  }

  useEffect(() => {
    let active = true;

    async function checkUser() {
      try {
        const { data: { session: sess } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          const userRole = await fetchRole(sess.user.id);
          if (active) setRole(userRole);
        } else {
          if (active) setRole(null);
        }
      } catch (err) {
        console.error("Session initialization error:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    checkUser();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        window.location.hash = ""; // Clear hash
        window.location.pathname = "/reset-password";
        return;
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setLoading(true);
        const userRole = await fetchRole(sess.user.id);
        if (active) {
          setRole(userRole);
          setLoading(false);
        }
      } else {
        if (active) {
          setRole(null);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      setLoading(true);
      await supabase.auth.signOut();
    } catch (err) {
      console.error("SignOut error:", err);
    } finally {
      setSession(null);
      setUser(null);
      setRole(null);
      setLoading(false);
    }
  }

  return (
    <Ctx.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
