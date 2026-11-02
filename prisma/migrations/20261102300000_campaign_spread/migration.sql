-- AlterTable : l'objectif d'une campagne est un but à atteindre ; l'étaler devient une option.
ALTER TABLE "campaigns" ADD COLUMN "spread" BOOLEAN NOT NULL DEFAULT false;
