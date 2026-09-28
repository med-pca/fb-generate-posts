-- Chaque compte porte sa propre clé NSTBrowser, remise à l'agent local.
ALTER TABLE "users" ADD COLUMN "nst_api_key" TEXT;
