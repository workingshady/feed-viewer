/**
 * Line-level unified diff (Git-style) using LCS backtracking. Best for titles/descriptions;
 * caps work size to stay responsive on huge strings.
 */

export type UnifiedDiffLine = { sign: " " | "-" | "+"; text: string };

const MAX_LINE_COUNT = 500;
const MAX_PRODUCT = 320_000;

function splitLines(text: string): string[] {
  if (!text) return [""];
  const lines = text.split("\n");
  return lines.length ? lines : [""];
}

/** Longest-common-subsequence backtrack → unified diff lines. */
export function unifiedLineDiff(aLines: string[], bLines: string[]): UnifiedDiffLine[] {
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (aLines[i - 1] === bLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const stack: UnifiedDiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      stack.push({ sign: " ", text: aLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ sign: "+", text: bLines[j - 1] });
      j--;
    } else if (i > 0) {
      stack.push({ sign: "-", text: aLines[i - 1] });
      i--;
    }
  }
  stack.reverse();
  return stack;
}

export type TextDiffResult = {
  lines: UnifiedDiffLine[];
  truncated: boolean;
  fallback: boolean;
};

/**
 * Build a Git-like unified diff for two plain-text fields.
 * Falls back to single-line substitution when inputs are too large for DP.
 */
export function diffPlainText(oldText: string, newText: string): TextDiffResult {
  const aLines = splitLines(oldText);
  const bLines = splitLines(newText);
  let truncated = false;
  let a = aLines;
  let b = bLines;
  if (aLines.length > MAX_LINE_COUNT) {
    a = aLines.slice(0, MAX_LINE_COUNT);
    truncated = true;
  }
  if (bLines.length > MAX_LINE_COUNT) {
    b = bLines.slice(0, MAX_LINE_COUNT);
    truncated = true;
  }
  if (a.length * b.length > MAX_PRODUCT) {
    return {
      lines: [
        { sign: "-", text: oldText.length > 2000 ? `${oldText.slice(0, 2000)}…` : oldText },
        { sign: "+", text: newText.length > 2000 ? `${newText.slice(0, 2000)}…` : newText },
      ],
      truncated: truncated || oldText.length > 2000 || newText.length > 2000,
      fallback: true,
    };
  }
  return { lines: unifiedLineDiff(a, b), truncated, fallback: false };
}
