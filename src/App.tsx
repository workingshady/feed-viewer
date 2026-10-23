import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/providers/AuthProvider";
import { DataProvider } from "@/providers/DataProvider";
import { RequireAuth, RequireRole } from "@/components/auth/RequireAuth";
import { AppCommandPalette } from "@/components/AppCommandPalette";
import { CompareTray } from "@/components/CompareTray";
import { SiteFooterGate } from "@/components/SiteFooter";

const Index = lazy(() => import("./pages/Index"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));
const ListingsPage = lazy(() => import("./pages/ListingsPage"));
const ListingDetailPage = lazy(() => import("./pages/ListingDetailPage"));
const MappingPage = lazy(() => import("./pages/MappingPage"));
const AgenciesPage = lazy(() => import("./pages/AgenciesPage"));
const AgencyDetailPage = lazy(() => import("./pages/AgencyDetailPage"));
const AgencyAgentDetailPage = lazy(() => import("./pages/AgencyAgentDetailPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const AgentDetailPage = lazy(() => import("./pages/AgentDetailPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ValidationPage = lazy(() => import("./pages/ValidationPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const DatabasePage = lazy(() => import("./pages/DatabasePage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const FeedComparePage = lazy(() => import("./pages/FeedComparePage"));
const CrossAgencyDupesPage = lazy(() => import("./pages/CrossAgencyDupesPage"));
const FieldQualityPage = lazy(() => import("./pages/FieldQualityPage"));
const GeoPointsPage = lazy(() => import("./pages/GeoPointsPage"));
const WorkspaceInsightsPage = lazy(() => import("./pages/WorkspaceInsightsPage"));
const SitemapPage = lazy(() => import("./pages/SitemapPage"));
const ShortcutsHelpPage = lazy(() => import("./pages/ShortcutsHelpPage"));
const ExportHubPage = lazy(() => import("./pages/ExportHubPage"));
const MappingQaPage = lazy(() => import("./pages/MappingQaPage"));
const RandomListingPage = lazy(() => import("./pages/RandomListingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Signed-in pages. Every role can open them; editing controls inside are role-gated. */
const PROTECTED: [string, LazyExoticComponent<ComponentType>][] = [
  ["/sources", SourcesPage],
  ["/listings", ListingsPage],
  ["/database", DatabasePage],
  ["/favorites", FavoritesPage],
  ["/listing/:id", ListingDetailPage],
  ["/random-listing", RandomListingPage],
  ["/field-mapping", MappingPage],
  ["/validation", ValidationPage],
  ["/compare", ComparePage],
  ["/feed-compare", FeedComparePage],
  ["/cross-agency-dupes", CrossAgencyDupesPage],
  ["/field-quality", FieldQualityPage],
  ["/mapping-qa", MappingQaPage],
  ["/listings/map", GeoPointsPage],
  ["/workspace-insights", WorkspaceInsightsPage],
  ["/agencies", AgenciesPage],
  ["/agencies/:name", AgencyDetailPage],
  ["/agencies/:agency/agents/:agent", AgencyAgentDetailPage],
  ["/agents", AgentsPage],
  ["/agents/:name", AgentDetailPage],
  ["/account", AccountPage],
  ["/account/profile", AccountPage],
];

/** Old URLs kept working after the import/streaming pages were folded into Sources. */
const REDIRECTS: [string, string][] = [
  ["/import", "/sources"],
  ["/import-dashboard", "/sources"],
  ["/stream-feeds", "/sources"],
  ["/streaming", "/sources"],
  ["/workspace", "/account"],
  ["/mapping", "/field-mapping"],
  ["/geo", "/listings/map"],
  ["/insights", "/workspace-insights"],
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary-text" aria-hidden />
      <p className="text-sm">Loading…</p>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
            <AppCommandPalette />
            <CompareTray />
            <div className="flex min-h-[100dvh] flex-col">
              <div className="flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/sitemap" element={<SitemapPage />} />
                    <Route path="/shortcuts" element={<ShortcutsHelpPage />} />
                    <Route path="/export-hub" element={<ExportHubPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignUpPage />} />
                    {PROTECTED.map(([path, Page]) => (
                      <Route
                        key={path}
                        path={path}
                        element={
                          <RequireAuth>
                            <Page />
                          </RequireAuth>
                        }
                      />
                    ))}
                    <Route
                      path="/admin"
                      element={
                        <RequireRole role="admin">
                          <AdminPage />
                        </RequireRole>
                      }
                    />
                    {REDIRECTS.map(([from, to]) => (
                      <Route key={from} path={from} element={<Navigate to={to} replace />} />
                    ))}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </div>
              <SiteFooterGate />
            </div>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
