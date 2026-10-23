import { cn } from "@/lib/utils";

/**
 * Feed Viewer Pro mark: a roof over stacked layers — property feeds and their versions, with the
 * live layer highlighted. Single bold shapes so it stays legible down to 16px.
 */
export function BrandMark({ className, title = "Feed Viewer Pro" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} role="img" aria-label={title}>
      <rect width="32" height="32" rx="7" fill="hsl(var(--sb-green))" />
      <path
        d="M7.5 15.5 16 8l8.5 7.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19.5h12" stroke="#7FD8A9" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 24.5h8" stroke="#fff" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className="h-7 w-7" title="" />
      {!compact && (
        <span className="font-heading text-base font-extrabold tracking-tight text-foreground">
          Feed Viewer <span className="text-primary-text">Pro</span>
        </span>
      )}
      <span className="sr-only">Feed Viewer Pro</span>
    </span>
  );
}
