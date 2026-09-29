-- CreateEnum
CREATE TYPE "PluginState" AS ENUM ('UNKNOWN', 'CONNECTED', 'BAD_KEY', 'MISSING', 'UNREACHABLE');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "category_id" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "owner_id" TEXT,
ALTER COLUMN "profile_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "content_sources" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "last_delivery_at" TIMESTAMP(3),
ADD COLUMN     "plugin_checked_at" TIMESTAMP(3),
ADD COLUMN     "plugin_message" TEXT,
ADD COLUMN     "plugin_state" "PluginState" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "plugin_version" TEXT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "groups_category_id_idx" ON "groups"("category_id");

-- CreateIndex
CREATE INDEX "posts_owner_id_idx" ON "posts"("owner_id");

-- CreateIndex
CREATE INDEX "content_sources_category_id_idx" ON "content_sources"("category_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Les posts existants gardent leur propriétaire : celui de leur profil.
UPDATE "posts" p SET "owner_id" = pr."owner_id"
FROM "profiles" pr
WHERE pr."id" = p."profile_id" AND p."owner_id" IS NULL;
