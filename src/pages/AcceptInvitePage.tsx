import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Link2Off, Loader2 } from "lucide-react";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { acceptInvite, getInvite } from "@/lib/accessApi";
import { roleLabel } from "@/lib/roles";
import { useAuth } from "@/providers/AuthProvider";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/;

/** Opened from an invite link (create an account) or a reset link (choose a new password). */
export default function AcceptInvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => getInvite(token), retry: false });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (invite.isLoading) {
    return (
      <AuthPageLayout>
        <p className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Checking link" />
        </p>
      </AuthPageLayout>
    );
  }
  if (invite.error || !invite.data) {
    return (
      <AuthPageLayout>
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Link2Off className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">This link isn't valid anymore</p>
            <p className="text-sm text-muted-foreground">Links work once and expire. Ask your administrator for a new one.</p>
            <Button asChild variant="outline">
              <Link to="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthPageLayout>
    );
  }

  const isReset = invite.data.kind === "reset";
  const usernameOk = isReset || USERNAME_RE.test(username);
  const passwordOk = password.length >= 8;
  const match = password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!usernameOk || !passwordOk || !match) return;
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(token, { username: isReset ? undefined : username.trim(), password });
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.message : "";
      setError(
        code === "username_taken"
          ? "That username is taken."
          : code === "invalid_link"
            ? "This link was just used or expired. Ask for a new one."
            : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPageLayout>
      <Card>
        <CardHeader>
          <CardTitle>{isReset ? `Choose a new password` : "Create your account"}</CardTitle>
          <CardDescription>
            {isReset
              ? `For ${invite.data.username}. You'll be signed out on other devices.`
              : `You've been invited as ${roleLabel(invite.data.role)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {!isReset && (
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  aria-invalid={touched && !usernameOk}
                  aria-describedby="username-hint"
                  className="h-11"
                />
                <p id="username-hint" className="text-xs text-muted-foreground">
                  3–32 letters, numbers, - or _
                </p>
              </div>
            )}
            <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" invalid={touched && !passwordOk} showCapsLockWarning>
              <p className={`flex items-center gap-1 text-xs ${passwordOk ? "text-success" : "text-muted-foreground"}`}>
                {passwordOk && <Check className="h-3 w-3" aria-hidden />} At least 8 characters
              </p>
            </PasswordField>
            <PasswordField id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={touched && !match}>
              {touched && !match && <p className="text-xs text-destructive-text">Passwords do not match.</p>}
            </PasswordField>
            {error && (
              <p role="alert" className="text-sm text-destructive-text">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isReset ? "Save new password" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthPageLayout>
  );
}
