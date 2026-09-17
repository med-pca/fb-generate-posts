-- Seuils d'alimentation par profil. NULL conserve le comportement actuel :
-- le profil suit les réglages globaux d'automation_settings.
ALTER TABLE "profiles"
  ADD COLUMN "minimum_available" INTEGER,
  ADD COLUMN "minimum_available_per_group" INTEGER;
