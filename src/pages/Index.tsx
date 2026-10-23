import { Landing } from "@/components/landing/Landing";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { useAuth } from "@/providers/AuthProvider";

/** "/" — public landing page for visitors, dashboard once signed in. */
export default function Index() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" aria-busy="true" />;
  return user ? <Dashboard /> : <Landing />;
}
