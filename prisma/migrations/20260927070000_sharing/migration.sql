-- Partages en publication seule. Une table par ressource plutôt qu'un
-- système de permissions générique : les requêtes restent lisibles, et on
-- voit d'un coup d'œil qui a accès à quoi.
CREATE TABLE "group_access" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "site_access" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_access_pkey" PRIMARY KEY ("id")
);

-- Un partage n'a pas de sens sans sa ressource ni son bénéficiaire :
-- `CASCADE` ici, contrairement à la propriété qui est en `SET NULL`.
CREATE UNIQUE INDEX "group_access_group_id_user_id_key" ON "group_access"("group_id", "user_id");
CREATE INDEX "group_access_user_id_idx" ON "group_access"("user_id");
CREATE UNIQUE INDEX "site_access_source_id_user_id_key" ON "site_access"("source_id", "user_id");
CREATE INDEX "site_access_user_id_idx" ON "site_access"("user_id");

ALTER TABLE "group_access" ADD CONSTRAINT "group_access_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_access" ADD CONSTRAINT "group_access_user_id_fkey"  FOREIGN KEY ("user_id")  REFERENCES "users"("id")  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_access"  ADD CONSTRAINT "site_access_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "content_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_access"  ADD CONSTRAINT "site_access_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "users"("id")           ON DELETE CASCADE ON UPDATE CASCADE;
