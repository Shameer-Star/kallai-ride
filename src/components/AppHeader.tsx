import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { RoleSwitcher } from "./RoleSwitcher";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/alertSound";
import { History, LogOut, Home, Shield, Bell, Check, Trash2 } from "lucide-react";
import { Card } from "./ui/card";
import { toast } from "sonner";

export function AppHeader() {
  const { signOut, role, activeRole, roles, user } = useAuth();
  const loc = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadNotifications() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (cancelled) return;
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.is_read).length);
      }
    }

    loadNotifications();

    const channel = supabase
      .channel(`header-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          toast.success(payload.new.title + ": " + payload.new.body);
          playNotificationSound();
          loadNotifications();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    // Click outside to close notification dropdown
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [user]);

  async function markAsRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }

  async function markAllAsRead() {
    if (notifications.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user!.id)
      .eq("is_read", false);
    if (error) {
      toast.error(error.message);
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    }
  }

  async function deleteNotification(id: string) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Notification deleted");
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center justify-between px-4 h-14">
        <Link to="/">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <RoleSwitcher />
          {activeRole && roles.length <= 1 && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-secondary text-secondary-foreground mr-1">
              {activeRole}
            </span>
          )}
          <Link to="/">
            <Button variant={loc.pathname === "/" ? "default" : "ghost"} size="icon">
              <Home className="h-4 w-4" />
            </Button>
          </Link>

          {/* Notifications Bell */}
          {user && (
            <div className="relative" ref={popoverRef}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive rounded-full text-[9px] text-white flex items-center justify-center font-bold animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </Button>

              {/* Notification Popover Dropdown */}
              {showNotifications && (
                <Card className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto z-50 p-3 shadow-2xl border-2 flex flex-col gap-2 rounded-xl bg-card">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-bold text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Check className="h-3.5 w-3.5" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 divide-y max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="text-center text-xs text-muted-foreground py-6">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.is_read && markAsRead(n.id)}
                          className={`py-2 flex items-start gap-2 justify-between cursor-pointer transition-all ${
                            !n.is_read ? "bg-primary/5 px-1.5 rounded" : "opacity-75"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate flex items-center gap-1.5">
                              {!n.is_read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              )}
                              {n.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                              {n.body}
                            </div>
                            <div className="text-[9px] text-muted-foreground mt-1">
                              {new Date(n.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="text-muted-foreground hover:text-destructive p-1 rounded transition-all shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              )}
            </div>
          )}

          {role === "admin" && (
            <Link to="/admin">
              <Button variant={loc.pathname === "/admin" ? "default" : "ghost"} size="icon">
                <Shield className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <Link to="/history">
            <Button variant={loc.pathname === "/history" ? "default" : "ghost"} size="icon">
              <History className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
