/**
 * Word-level diff for listing text: which words were removed and which added, with unchanged text
 * kept for context. Listing copy changes by a few words ("Vacant 1st Oct" → "Vacant 1st Dec"), which a
 * line diff would show as a whole rewritten paragraph.
 */
export type DiffToken = { text: string; op: "same" | "del" | "ins" };

/** Words plus the whitespace after them, so the diff re-renders the original spacing. */
const tokenize = (s: string) => s.match(/\S+\s*|\s+/g) ?? [];
const norm = (t: string) => t.trim().toLowerCase();

/** Above this many tokens per side the O(n·m) table is too costly; fall back to a whole-text swap. */
const MAX_TOKENS = 1800;

export function wordDiff(before: string, after: string): { tokens: DiffToken[]; changed: number; exact: boolean } {
  const a = tokenize(before ?? "");
  const b = tokenize(after ?? "");
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return { tokens: [{ text: before, op: "del" }, { text: after, op: "ins" }], changed: a.length + b.length, exact: false };
  }
  // Trim the shared head and tail first: most edits touch a small middle section.
  let head = 0;
  while (head < a.length && head < b.length && norm(a[head]) === norm(b[head])) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && norm(a[a.length - 1 - tail]) === norm(b[b.length - 1 - tail])) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);

  const n = am.length;
  const m = bm.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = norm(am[i]) === norm(bm[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const mid: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (norm(am[i]) === norm(bm[j])) {
      mid.push({ text: bm[j], op: "same" });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) mid.push({ text: am[i++], op: "del" });
    else mid.push({ text: bm[j++], op: "ins" });
  }
  while (i < n) mid.push({ text: am[i++], op: "del" });
  while (j < m) mid.push({ text: bm[j++], op: "ins" });

  // Merge runs so the markup is a few spans, not one per word.
  const tokens: DiffToken[] = [];
  for (const t of [...b.slice(0, head).map((text) => ({ text, op: "same" as const })), ...mid, ...b.slice(b.length - tail).map((text) => ({ text, op: "same" as const }))]) {
    const last = tokens[tokens.length - 1];
    if (last && last.op === t.op) last.text += t.text;
    else tokens.push({ ...t });
  }
  return { tokens, changed: mid.filter((t) => t.op !== "same").length, exact: true };
}
