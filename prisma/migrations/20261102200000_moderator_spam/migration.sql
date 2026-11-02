-- AlterTable : missions du modérateur (vérification et retraits désactivés par défaut, spam activé)
ALTER TABLE "profiles" ADD COLUMN "moderator_posts_check" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "moderator_removals" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "moderator_spam" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable : passage du modérateur sur le « Spam potentiel » de chaque groupe
ALTER TABLE "groups" ADD COLUMN "spam_checked_at" TIMESTAMP(3);
ALTER TABLE "groups" ADD COLUMN "spam_claimed_until" TIMESTAMP(3);
ALTER TABLE "groups" ADD COLUMN "spam_detail" TEXT;
