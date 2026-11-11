-- Existing rates and candidate/invocation history remain unchanged; missing cache rates stay unknown.
ALTER TABLE "ConfiguredModel" ADD COLUMN "cacheWritePricePerMillion" DECIMAL;
ALTER TABLE "ConfiguredModel" ADD COLUMN "cacheReadPricePerMillion" DECIMAL;
ALTER TABLE "ConfiguredModel" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "ConfiguredModel" ADD COLUMN "tieredPricingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConfiguredModel" ADD COLUMN "tieredPricingThreshold" BIGINT;
ALTER TABLE "ConfiguredModel" ADD COLUMN "highInputPricePerMillion" DECIMAL;
ALTER TABLE "ConfiguredModel" ADD COLUMN "highOutputPricePerMillion" DECIMAL;
ALTER TABLE "ConfiguredModel" ADD COLUMN "highCacheWritePricePerMillion" DECIMAL;
ALTER TABLE "ConfiguredModel" ADD COLUMN "highCacheReadPricePerMillion" DECIMAL;
