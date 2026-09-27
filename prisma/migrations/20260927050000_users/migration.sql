-- Comptes de la plateforme. La propriété des ressources et la portée des
-- lectures viennent ensuite : cette migration n'ajoute que les comptes.
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "automation_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_automation_key_key" ON "users"("automation_key");
CREATE INDEX "users_status_idx" ON "users"("status");
