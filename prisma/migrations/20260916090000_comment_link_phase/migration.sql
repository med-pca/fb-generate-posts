-- Le post part sans URL ; l'URL arrive plus tard, en modifiant le commentaire.
-- Valeur d'enum isolée dans sa propre migration : PostgreSQL refuse qu'une
-- valeur ajoutée soit utilisée dans la transaction qui l'ajoute.
ALTER TYPE "JobStatus" ADD VALUE 'AWAITING_LINK' AFTER 'CLAIMED';
