import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
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
  const bootedRef = useRef(false);

  async function fetchRole(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      const resolvedRole = (data?.role as AppRole) ?? null;
      if (resolvedRole) {
        localStorage.setItem(`role_${userId}`, resolvedRole);
      } else {
        localStorage.removeItem(`role_${userId}`);
      }
      return resolvedRole;
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
          // Try to load cached role from localStorage for 0ms load delay
          const cached = localStorage.getItem(`role_${sess.user.id}`);
          if (cached && active) {
            setRole(cached as AppRole);
            setLoading(false); // Transition instantly to the route
          }
          
          // Revalidate in background to check if the role changed
          const userRole = await fetchRole(sess.user.id);
          if (active) {
            setRole(userRole);
          }
        } else {
          if (active) setRole(null);
        }
      } catch (err) {
        console.error("Session initialization error:", err);
      } finally {
        if (active) {
          bootedRef.current = true;
          setLoading(false);
        }
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
        // If we haven't completed checkUser yet, let checkUser handle loading & role fetching
        if (!bootedRef.current) {
          return;
        }

        // Show loading spinner on fresh logins where no role is cached yet
        const hasCachedRole = !!localStorage.getItem(`role_${sess.user.id}`);
        if (!hasCachedRole) {
          setLoading(true);
        }
        try {
          const userRole = await fetchRole(sess.user.id);
          if (active) setRole(userRole);
        } catch (e) {
          console.error("Auth state change fetchRole error:", e);
        } finally {
          if (active) setLoading(false);
        }
      } else {
        if (active) {
          setRole(null);
          // If we haven't booted, let checkUser release loading state
          if (bootedRef.current) {
            setLoading(false);
          }
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
      if (user) {
        localStorage.removeItem(`role_${user.id}`);
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error("SignOut error:", err);
    } finally {
      setSession(null);
      setUser(null);
      setRole(null);
    }
  }

  return (
    <Ctx.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
