-- Priorités du pilotage : par groupe et par article.
ALTER TABLE "groups" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
