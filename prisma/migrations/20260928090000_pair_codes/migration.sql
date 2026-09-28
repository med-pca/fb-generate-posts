-- L'appairage d'un navigateur : un code court, périssable, à usage unique.
--
-- Il remplace la saisie à la main de l'adresse de l'API, de sa clé et de
-- l'identifiant du profil dans chaque navigateur -- trois champs dont deux
-- étaient recopiés à l'identique partout, et le troisième choisi dans une
-- liste, donc trois occasions de se tromper de profil.

ALTER TABLE "profile_runners"
  ADD COLUMN "pair_code" TEXT,
  ADD COLUMN "pair_code_expires_at" TIMESTAMP(3),
  ADD COLUMN "paired_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "profile_runners_pair_code_key" ON "profile_runners"("pair_code");
