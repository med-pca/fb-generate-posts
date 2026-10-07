-- CreateTable
CREATE TABLE "languages" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "languages_name_key" ON "languages"("name");

-- Les langues déjà proposées par la plateforme, plus celles déjà portées
-- par des groupes ou des visuels (aucune ne doit disparaître).
INSERT INTO "languages" ("code", "name", "updated_at") VALUES
  ('en', 'English', CURRENT_TIMESTAMP), ('fr', 'French', CURRENT_TIMESTAMP), ('ar', 'Arabic', CURRENT_TIMESTAMP),
  ('es', 'Spanish', CURRENT_TIMESTAMP), ('de', 'German', CURRENT_TIMESTAMP), ('it', 'Italian', CURRENT_TIMESTAMP),
  ('pt', 'Portuguese', CURRENT_TIMESTAMP), ('nl', 'Dutch', CURRENT_TIMESTAMP), ('tr', 'Turkish', CURRENT_TIMESTAMP),
  ('pl', 'Polish', CURRENT_TIMESTAMP), ('ro', 'Romanian', CURRENT_TIMESTAMP), ('ru', 'Russian', CURRENT_TIMESTAMP),
  ('hi', 'Hindi', CURRENT_TIMESTAMP), ('id', 'Indonesian', CURRENT_TIMESTAMP);
INSERT INTO "languages" ("code", "name", "updated_at")
  SELECT DISTINCT l, upper(l), CURRENT_TIMESTAMP FROM (
    SELECT "language" AS l FROM "groups" WHERE "language" IS NOT NULL
    UNION SELECT "language" FROM "visuals" WHERE "language" IS NOT NULL
  ) used
  ON CONFLICT DO NOTHING;
