-- Origine d'un post repris d'une publication Facebook existante.
-- Valeur d'enum isolée dans sa propre migration : PostgreSQL refuse qu'une
-- valeur ajoutée soit utilisée dans la transaction qui l'ajoute.
ALTER TYPE "SourceType" ADD VALUE 'FACEBOOK';
