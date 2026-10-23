import { hrefToSectionSlug } from "@/lib/homeSectionUrl";
import { cn } from "@/lib/utils";
import { startTransition, useEffect, useRef, useState, type MouseEvent } from "react";

export type HomeSectionNavLink = { href: string; label: string; hint?: string };

export type HomeSectionNavActiveInfo = {
  href: string | null;
  /** 0-based index into `links`, or 0 when none matched */
  index: number;
  total: number;
  /** URL query value without #section- prefix */
  slug: string | null;
};

type Props = {
  links: readonly HomeSectionNavLink[];
  /** Fired when scroll-spy changes the active section (throttle in parent if needed). */
  onActiveChange?: (info: HomeSectionNavActiveInfo) => void;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Sticky section jumper with scroll-spy. `top` matches AppHeader (5rem) + safe-area inset.
 * On the home page, render this below the hero so the intro stays uninterrupted.
 */
const SPY_SETTLE_MS = 220;

export function HomeSectionNav({ links, onActiveChange }: Props) {
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const activeHrefRef = useRef<string | null>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const listRef = useRef<HTMLUListElement>(null);
  const spyDebounceRef = useRef<number | null>(null);
  const spyPendingHrefRef = useRef<string | null>(null);

  useEffect(() => {
    activeHrefRef.current = activeHref;
  }, [activeHref]);

  useEffect(() => {
    const ids = links.map((l) => l.href.replace(/^#/, "")).filter(Boolean);
    const elements = ids.map((id) => document.getElementById(id)).filter((n): n is HTMLElement => Boolean(n));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.target.id)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        const top = visible[0];
        const next = top?.target?.id ? `#${top.target.id}` : null;
        if (!next) return;
        if (next === activeHrefRef.current) return;
        if (next === spyPendingHrefRef.current && spyDebounceRef.current !== null) return;
        spyPendingHrefRef.current = next;
        if (spyDebounceRef.current !== null) window.clearTimeout(spyDebounceRef.current);
        spyDebounceRef.current = window.setTimeout(() => {
          spyDebounceRef.current = null;
          startTransition(() => setActiveHref(spyPendingHrefRef.current!));
        }, SPY_SETTLE_MS);
      },
      {
        root: null,
        rootMargin: "-96px 0px -52% 0px",
        threshold: [0, 0.35],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => {
      if (spyDebounceRef.current !== null) window.clearTimeout(spyDebounceRef.current);
      observer.disconnect();
    };
  }, [links]);

  useEffect(() => {
    const cb = onActiveChangeRef.current;
    if (!cb) return;
    const idx = activeHref ? links.findIndex((l) => l.href === activeHref) : -1;
    const index = idx >= 0 ? idx : 0;
    const slug = activeHref ? hrefToSectionSlug(activeHref) : null;
    cb({ href: activeHref, index, total: links.length, slug });
  }, [activeHref, links]);

  const onJumpClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace(/^#/, "");
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = prefersReducedMotion();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    try {
      const u = new URL(window.location.href);
      u.hash = id;
      history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
    } catch {
      /* ignore */
    }
  };

  return (
    <nav
      aria-label="On this page"
      className={cn(
        "sticky z-30 top-[calc(5rem+env(safe-area-inset-top,0px))]",
        "border-b border-white/[0.07]",
        "bg-[#080808]/95 supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:bg-[#080808]/88",
        "shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)]",
      )}
    >
      <div
        aria-hidden
        className="h-px w-full bg-gradient-to-r from-transparent via-brand-green/30 to-transparent opacity-90"
      />
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex justify-center w-full min-w-0">
          <ul
            ref={listRef}
            className={cn(
              "flex items-center gap-2 sm:gap-2.5 max-w-[920px] mx-auto w-full min-w-0",
              "max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overflow-y-visible max-sm:justify-start max-sm:overscroll-x-contain max-sm:scroll-pl-2 max-sm:scroll-pr-2 max-sm:[scrollbar-width:thin]",
              "sm:flex-wrap sm:justify-center",
              "px-1 sm:px-2 py-1 rounded-2xl sm:rounded-3xl",
              "border border-white/[0.09] bg-white/[0.03]",
              "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
            )}
          >
            {links.map((j) => {
              const isActive = activeHref === j.href;
              return (
                <li key={j.href} className="shrink-0">
                  <a
                    href={j.href}
                    title={j.hint ?? j.label}
                    aria-current={isActive ? "location" : undefined}
                    onClick={(e) => onJumpClick(e, j.href)}
                    className={cn(
                      "inline-flex min-h-[2.5rem] sm:min-h-[2.35rem] items-center justify-center rounded-full border px-3.5 sm:px-4 py-2 text-center",
                      "text-[11px] font-semibold uppercase tracking-[0.12em] font-body",
                      "transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out",
                      "whitespace-nowrap active:scale-[0.98]",
                      "motion-reduce:transition-none motion-reduce:active:scale-100",
                      isActive
                        ? cn(
                            "border-brand-green/50 bg-gradient-to-b from-brand-green/25 to-brand-green/10 text-white",
                            "shadow-[0_0_0_1px_hsl(153_42%_42%_/_0.28),0_4px_20px_-8px_hsl(153_42%_38%_/_0.4)]",
                          )
                        : cn(
                            "border-transparent bg-transparent text-white/65",
                            "hover:border-white/12 hover:bg-white/[0.05] hover:text-white",
                          ),
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green/55",
                    )}
                  >
                    {j.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
