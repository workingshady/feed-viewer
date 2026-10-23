import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { AuthCardLoader } from "@/components/auth/AuthLoadingState";
import { AuthPageLayout } from "@/components/auth/AuthPageLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

type LocationState = { from?: Location };

const CLOSED_TEXT = "Sign-up is closed. Ask an administrator for an account.";
const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/;

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === "username_taken") return "That username is taken.";
    if (err.message === "signup_closed") return CLOSED_TEXT;
  }
  return "Could not create the account. Please try again.";
}

function SignUpPage() {
  const { register, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  const redirectTo = useMemo(() => {
    const from = state?.from;
    if (from?.pathname) return `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
    return "/";
  }, [state]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["signup-status"],
    queryFn: () => apiFetch<{ open: boolean; firstUser: boolean }>("/api/auth/signup-status"),
    staleTime: 0,
  });

  const passwordOk = password.length >= 8;
  const mismatch = confirmTouched && confirm !== password;
  const usernameProblem = !USERNAME_RE.test(username.trim());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setConfirmTouched(true);
    if (usernameProblem) return setError("Username must be 3–32 characters: letters, numbers, underscores, or hyphens.");
    if (!passwordOk) return setError("Password must be at least 8 characters.");
    if (confirm !== password) return setError("Passwords do not match.");
    setSubmitting(true);
    setError(null);
    try {
      await register(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoading && user) return <Navigate to={redirectTo} replace />;

  if (isLoading || status.isLoading) {
    return (
      <AuthPageLayout>
        <AuthCardLoader />
      </AuthPageLayout>
    );
  }

  if (!status.data?.open) {
    return (
      <AuthPageLayout>
        <Card className="w-full rounded-xl border border-white/[0.1] bg-card/95 shadow-[var(--shadow-elevated)]">
          <CardContent className="space-y-4 pt-6 text-center">
            <p className="text-sm text-foreground/80">{CLOSED_TEXT}</p>
            <Link to="/login" className="text-sm font-medium text-primary-text hover:underline">
              Sign in
            </Link>
          </CardContent>
        </Card>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <Card className="w-full rounded-xl border border-white/[0.1] bg-card/95 shadow-[var(--shadow-elevated)]">
        <CardHeader className="pb-5">
          <CardTitle className="font-heading text-2xl tracking-tight text-foreground">Create account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {status.data.firstUser ? (
              <p className="text-sm text-foreground/75">This first account will be the administrator.</p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="signup-username">Username</Label>
              <Input
                id="signup-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "signup-error" : undefined}
                className="h-11 min-h-[44px]"
              />
            </div>
            <PasswordField
              id="signup-password"
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              describedBy="signup-password-hint"
            >
              <p
                id="signup-password-hint"
                className={`flex items-center gap-1 text-xs ${passwordOk ? "text-[hsl(var(--success))]" : "text-muted-foreground"}`}
              >
                {passwordOk ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                At least 8 characters
              </p>
            </PasswordField>
            <PasswordField
              id="signup-confirm"
              label="Confirm password"
              autoComplete="new-password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setConfirmTouched(true);
              }}
              invalid={mismatch}
              describedBy={mismatch ? "signup-confirm-error" : undefined}
              showCapsLockWarning={false}
            >
              {mismatch ? (
                <p id="signup-confirm-error" className="text-xs text-destructive-text">
                  Passwords do not match.
                </p>
              ) : null}
            </PasswordField>
            <div id="signup-error" role="alert" className="text-sm text-destructive-text empty:hidden">
              {error}
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center pt-0">
          <p className="text-sm text-foreground/75">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary-text hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthPageLayout>
  );
}

export default SignUpPage;
