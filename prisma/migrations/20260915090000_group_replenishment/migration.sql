-- Seuil d'alimentation calculé par groupe : un groupe presque vide doit être
-- réapprovisionné même si le profil, tous groupes confondus, semble fourni.
ALTER TABLE "automation_settings"
  ADD COLUMN "minimum_available_per_group" INTEGER NOT NULL DEFAULT 8;
