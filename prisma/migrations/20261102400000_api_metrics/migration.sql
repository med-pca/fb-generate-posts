-- Rubrique Performance : mesure des appels de l'API.
ALTER TABLE "automation_settings" ADD COLUMN "perf_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "api_metrics" (
    "id" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "instance" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "caller" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "total_ms" DOUBLE PRECISION NOT NULL,
    "max_ms" DOUBLE PRECISION NOT NULL,
    "sql_count" INTEGER NOT NULL,
    "sql_ms" DOUBLE PRECISION NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "gets" INTEGER NOT NULL DEFAULT 0,
    "repeats" INTEGER NOT NULL DEFAULT 0,
    "b0" INTEGER NOT NULL DEFAULT 0,
    "b1" INTEGER NOT NULL DEFAULT 0,
    "b2" INTEGER NOT NULL DEFAULT 0,
    "b3" INTEGER NOT NULL DEFAULT 0,
    "b4" INTEGER NOT NULL DEFAULT 0,
    "b5" INTEGER NOT NULL DEFAULT 0,
    "b6" INTEGER NOT NULL DEFAULT 0,
    "b7" INTEGER NOT NULL DEFAULT 0,
    "b8" INTEGER NOT NULL DEFAULT 0,
    "b9" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "api_metrics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_metrics_minute_idx" ON "api_metrics"("minute");

CREATE TABLE "api_slow_calls" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "instance" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caller" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "ms" DOUBLE PRECISION NOT NULL,
    "sql_count" INTEGER NOT NULL,
    "sql_ms" DOUBLE PRECISION NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "api_slow_calls_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_slow_calls_at_idx" ON "api_slow_calls"("at");
