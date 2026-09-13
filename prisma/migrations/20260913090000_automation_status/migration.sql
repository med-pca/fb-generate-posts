ALTER TABLE "articles" ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "automation_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "auto_replenish_enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimum_available_per_profile" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "automation_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "automation_settings" ("id", "updated_at") VALUES ('global', CURRENT_TIMESTAMP);
