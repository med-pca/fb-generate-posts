-- Le pool de profils d’une campagne : N actifs, les autres en réserve.
ALTER TABLE "campaigns" ADD COLUMN "active_profiles" INTEGER;
