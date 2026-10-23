import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  isGroupActive,
  isNavActive,
  userMenuItems,
  visibleNavGroups,
  visibleTopNav,
  type NavGroup,
  type NavItem,
} from "@/lib/appNav";
import { dispatchOpenCommandPalette } from "@/lib/commandPaletteBus";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useAppData } from "@/providers/DataProvider";
import { ChevronDown, LogIn, LogOut, Menu, Search, UserCircle, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandLogo, BrandMark } from "@/components/BrandLogo";
import { useSignupStatus } from "@/hooks/useSignupStatus";

/** Same surface as `HomeSectionNav` outer bar — one glass recipe site-wide */
const HEADER_GLASS =
  "border-b border-white/[0.07] bg-[#080808]/95 supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:bg-[#080808]/88 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)]";

const navPill = (opts: { hero: boolean; active: boolean }) =>
  cn(
    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    opts.hero
      ? opts.active
        ? "bg-white/20 text-white shadow-sm"
        : "text-white/85 hover:text-white hover:bg-white/10"
      : opts.active
        ? "bg-primary text-primary-foreground shadow-md"
        : "text-muted-foreground hover:text-foreground hover:bg-accent",
  );

const iconBtn = (hero: boolean) =>
  cn(
    "touch-manipulation flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl transition-colors shrink-0",
    hero ? "text-white/90 hover:text-white hover:bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-accent",
  );

function ScopeSwitcher({ className }: { className?: string }) {
  const { sources, scope, setScope } = useAppData();
  if (sources.length === 0) return null;
  const value = scope.mode === "agency" ? `agency:${scope.agencyName}` : "all";
  return (
    <Select
      value={value}
      onValueChange={(v) =>
        setScope(v.startsWith("agency:") ? { mode: "agency", agencyName: v.slice(7) } : { mode: "all" })
      }
    >
      <SelectTrigger aria-label="Scope" className={cn("h-9 text-xs rounded-full bg-background border-border", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All sources</SelectItem>
        {sources.map((s) => (
          <SelectItem key={s.id} value={`agency:${s.name}`}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GroupMenu({ group, pathname, hero }: { group: NavGroup; pathname: string; hero: boolean }) {
  const active = isGroupActive(pathname, group);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("group", navPill({ hero, active }))} data-active={active || undefined}>
          {group.heading}
          <ChevronDown
            className="w-3 h-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {group.items.map((item) => {
          const itemActive = isNavActive(pathname, item.to);
          return (
            <DropdownMenuItem key={item.to} asChild className={cn("cursor-pointer", itemActive && "bg-accent")}>
              <Link to={item.to} aria-current={itemActive ? "page" : undefined} className="flex items-center gap-2">
                <item.icon className="w-4 h-4 opacity-70" aria-hidden />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DrawerLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

const AppHeader = () => {
  const { pathname } = useLocation();
  const { user, logout, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrolledRef = useRef(false);

  /** rAF + hysteresis: avoids setState every scroll event and flutter around the hero fold */
  useEffect(() => {
    scrolledRef.current = window.scrollY > 20;
    setScrolled(scrolledRef.current);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        let next = scrolledRef.current;
        if (!next && y > 28) next = true;
        else if (next && y < 6) next = false;
        if (next !== scrolledRef.current) {
          scrolledRef.current = next;
          setScrolled(next);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const role = user?.role;
  const topNav = useMemo(() => visibleTopNav(Boolean(user)), [user]);
  const groups = useMemo(() => (user ? visibleNavGroups(role) : []), [user, role]);
  const accountItems = useMemo(() => (user ? userMenuItems(role) : []), [user, role]);

  const isHome = pathname === "/";
  const hero = isHome && !scrolled;
  const signupOpen = useSignupStatus().data?.open ?? false;
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || "");

  return (
    <>
      <header
        className={cn(
          "relative z-50",
          HEADER_GLASS,
          isHome ? "fixed top-0 left-0 right-0" : "sticky top-0",
          "pt-[env(safe-area-inset-top,0px)]",
        )}
      >
        <div
          aria-hidden
          className="h-px w-full bg-gradient-to-r from-transparent via-brand-green/30 to-transparent opacity-90"
        />
        <div className="w-full max-w-[1440px] mx-auto px-4 lg:px-5 flex items-center h-16 md:h-[72px] gap-2 lg:gap-4 min-w-0">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 min-w-0 shrink-0 group" aria-label="Feed Viewer Pro home">
            <BrandMark className="h-8 w-8 transition-transform duration-200 group-hover:scale-105" title="" />
            <span
              className={cn(
                "font-heading font-extrabold tracking-tight hidden sm:block truncate text-base",
                hero ? "text-white" : "text-foreground",
              )}
            >
              Feed Viewer <span className={hero ? "text-[#7FD8A9]" : "text-primary-text"}>Pro</span>
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="Main" className="hidden md:flex flex-1 items-center justify-center gap-1 min-w-0">
            {topNav.map((item) => {
              const active = isNavActive(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={navPill({ hero, active })}
                >
                  {item.label}
                </Link>
              );
            })}
            {groups.map((g) => (
              <GroupMenu key={g.id} group={g} pathname={pathname} hero={hero} />
            ))}
          </nav>
          <div className="flex-1 md:hidden" />

          {/* Right side */}
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
            {user && <ScopeSwitcher className="hidden md:flex w-36 lg:w-44" />}

            <button
              type="button"
              onClick={() => dispatchOpenCommandPalette()}
              aria-label="Open command palette"
              className={cn(
                "hidden md:flex items-center gap-2 rounded-full border px-3 h-9 text-xs transition-colors",
                hero
                  ? "border-white/20 text-white/85 hover:bg-white/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <Search className="w-3.5 h-3.5" aria-hidden />
              <kbd className="hidden lg:inline font-sans text-[11px] opacity-80">{isMac ? "⌘K" : "Ctrl+K"}</kbd>
            </button>

            <ThemeToggle />

            {!isLoading && user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="User menu"
                    className={cn(
                      "hidden md:flex items-center gap-2 rounded-full border px-2.5 h-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      hero
                        ? "border-white/20 text-white hover:bg-white/10"
                        : "border-border text-foreground hover:bg-accent",
                    )}
                  >
                    <UserCircle className="w-4 h-4" aria-hidden />
                    <span className="hidden lg:flex flex-col items-start leading-tight">
                      <span className="text-xs font-medium max-w-[8rem] truncate">{user.username}</span>
                      <span className="text-[10px] opacity-70">{roleLabel(role)}</span>
                    </span>
                    <ChevronDown className="w-3 h-3" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  <DropdownMenuLabel className="flex flex-col">
                    <span className="truncate">{user.username}</span>
                    <span className="text-xs font-normal text-muted-foreground">{roleLabel(role)}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accountItems.map((item) => (
                    <DropdownMenuItem key={item.to} asChild className="cursor-pointer">
                      <Link
                        to={item.to}
                        aria-current={isNavActive(pathname, item.to) ? "page" : undefined}
                        className="flex items-center gap-2"
                      >
                        <item.icon className="w-4 h-4 opacity-70" aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => void logout()}>
                    <LogOut className="w-4 h-4 mr-2 opacity-70" aria-hidden />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!isLoading && !user && (
              <div className="hidden md:flex items-center gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "rounded-full h-8 px-4",
                    hero
                      ? "text-white/90 hover:text-white hover:bg-white/10 border border-white/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Link to="/login">
                    <LogIn className="w-3.5 h-3.5 mr-1.5" />
                    Sign in
                  </Link>
                </Button>
                {signupOpen && (
                  <Button
                    asChild
                    size="sm"
                    className={cn(
                      "font-semibold rounded-full h-8 px-4 shadow-lg border-0",
                      hero
                        ? "bg-brand-green text-primary-foreground hover:bg-brand-green/90"
                        : "bg-secondary hover:bg-secondary/90 text-secondary-foreground",
                    )}
                  >
                    <Link to="/signup">
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Create account
                    </Link>
                  </Button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-main-nav"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className={cn("md:hidden", iconBtn(hero))}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer (Radix Sheet: focus trap + aria-modal) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="z-[100] md:hidden p-0 w-[min(22rem,calc(100vw-1rem))] max-w-[100vw] pt-[env(safe-area-inset-top,0px)]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-[100dvh] max-h-[100dvh] flex-col bg-card">
            <div className="flex items-center gap-2 px-4 h-16 border-b border-border shrink-0">
              <BrandLogo />
            </div>
            <nav
              id="mobile-main-nav"
              aria-label="Main"
              className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain py-3 px-3 flex flex-col gap-4 touch-pan-y"
            >
              {user && <ScopeSwitcher className="w-full" />}
              <div className="flex flex-col gap-0.5">
                {topNav.map((item) => (
                  <DrawerLink key={item.to} item={item} pathname={pathname} />
                ))}
              </div>
              {groups.map((g) => (
                <section key={g.id} aria-labelledby={`drawer-${g.id}`} className="flex flex-col gap-0.5">
                  <h2
                    id={`drawer-${g.id}`}
                    className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {g.heading}
                  </h2>
                  {g.items.map((item) => (
                    <DrawerLink key={item.to} item={item} pathname={pathname} />
                  ))}
                </section>
              ))}
              {accountItems.length > 0 && (
                <section aria-labelledby="drawer-account" className="flex flex-col gap-0.5">
                  <h2
                    id="drawer-account"
                    className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {user?.username} · {roleLabel(role)}
                  </h2>
                  {accountItems.map((item) => (
                    <DrawerLink key={item.to} item={item} pathname={pathname} />
                  ))}
                </section>
              )}
            </nav>
            <div className="shrink-0 border-t border-border p-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2 min-h-[44px]"
                onClick={() => {
                  setMobileOpen(false);
                  dispatchOpenCommandPalette();
                }}
              >
                <Search className="w-4 h-4" aria-hidden />
                Search
              </Button>
              {!isLoading && user ? (
                <Button
                  type="button"
                  variant="outline"
                  className="justify-start gap-2 min-h-[44px]"
                  onClick={() => void logout()}
                >
                  <LogOut className="w-4 h-4" aria-hidden />
                  Sign out
                </Button>
              ) : !isLoading ? (
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1 min-h-[44px]">
                    <Link to="/login">Sign in</Link>
                  </Button>
                  {signupOpen && (
                    <Button asChild className="flex-1 min-h-[44px]">
                      <Link to="/signup">Create account</Link>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AppHeader;
