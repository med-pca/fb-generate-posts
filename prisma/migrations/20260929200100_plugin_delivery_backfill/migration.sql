-- Séparée de l'ajout de la valeur : PostgreSQL refuse d'employer une valeur
-- d'enum dans la transaction qui l'a créée.

-- Le dernier article reçu, pour les sites qui en ont envoyé avant que la date
-- soit suivie.
UPDATE "content_sources" s SET "last_delivery_at" = sub.last_import
FROM (
  SELECT "source_id", MAX("imported_at") AS last_import
  FROM "articles" GROUP BY "source_id"
) sub
WHERE sub."source_id" = s."id" AND s."last_delivery_at" IS NULL;

-- « Absente » alors que le site nous envoie ses articles : c'est une
-- ancienne extension, sans route de statut.
UPDATE "content_sources"
SET "plugin_state" = 'OUTDATED',
    "plugin_message" = 'Ancienne extension : elle envoie ses articles, mais ne se laisse pas vérifier et ne reçoit pas les reprises. Installer la version 1.3.0.'
WHERE "plugin_state" = 'MISSING' AND "last_delivery_at" IS NOT NULL;
