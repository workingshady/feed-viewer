import { formatDistanceToNow } from "date-fns";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** "3 hours ago". Times slightly in the future (server clock ahead of the browser) read as "just now". */
export const timeAgo = (iso: string) => {
  const d = new Date(iso);
  return d.getTime() > Date.now() - 30_000 ? "just now" : formatDistanceToNow(d, { addSuffix: true });
};

export const pct = (share: number) => `${Math.round(share * 100)}%`;

export function downloadText(fileName: string, text: string, type = "text/csv") {
  // A UTF-8 BOM makes Excel read Arabic text and symbols in CSVs correctly.
  const body = type === "text/csv" ? "\uFEFF" + text : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  URL.revokeObjectURL(url);
}
