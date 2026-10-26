# Matching benchmarks

Accuracy checks for the property matcher (`src/lib/propertyMatch.ts`) and change engine
(`src/lib/listingChanges.ts`) against real feeds on disk. Not part of `npm test`.

```sh
# 1. Parse feeds into a JSON cache (once; slow on big feeds)
BENCH_CACHE=/tmp/bench BENCH_XML_DIRS=/path/to/feeds BENCH_RUN_ROOT=/path/to/scraper/runs \
BENCH_XML_FILES="bh_a=/path/old.xml;bh_b=/path/new.xml" npm run bench -- bench/dump.bench.test.ts

# 2. Re-learn match weights (writes src/lib/propertyMatchWeights.ts)
BENCH_CACHE=/tmp/bench BENCH_WRITE=1 npm run bench -- bench/calibrate.bench.test.ts

# 3. Compare a version diff with the scraper's own diff report
BENCH_CACHE=/tmp/bench BENCH_SCRAPER_REPORT=/path/reports/diff_report.json npm run bench -- bench/scraper.bench.test.ts
```

Large pools need `NODE_OPTIONS=--max-old-space-size=8192`.
