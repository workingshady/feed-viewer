import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/** Whether new accounts can be created (first user, or ALLOW_SIGNUP on the server). */
export function useSignupStatus() {
  return useQuery({
    queryKey: ["signup-status"],
    queryFn: () => apiFetch<{ open: boolean; firstUser: boolean }>("/api/auth/signup-status"),
    staleTime: 5 * 60_000,
  });
}
