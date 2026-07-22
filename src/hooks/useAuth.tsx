import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "captain" | "admin";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  roles: AppRole[];
  activeRole: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  switchRole: (r: AppRole) => void;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  role: null,
  roles: [],
  activeRole: null,
  loading: true,
  signOut: async () => {},
  switchRole: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const bootedRef = useRef(false);

  async function fetchRoles(userId: string): Promise<AppRole[]> {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      const resolvedRoles = (data?.map((d: any) => d.role as AppRole)) ?? [];
      if (resolvedRoles.length > 0) {
        localStorage.setItem(`roles_${userId}`, JSON.stringify(resolvedRoles));
      } else {
        localStorage.removeItem(`roles_${userId}`);
      }
      return resolvedRoles;
    } catch (err) {
      console.error("fetchRoles error:", err);
      return [];
    }
  }

  function resolveActiveRole(userRoles: AppRole[], userId: string): AppRole | null {
    if (userRoles.length === 0) return null;
    // Check if user had a preferred role stored
    const preferred = localStorage.getItem(`activeRole_${userId}`);
    if (preferred && userRoles.includes(preferred as AppRole)) {
      return preferred as AppRole;
    }
    // Default priority: admin > captain > customer
    if (userRoles.includes("admin")) return "admin";
    // If has both, return the first one; user can switch via RoleSwitcher
    return userRoles[0];
  }

  const switchRole = useCallback((r: AppRole) => {
    if (user && roles.includes(r)) {
      setActiveRole(r);
      localStorage.setItem(`activeRole_${user.id}`, r);
    }
  }, [user, roles]);

  useEffect(() => {
    let active = true;

    async function checkUser() {
      try {
        const { data: { session: sess } } = await supabase.auth.getSession();
        if (!active) return;
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          // Try to load cached roles from localStorage for 0ms load delay
          const cached = localStorage.getItem(`roles_${sess.user.id}`);
          if (cached && active) {
            try {
              const cachedRoles = JSON.parse(cached) as AppRole[];
              setRoles(cachedRoles);
              setActiveRole(resolveActiveRole(cachedRoles, sess.user.id));
              setLoading(false); // Transition instantly to the route
            } catch { /* ignore parse errors */ }
          }
          
          // Revalidate in background to check if roles changed
          const userRoles = await fetchRoles(sess.user.id);
          if (active) {
            setRoles(userRoles);
            setActiveRole(resolveActiveRole(userRoles, sess.user.id));
          }
        } else {
          if (active) {
            setRoles([]);
            setActiveRole(null);
          }
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

        // Show loading spinner on fresh logins where no roles are cached yet
        const hasCachedRoles = !!localStorage.getItem(`roles_${sess.user.id}`);
        if (!hasCachedRoles) {
          setLoading(true);
        }
        try {
          const userRoles = await fetchRoles(sess.user.id);
          if (active) {
            setRoles(userRoles);
            setActiveRole(resolveActiveRole(userRoles, sess.user.id));
          }
        } catch (e) {
          console.error("Auth state change fetchRoles error:", e);
        } finally {
          if (active) setLoading(false);
        }
      } else {
        if (active) {
          setRoles([]);
          setActiveRole(null);
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
        localStorage.removeItem(`roles_${user.id}`);
        localStorage.removeItem(`activeRole_${user.id}`);
        // Clean up legacy single-role cache
        localStorage.removeItem(`role_${user.id}`);
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error("SignOut error:", err);
    } finally {
      setSession(null);
      setUser(null);
      setRoles([]);
      setActiveRole(null);
    }
  }

  // Backward compat: expose `role` as the active role
  const role = activeRole;

  return (
    <Ctx.Provider value={{ session, user, role, roles, activeRole, loading, signOut, switchRole }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
