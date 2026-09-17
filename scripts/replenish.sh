#!/usr/bin/env bash
# Déclenche une alimentation des posts depuis les articles actifs.
#
# L'API le fait déjà seule : avant chaque réservation d'un automate, et
# toutes les REPLENISH_INTERVAL_MINUTES minutes. Ce script sert à forcer un
# passage — depuis cron sur une machine tierce, ou à la main après avoir
# importé de nouveaux articles.
#
# Chaque profil actif sous son seuil (minimumAvailablePerProfile, ou
# minimumAvailablePerGroup pour l'un de ses groupes) reçoit de nouveaux posts
# construits à partir des légendes des articles actifs — exactement ce que
# produit « Créer les posts » sur une fiche article.
#
# Usage :
#   export API_BASE=https://post.pulserecipe.com/api
#   export ADMIN_USERNAME=... ADMIN_PASSWORD=...
#   ./scripts/replenish.sh              # tous les profils actifs
#   ./scripts/replenish.sh <profileId>  # un seul profil
#
# Exemple cron, toutes les 30 minutes :
#   */30 * * * * API_BASE=... ADMIN_USERNAME=... ADMIN_PASSWORD=... \
#     /chemin/scripts/replenish.sh >> /var/log/replenish.log 2>&1

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME est requis}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD est requis}"
PROFILE_ID="${1-}"

TOKEN=$(curl -s -m 30 -X POST "$API_BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" |
  python3 -c "import json,sys; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo "$(date -Is) ÉCHEC : connexion admin refusée" >&2
  exit 1
fi

if [ -n "$PROFILE_ID" ]; then
  URL="$API_BASE/settings/replenish-now/$PROFILE_ID"
else
  URL="$API_BASE/settings/replenish-now"
fi

RESPONSE=$(curl -s -m 300 -X POST "$URL" -H "Authorization: Bearer $TOKEN")

printf '%s' "$RESPONSE" | python3 -c '
import json, sys, datetime

stamp = datetime.datetime.now().isoformat(timespec="seconds")
try:
    data = json.load(sys.stdin)
except Exception:
    print(f"{stamp} ÉCHEC : réponse illisible de l API", file=sys.stderr)
    raise SystemExit(1)

results = data if isinstance(data, list) else [data]
if not results:
    print(f"{stamp} aucun profil actif")
    raise SystemExit(0)

total_new = total_reused = 0
for item in results:
    if item.get("skipped"):
        print(f"{stamp} profil {item.get(\"profileId\")} ignoré : {item[\"skipped\"]}")
        continue
    new, reused = item.get("generated", 0), item.get("reused", 0)
    total_new += new
    total_reused += reused
    manque = [g for g in item.get("groups", []) if g.get("missing", 0) > 0]
    detail = f" — {len(manque)} groupe(s) encore en manque" if manque else ""
    print(f"{stamp} profil {item.get(\"profileId\")} : "
          f"{new} créé(s), {reused} rattaché(s){detail}")

print(f"{stamp} TOTAL : {total_new} post(s) créé(s), {total_reused} rattaché(s) "
      f"sur {len(results)} profil(s)")
'
