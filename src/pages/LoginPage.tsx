import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === "invalid_credentials") return "Invalid username or password.";
    if (err.message === "too_many_attempts") return "Too many attempts. Try again in 15 minutes.";
  }
  return "Could not sign in. Please try again.";
}

function LoginPage() {
  const { login, user, isLoading } = useAuth();
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signup = useQuery({
    queryKey: ["signup-status"],
    queryFn: () => apiFetch<{ open: boolean; firstUser: boolean }>("/api/auth/signup-status"),
    staleTime: 60_000,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      setError(loginErrorMessage(err));
      if (err instanceof ApiError && err.message === "invalid_credentials") setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isLoading && user) return <Navigate to={redirectTo} replace />;

  if (isLoading) {
    return (
      <AuthPageLayout>
        <AuthCardLoader />
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <Card className="w-full rounded-xl border border-white/[0.1] bg-card/95 shadow-[var(--shadow-elevated)]">
        <CardHeader className="pb-5">
          <CardTitle className="font-heading text-2xl tracking-tight text-foreground">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
                className="h-11 min-h-[44px]"
              />
            </div>
            <PasswordField
              id="login-password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              invalid={!!error}
              describedBy={error ? "login-error" : undefined}
            />
            <div id="login-error" role="alert" className="text-sm text-destructive-text empty:hidden">
              {error}
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Forgot your password? Ask an administrator to reset it.
            </p>
          </form>
        </CardContent>
        {signup.data?.open ? (
          <CardFooter className="justify-center pt-0">
            <p className="text-sm text-foreground/75">
              New here?{" "}
              <Link to="/signup" className="font-medium text-primary-text hover:underline">
                Create an account
              </Link>
            </p>
          </CardFooter>
        ) : null}
      </Card>
    </AuthPageLayout>
  );
}

export default LoginPage;
