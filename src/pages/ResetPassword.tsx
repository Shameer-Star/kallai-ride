import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password reset successful! Please sign in.");
      
      // Sign out to clear any temporary recovery session
      await supabase.auth.signOut();
      
      navigate("/auth", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reset password");
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
          <h1 className="text-2xl font-bold mb-1">மீட்டமைக்கவும்</h1>
          <p className="text-sm text-muted-foreground mb-6">Enter your new password</p>

          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="text-[11px] mt-1">
                {password.length > 0 && password.length < 6 ? (
                  <span className="text-destructive font-medium">⚠️ Password must be at least 6 characters</span>
                ) : password.length >= 6 ? (
                  <span className="text-green-600 font-medium">✅ Valid password length</span>
                ) : (
                  <span className="text-muted-foreground">Must be at least 6 characters</span>
                )}
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-bold" disabled={submitting}>
              {submitting ? "Resetting..." : "Update Password"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
