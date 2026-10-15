-- CreateTable
CREATE TABLE "ai_provider_settings" (
    "provider" TEXT NOT NULL,
    "api_key" TEXT,
    "model" TEXT,
    "base_url" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("provider")
);

