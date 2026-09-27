-- Chaque racine porte son propriétaire. Les tables qui en dépendent — posts,
-- articles, cibles, lots — n'en ont pas besoin : elles héritent du profil ou
-- du site dont elles sont nées.
ALTER TABLE "profiles"        ADD COLUMN "owner_id" TEXT;
ALTER TABLE "groups"          ADD COLUMN "owner_id" TEXT;
ALTER TABLE "content_sources" ADD COLUMN "owner_id" TEXT;
ALTER TABLE "source_ingests"  ADD COLUMN "owner_id" TEXT;

-- Tout ce qui existe revient au premier administrateur : sans cela, la
-- plateforme deviendrait invisible à son propre propriétaire dès que les
-- lectures seront bornées.
UPDATE "profiles"        SET "owner_id" = (SELECT id FROM "users" WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1);
UPDATE "groups"          SET "owner_id" = (SELECT id FROM "users" WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1);
UPDATE "content_sources" SET "owner_id" = (SELECT id FROM "users" WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1);
UPDATE "source_ingests"  SET "owner_id" = (SELECT id FROM "users" WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1);

-- `SET NULL` et non `CASCADE` : supprimer un compte ne doit jamais emporter
-- ses groupes, ses sites et l'historique de publication qui en dépend.
ALTER TABLE "profiles"        ADD CONSTRAINT "profiles_owner_id_fkey"        FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "groups"          ADD CONSTRAINT "groups_owner_id_fkey"          FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_ingests"  ADD CONSTRAINT "source_ingests_owner_id_fkey"  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "profiles_owner_id_idx"        ON "profiles"("owner_id");
CREATE INDEX "groups_owner_id_idx"          ON "groups"("owner_id");
CREATE INDEX "content_sources_owner_id_idx" ON "content_sources"("owner_id");
CREATE INDEX "source_ingests_owner_id_idx"  ON "source_ingests"("owner_id");
