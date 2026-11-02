-- La colonne de l'option « Posts en attente » du modérateur. Elle avait été
-- ajoutée après coup dans 20261102200000_moderator_spam, déjà appliquée en
-- production : elle n'y a jamais été créée. IF NOT EXISTS : sans effet là où
-- elle existe déjà.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "moderator_pending" BOOLEAN NOT NULL DEFAULT true;
