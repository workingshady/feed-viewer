export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** JSON fetch against our API. Throws `ApiError` with the server's `error` code on non-2xx. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? undefined);
  if (init.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch (e) {
    throw new ApiError(0, "network_error", { detail: e instanceof Error ? e.message : String(e) });
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { path } }));
    const code = typeof (body as { error?: unknown })?.error === "string" ? (body as { error: string }).error : `http_${res.status}`;
    throw new ApiError(res.status, code, body);
  }
  return body as T;
}

export const jsonBody = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });
