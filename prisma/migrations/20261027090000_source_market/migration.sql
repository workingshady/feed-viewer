-- Market of a source (AE, MY, SG, PK). Empty = not set yet; the app fills it from the feed's data.
ALTER TABLE "Source" ADD COLUMN "market" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Source_market_idx" ON "Source"("market");
