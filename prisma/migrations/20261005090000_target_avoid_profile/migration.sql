-- Republication d’un post incomplet par un autre profil que celui qui l’a raté.
ALTER TABLE "post_targets" ADD COLUMN "avoid_profile_id" TEXT;
