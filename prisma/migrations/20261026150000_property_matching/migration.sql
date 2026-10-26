-- CreateEnum
CREATE TYPE "MatchVerdict" AS ENUM ('same', 'different');

-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "listingIds" JSONB NOT NULL,
    "verdict" "MatchVerdict" NOT NULL,
    "context" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchModel" (
    "id" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "MatchModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchDecision_pairKey_key" ON "MatchDecision"("pairKey");

-- CreateIndex
CREATE INDEX "MatchDecision_updatedAt_idx" ON "MatchDecision"("updatedAt");

-- CreateIndex
CREATE INDEX "MatchModel_active_idx" ON "MatchModel"("active");

-- CreateIndex
CREATE INDEX "MatchModel_createdAt_idx" ON "MatchModel"("createdAt");

-- AddForeignKey
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchModel" ADD CONSTRAINT "MatchModel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
