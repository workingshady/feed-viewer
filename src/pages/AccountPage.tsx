import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/accountApi";
import { ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";

const AccountPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.message === "invalid_credentials"
          ? "Current password is incorrect."
          : "Could not change the password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Account</h1>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <span className="text-muted-foreground">Username</span>
            <span className="font-medium">{user?.username}</span>
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{roleLabel(user?.role)}</span>
            <span className="text-muted-foreground">Member since</span>
            <span className="font-medium">{memberSince}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw-current">Current password</Label>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-next">New password</Label>
                <Input
                  id="pw-next"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-confirm">Confirm new password</Label>
                <Input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive-text">
                  {error}
                </p>
              ) : null}
              {done ? <p className="text-sm text-[hsl(var(--success))]">Password changed.</p> : null}
              <Button type="submit" disabled={busy || !current || !next}>
                {busy ? "Saving…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Button variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </main>
    </div>
  );
};

export default AccountPage;
