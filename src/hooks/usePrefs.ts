import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, jsonBody } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import type { MappingConfig, MappingPreset } from "@/lib/types";

/** A per-user JSON setting stored on the server, with optimistic updates. */
export function usePref<T>(key: string, fallback: T): [T, (next: T) => void] {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["pref", user?.id, key];
  const { data } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ value: T | null }>(`/api/prefs/${key}`).then((r) => r.value),
    enabled: !!user,
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (value: T) => apiFetch(`/api/prefs/${key}`, { method: "PUT", ...jsonBody({ value }) }),
    onMutate: (value) => qc.setQueryData(queryKey, value),
    onError: () => qc.invalidateQueries({ queryKey }),
  });
  return [(data ?? fallback) as T, mutation.mutate];
}

export function useFavorites() {
  const [ids, setIds] = usePref<string[]>("favorites", []);
  const set = useMemo(() => new Set(ids), [ids]);
  const toggle = useCallback(
    (id: string) => setIds(set.has(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    [ids, set, setIds],
  );
  const remove = useCallback((id: string) => setIds(ids.filter((x) => x !== id)), [ids, setIds]);
  return { ids: set, toggle, remove, isFavorite: (id: string) => set.has(id) };
}

export function useMappingPresets() {
  const [presets, setPresets] = usePref<MappingPreset[]>("mapping.presets", []);
  return {
    presets,
    save: (name: string, config: MappingConfig) =>
      setPresets([
        ...presets,
        { id: crypto.randomUUID(), name: name.trim() || "Untitled", createdAt: new Date().toISOString(), config },
      ]),
    remove: (id: string) => setPresets(presets.filter((p) => p.id !== id)),
  };
}
