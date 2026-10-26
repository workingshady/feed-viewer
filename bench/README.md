# Matching benchmarks

Accuracy checks for the property matcher (`src/lib/propertyMatch.ts`), the in-app trainer
(`src/lib/matchTraining.ts`) and the change engine (`src/lib/listingChanges.ts`) against real feeds on
disk. Not part of `npm test`.

The app retrains itself (weekly, or after 25 new reviewer verdicts, or with "Retrain now" on the Admin
page); these benches are for measuring and for refreshing the built-in model shipped with the app.

```sh
# 1. Parse feeds into a JSON cache (once; slow on big feeds)
BENCH_CACHE=/tmp/bench BENCH_XML_DIRS=/path/to/feeds BENCH_RUN_ROOT=/path/to/scraper/runs \
BENCH_XML_FILES="bh_a=/path/old.xml;bh_b=/path/new.xml" npm run bench -- bench/dump.bench.test.ts

# 2. Run the in-app trainer on those feeds; BENCH_WRITE=1 refreshes src/lib/propertyMatchWeights.ts
BENCH_CACHE=/tmp/bench BENCH_PROGRESS=/tmp/progress.log BENCH_WRITE=1 npm run bench -- bench/train.bench.test.ts

# 3. Spot-check cross-agency matches by eye (precision audit)
BENCH_CACHE=/tmp/bench npm run bench -- bench/audit.bench.test.ts

# 4. Compare a version diff with the scraper's own diff report
BENCH_CACHE=/tmp/bench BENCH_SCRAPER_REPORT=/path/reports/diff_report.json npm run bench -- bench/scraper.bench.test.ts
```

Large pools need `NODE_OPTIONS=--max-old-space-size=8192`. Vitest holds console output until a test
ends, so long runs write progress to `BENCH_PROGRESS`; a "Timeout calling onTaskUpdate" message after a
long run is vitest's reporter, not a failure.
