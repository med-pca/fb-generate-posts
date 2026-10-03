-- Actions demandées au modérateur par l'admin (accepter / pré-approuver).
ALTER TABLE "profile_groups" ADD COLUMN "member_requested_at" TIMESTAMP(3);
