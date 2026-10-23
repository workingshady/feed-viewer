import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/providers/AuthProvider";
import { useAppData } from "@/providers/DataProvider";
import { ACCOUNT_NAV_ITEM, ADMIN_NAV_ITEM, visibleNavGroups, visibleTopNav, type NavItem } from "@/lib/appNav";
import { COMPARE_UPDATED_EVENT, getCompareListingIds } from "@/lib/compareSelection";
import { getHomeSectionCommands } from "@/lib/homeSectionUrl";
import {
  clearRecentListings,
  getRecentListings,
  RECENT_LISTINGS_UPDATED_EVENT,
  type RecentListingEntry,
} from "@/lib/recentListings";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/lib/commandPaletteBus";
import { Clock, Download, House, Keyboard, ListTree, LogIn, Trash2, UserPlus } from "lucide-react";

export function AppCommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { listings } = useAppData();
  const [compareIds, setCompareIds] = useState(() => getCompareListingIds());
  const [recentListings, setRecentListings] = useState<RecentListingEntry[]>(() => getRecentListings());

  useEffect(() => {
    const sync = () => setCompareIds(getCompareListingIds());
    sync();
    window.addEventListener(COMPARE_UPDATED_EVENT, sync);
    return () => window.removeEventListener(COMPARE_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => setRecentListings(getRecentListings());
    sync();
    window.addEventListener(RECENT_LISTINGS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(RECENT_LISTINGS_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onBus = () => setOpen(true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onBus);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onBus);
  }, []);

  const go = useCallback(
    (to: string) => {
      setOpen(false);
      navigate(to);
    },
    [navigate],
  );

  const topNav = useMemo(() => visibleTopNav(Boolean(user)), [user]);
  const navGroups = useMemo(() => (user ? visibleNavGroups(user.role) : []), [user]);
  const accountNav = useMemo((): NavItem[] => {
    if (!user) return [];
    return user.role === "admin" ? [ACCOUNT_NAV_ITEM, ADMIN_NAV_ITEM] : [ACCOUNT_NAV_ITEM];
  }, [user]);

  const listingItems = useMemo(() => {
    if (!user) return [];
    return listings.slice(0, 80).map((l) => ({
      id: l.id,
      title: l.title || l.reference || l.id,
      ref: l.reference,
    }));
  }, [listings, user]);

  const canCompare = compareIds.length >= 2;

  const homeSectionItems = useMemo(
    () => getHomeSectionCommands(listings.length > 0),
    [listings.length],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and listings…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {!user && (
          <CommandGroup heading="Account">
            <CommandItem onSelect={() => go("/login")}>
              <LogIn className="mr-2 h-4 w-4 opacity-70" />
              Login
            </CommandItem>
            <CommandItem onSelect={() => go("/signup")}>
              <UserPlus className="mr-2 h-4 w-4 opacity-70" />
              Sign up
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup heading="Home — jump to section">
          {homeSectionItems.map((s) => (
            <CommandItem
              key={s.slug}
              value={`home section ${s.label} ${s.slug} ${s.hint ?? ""}`}
              onSelect={() => {
                setOpen(false);
                navigate(`/?section=${encodeURIComponent(s.slug)}`);
              }}
            >
              <House className="mr-2 h-4 w-4 opacity-70" aria-hidden />
              {s.label}
              <CommandShortcut className="opacity-60">
                {pathname === "/" ? `#${s.slug}` : `/?section=${s.slug}`}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Site">
          <CommandItem value="site map sitemap all pages routes directory" onSelect={() => go("/sitemap")}>
            <ListTree className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
            Site map (all pages)
            <CommandShortcut className="opacity-60">/sitemap</CommandShortcut>
          </CommandItem>
          <CommandItem value="keyboard shortcuts hotkeys reference help" onSelect={() => go("/shortcuts")}>
            <Keyboard className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
            Keyboard shortcuts
            <CommandShortcut className="opacity-60">/shortcuts</CommandShortcut>
          </CommandItem>
          <CommandItem value="export hub csv download data leave feedview" onSelect={() => go("/export-hub")}>
            <Download className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
            Export hub
            <CommandShortcut className="opacity-60">/export-hub</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {topNav.map((item) => (
            <CommandItem key={item.to + item.label} value={`${item.label} ${item.to} ${item.description ?? ""}`} onSelect={() => go(item.to)}>
              <item.icon className="mr-2 h-4 w-4 opacity-70" />
              {item.label}
              <CommandShortcut className="opacity-60">{item.to}</CommandShortcut>
            </CommandItem>
          ))}
          {accountNav.map((item) => (
            <CommandItem key={item.to + item.label} value={`${item.label} ${item.to} ${item.description ?? ""}`} onSelect={() => go(item.to)}>
              <item.icon className="mr-2 h-4 w-4 opacity-70" />
              {item.label}
              <CommandShortcut className="opacity-60">{item.to}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {navGroups.map((g) => (
          <CommandGroup key={g.id} heading={g.heading}>
            {g.items.map((item) => (
            <CommandItem key={item.to + item.label} value={`${item.label} ${item.to} ${item.description ?? ""}`} onSelect={() => go(item.to)}>
              <item.icon className="mr-2 h-4 w-4 opacity-70" />
              {item.label}
              <CommandShortcut className="opacity-60">{item.to}</CommandShortcut>
            </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {user && canCompare && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Compare workspace">
              <CommandItem value="open compare page" onSelect={() => go("/compare")}>
                Open compare ({compareIds.length} listings)
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {user && recentListings.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recently viewed">
              {recentListings.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`recent ${r.title} ${r.reference} ${r.id}`}
                  onSelect={() => go(`/listing/${encodeURIComponent(r.id)}`)}
                >
                  <Clock className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                  <span className="truncate">{r.title || r.reference || r.id}</span>
                  <CommandShortcut className="font-mono text-[10px] opacity-70">{r.reference || r.id.slice(0, 8)}</CommandShortcut>
                </CommandItem>
              ))}
              <CommandItem
                value="clear recent listing history"
                onSelect={() => {
                  clearRecentListings();
                }}
                className="text-muted-foreground"
              >
                <Trash2 className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
                Clear recent history
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {user && listingItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Listings">
              {listingItems.map((l) => (
                <CommandItem
                  key={l.id}
                  value={`${l.title} ${l.ref ?? ""} ${l.id}`}
                  onSelect={() => go(`/listing/${encodeURIComponent(l.id)}`)}
                >
                  <span className="truncate">{l.title}</span>
                  <CommandShortcut className="font-mono text-[10px] opacity-70">{l.ref || l.id.slice(0, 8)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
