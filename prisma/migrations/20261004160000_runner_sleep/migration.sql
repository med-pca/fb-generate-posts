-- Veille du navigateur entre deux lots : l'agent local le rouvre à cette heure.
ALTER TABLE "profile_runners" ADD COLUMN "sleep_until" TIMESTAMP(3);
