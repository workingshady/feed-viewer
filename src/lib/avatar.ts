export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * Initials tints, picked by a stable hash of the name so one person keeps one colour
 * everywhere. Text steps darken in light and lighten in dark so every pair clears AA.
 */
const TINTS = [
  "bg-primary/12 text-primary-text",
  "bg-secondary/18 text-secondary-text",
  "bg-sky-500/12 text-sky-800 dark:text-sky-300",
  "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  "bg-rose-500/12 text-rose-800 dark:text-rose-300",
  "bg-teal-500/12 text-teal-800 dark:text-teal-300",
];

export function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
