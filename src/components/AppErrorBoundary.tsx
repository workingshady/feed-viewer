import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/telemetry";

type State = { error: Error | null };

/** Catches render crashes: shows a recovery screen instead of a blank page, and reports the error. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportClientError(error, "render");
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-warning" aria-hidden />
        <h1 className="font-heading text-2xl font-bold text-foreground">Something went wrong on this page</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The error was reported automatically. Reloading usually fixes it; your data is safe on the server.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => location.reload()}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reload page
          </Button>
          <Button variant="outline" onClick={() => location.assign("/")}>
            Go home
          </Button>
        </div>
      </div>
    );
  }
}
