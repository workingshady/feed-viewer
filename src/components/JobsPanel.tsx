import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, MinusCircle, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { dismissJob, useJobs, type JobStep } from "@/lib/jobs";

const ICON: Record<JobStep["status"], { icon: typeof Circle; className: string }> = {
  pending: { icon: Circle, className: "text-muted-foreground" },
  running: { icon: Loader2, className: "animate-spin text-primary-text" },
  done: { icon: CheckCircle2, className: "text-success" },
  skipped: { icon: MinusCircle, className: "text-muted-foreground" },
  error: { icon: XCircle, className: "text-destructive-text" },
};

/** Floating bottom-right panel listing background jobs with per-step progress. */
export function JobsPanel() {
  const jobs = useJobs();
  const [collapsed, setCollapsed] = useState(false);
  if (jobs.length === 0) return null;
  return (
    <section
      aria-label="Background tasks"
      className="fixed bottom-4 right-4 z-[150] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex-1 text-sm font-semibold">Background tasks</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </header>
      {!collapsed && (
        <ul className="max-h-[50vh] divide-y overflow-y-auto">
          {jobs.map((job) => {
            const done = job.steps.filter((s) => s.status !== "pending" && s.status !== "running").length;
            return (
              <li key={job.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.title}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {done}/{job.steps.length}
                  </span>
                  {job.status !== "running" && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissJob(job.id)} aria-label="Dismiss">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Progress value={(done / Math.max(1, job.steps.length)) * 100} className="h-1.5" aria-label={`${job.title} progress`} />
                <ul className="space-y-1">
                  {job.steps.map((s, i) => {
                    const ic = ICON[s.status];
                    return (
                      <li key={i} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <ic.icon className={cn("h-3.5 w-3.5 shrink-0", ic.className)} aria-label={s.status} />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          {s.status === "running" && s.progress != null && (
                            <span className="font-mono tabular-nums text-muted-foreground">{Math.round(s.progress * 100)}%</span>
                          )}
                        </div>
                        {s.detail && <p className={cn("ml-5 truncate", s.status === "error" ? "text-destructive-text" : "text-muted-foreground")}>{s.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
