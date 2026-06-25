import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Bike, User, Shield } from "lucide-react";

const ADMIN_EMAIL = "kallairideadmin@kallai.ride";

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "admin">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"customer" | "captain">("customer");
  const [vehicleType, setVehicleType] = useState<"bike" | "auto">("bike");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName, phone, role },
        },
      });
      if (error) throw error;
      // If captain, create captains row
      if (role === "captain" && data.user) {
        const { error: capErr } = await supabase
          .from("captains")
          .insert({ id: data.user.id, vehicle_type: vehicleType });
        if (capErr) console.error(capErr);
      }
      toast.success("Account created! You're signed in.");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (adminUser.trim() !== "kallairideadmin") {
      toast.error("Invalid admin username");
      return;
    }
    if (adminPass !== "ride123") {
      toast.error("Invalid admin password");
      return;
    }
    setSubmitting(true);
    try {
      // Ensure admin auth user exists & password is set (service-role on server)
      try {
        const { data: bootData, error: bootErr } = await supabase.functions.invoke(
          "admin-bootstrap",
          { body: { passcode: adminPass } }
        );
        if (bootErr) console.warn("Admin bootstrap edge function warning:", bootErr);
        if (bootData && !bootData.ok) console.warn("Admin bootstrap warning:", bootData.error);
      } catch (e) {
        console.warn("Could not invoke admin-bootstrap edge function, trying direct sign in:", e);
      }

      // Now sign in normally
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: adminPass,
      });
      if (signInErr) throw signInErr;

      toast.success("Admin access granted");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Admin login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/20 via-background to-background">
      <header className="p-4">
        <Logo size="md" />
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 shadow-[var(--shadow-soft)]">
          <h1 className="text-2xl font-bold mb-1">
            {mode === "signin" ? "வரவேற்கிறோம்" : "புதிய கணக்கு"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Welcome back to Adhaiyu Ride" : "Create your Adhaiyu Ride account"}
          </p>

          <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="mb-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="admin"><Shield className="h-3.5 w-3.5 mr-1" />Admin</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full h-11 font-bold" disabled={submitting}>
                  {submitting ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("customer")}
                    className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                      role === "customer" ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <User className="h-5 w-5" />
                    <span className="text-sm font-medium">Customer</span>
                    <span className="text-[10px] text-muted-foreground">வாடிக்கையாளர்</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("captain")}
                    className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                      role === "captain" ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <Bike className="h-5 w-5" />
                    <span className="text-sm font-medium">Captain</span>
                    <span className="text-[10px] text-muted-foreground">கேப்டன்</span>
                  </button>
                </div>

                {role === "captain" && (
                  <div className="space-y-1.5">
                    <Label>Vehicle Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["bike", "auto"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVehicleType(v)}
                          className={`p-2 rounded-lg border-2 capitalize ${
                            vehicleType === v ? "border-primary bg-primary/10" : "border-border"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full h-11 font-bold" disabled={submitting}>
                  {submitting ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-3 mt-4">
                <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground flex items-start gap-2">
                  <Shield className="h-3.5 w-3.5 mt-0.5" />
                  <span>Restricted access. Admin only.</span>
                </div>
                <div className="space-y-1.5">
                  <Label>Admin Username</Label>
                  <Input required value={adminUser} onChange={(e) => setAdminUser(e.target.value)} placeholder="kallairideadmin" autoComplete="username" />
                </div>
                <div className="space-y-1.5">
                  <Label>Admin Password</Label>
                  <Input type="password" required value={adminPass} onChange={(e) => setAdminPass(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full h-11 font-bold" disabled={submitting}>
                  {submitting ? "Verifying..." : "Enter Admin Panel"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
}
