-- Au plus 3 pages par article (au lieu de 5) : le défaut, et la valeur
-- enregistrée si elle n'avait pas été changée à la main.
ALTER TABLE "automation_settings" ALTER COLUMN "article_max_pages" SET DEFAULT 3;
UPDATE "automation_settings" SET "article_max_pages" = 3 WHERE "article_max_pages" = 5;
