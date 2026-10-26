import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/** Full-screen bootstrap while `/api/auth/me` resolves (protected routes). */
export function AuthRouteLoader() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-9 w-9 animate-spin text-primary-text" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading your session…</p>
    </div>
  );
}

/** Card-sized bootstrap on login/signup before session is known. */
export function AuthCardLoader() {
  return (
    <Card className="mx-auto w-full max-w-md rounded-xl border border-border bg-card/95 shadow-[var(--shadow-elevated)] backdrop-blur-sm">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
        <Loader2 className="h-10 w-10 animate-spin text-primary-text" aria-hidden />
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </CardContent>
    </Card>
  );
}
