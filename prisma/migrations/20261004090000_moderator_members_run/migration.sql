-- Déclencheur séparé pour les tâches « nos profils » du modérateur.
ALTER TABLE "profiles" ADD COLUMN "moderator_members_run_at" TIMESTAMP(3);
