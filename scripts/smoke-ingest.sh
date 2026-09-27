#!/usr/bin/env bash
# Parcours complet d'une reprise, étage par étage, sur une API qui tourne.
# Chaque étage dit ce qu'il attend et pourquoi il s'arrête. La reprise créée
# est supprimée à la fin, sauf si KEEP=1.
#
#   API_BASE=http://localhost:3000/api \
#   ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=... \
#   ./scripts/smoke-ingest.sh [url-source]
#
# PROFILE_IDS limite la diffusion : sans lui, le renvoi du plugin fabrique
# des posts pour TOUS les profils actifs, que l'extension peut publier dans
# de vrais groupes. Le préciser pour un essai.
#   PROFILE_IDS=id1,id2 ./scripts/smoke-ingest.sh
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api}"
SOURCE_URL="${1:-https://en.wikipedia.org/wiki/Couscous}"
FB_URL="${FB_URL:-https://www.facebook.com/exemple/posts/$RANDOM}"
IMAGE_URL="${IMAGE_URL:-}"
INGEST_ID=""

green() { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
red()   { printf '\033[31m  ✗ %s\033[0m\n' "$1"; }
warn()  { printf '\033[33m  ! %s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
field() { python3 -c "import sys,json;d=json.load(sys.stdin);v=d;[v:=(v or {}).get(k) for k in '$1'.split('.')];print(v if v is not None else '')" 2>/dev/null; }

cleanup() {
  if [ -n "$INGEST_ID" ] && [ "${KEEP:-0}" != "1" ]; then
    curl -s -o /dev/null -X DELETE "$API_BASE/admin/ingest/$INGEST_ID" -H "Authorization: Bearer $TOKEN"
    printf '\n(reprise %s supprimée — KEEP=1 pour la garder)\n' "${INGEST_ID:0:10}"
  fi
}
trap cleanup EXIT

step "0. L'API répond"
if ! curl -sf -o /dev/null --max-time 5 "$API_BASE/docs-json"; then
  red "$API_BASE injoignable — lancer 'npm run build && npm run start:prod'"; exit 1
fi
green "$API_BASE"

step "1. Session administrateur"
TOKEN=$(curl -s -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USERNAME:?ADMIN_USERNAME requis}\",\"password\":\"${ADMIN_PASSWORD:?ADMIN_PASSWORD requis}\"}" | field accessToken)
[ -n "$TOKEN" ] || { red "identifiants refusés"; exit 1; }
green "connecté"

step "2. Création de la reprise"
if [ -n "${PROFILE_IDS:-}" ]; then
  SCOPE=",\"profileIds\":[$(echo "$PROFILE_IDS" | sed 's/[^,]*/"&"/g')]"
  green "portée limitée à : $PROFILE_IDS"
else
  SCOPE=""
  warn "portée non limitée : TOUS les profils actifs recevront un post"
  warn "  PROFILE_IDS=<id> pour restreindre"
fi
BODY=$(curl -s -X POST "$API_BASE/admin/ingest" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"facebookUrl\":\"$FB_URL\",\"sourceUrl\":\"$SOURCE_URL\",\"language\":\"${LANG_CODE:-fr}\"$SCOPE}")
INGEST_ID=$(echo "$BODY" | field id)
if [ -z "$INGEST_ID" ]; then
  red "refusée : $BODY"
  echo "$BODY" | grep -q WORDPRESS_SITE_URL && warn "renseigner WORDPRESS_SITE_URL dans .env, ou passer siteUrl"
  exit 1
fi
green "reprise ${INGEST_ID:0:10} en PENDING_SCRAPE"

step "3. Réservation par une extension (jobs/scrape/claim)"
CLAIM=$(curl -s -X POST "$API_BASE/jobs/scrape/claim?profileExternalId=smoke" \
  -H "X-API-Key: ${AUTOMATION_API_KEY:?AUTOMATION_API_KEY requis}")
CLAIMED=$(echo "$CLAIM" | field scrape.scrapeId)
[ -n "$CLAIMED" ] || { red "rien réservé : $CLAIM"; exit 1; }
green "réservée : ${CLAIMED:0:10} → $(echo "$CLAIM" | field scrape.facebookUrl)"
[ "$CLAIMED" = "$INGEST_ID" ] || warn "une autre reprise était en attente, le parcours suit ${CLAIMED:0:10}"
INGEST_ID="$CLAIMED"

step "4. Dépôt du résultat de collecte (doit rendre la main tout de suite)"
START=$(python3 -c 'import time;print(time.time())')
RESULT=$(curl -s -X POST "$API_BASE/jobs/scrape/$INGEST_ID/result" -H "X-API-Key: $AUTOMATION_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"caption\":\"Texte relevé sur la publication d'origine 🍲\"$([ -n "$IMAGE_URL" ] && echo ",\"imageUrl\":\"$IMAGE_URL\"")}")
ELAPSED=$(python3 -c "import time;print(f'{time.time()-$START:.2f}')")
[ "$(echo "$RESULT" | field accepted)" = "True" ] || { red "refusé : $RESULT"; exit 1; }
green "accepté en ${ELAPSED}s — la suite se fait en arrière-plan"

step "5. Suivi du traitement"
for i in $(seq 1 30); do
  SNAP=$(curl -s "$API_BASE/admin/ingest/$INGEST_ID" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$SNAP" | field status)
  case "$STATUS" in
    COMPLETED|FAILED|AWAITING_ECHO) break ;;
  esac
  [ -n "$(echo "$SNAP" | field lastError)" ] && break
  sleep 2
done
printf '  statut     : %s\n' "$STATUS"
printf '  page lue   : %s caractères, titre « %s »\n' \
  "$(echo "$SNAP" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('sourceText') or ''))")" \
  "$(echo "$SNAP" | field sourceTitle)"
ERR=$(echo "$SNAP" | field lastError)

case "$STATUS" in
  SCRAPED|REWRITING)
    [ -n "$(echo "$SNAP" | field sourceTitle)" ] && green "lecture de la page source : OK"
    red "réécriture bloquée : $ERR"
    warn "aucun fournisseur ne répond — recharger Kimi, ou renseigner OPENAI_API_KEY / GEMINI_API_KEY"
    ;;
  REWRITTEN)
    green "réécriture : OK — $(echo "$SNAP" | field generated.title)"
    red "dépôt WordPress bloqué : $ERR"
    warn "vérifier WORDPRESS_API_KEY, WORDPRESS_SITE_URL et le plugin 1.2.0"
    ;;
  AWAITING_ECHO)
    green "réécriture : OK — $(echo "$SNAP" | field generated.title)"
    green "déposé sur WordPress : $(echo "$SNAP" | field wpPermalink)"
    warn "en attente du renvoi du plugin (WP-Cron). Relancer le script avec KEEP=1 puis"
    warn "  curl \"\$API_BASE/admin/ingest/$INGEST_ID\" -H \"Authorization: Bearer \$TOKEN\""
    ;;
  COMPLETED)
    green "réécriture : OK — $(echo "$SNAP" | field generated.title)"
    green "déposé sur WordPress : $(echo "$SNAP" | field wpPermalink)"
    green "boucle fermée, article $(echo "$SNAP" | field article.id)"
    step "6. Posts fabriqués"
    curl -s "$API_BASE/posts?articleId=$(echo "$SNAP" | field article.id)&limit=5" \
      -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
rows = (json.load(sys.stdin) or {}).get('data', [])
print(f'  {len(rows)} post(s)')
for p in rows[:3]:
    print(f\"  · {p.get('title')}\")
    print(f\"    {(p.get('description') or '')[:110]}\")
    print(f\"    image={p.get('imageUrl')} url={p.get('url')}\")
" ;;
  FAILED) red "abandonnée après 5 tentatives : $ERR" ;;
  *)      warn "statut inattendu : $STATUS ${ERR:+— $ERR}" ;;
esac

step "Journal"
curl -s "$API_BASE/admin/logs?limit=12" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
for row in (json.load(sys.stdin) or {}).get('data', []):
    if (row.get('metadata') or {}).get('ingestId') == '$INGEST_ID':
        print(f\"  {row['level']:5} {row['eventType']:24} {row['message'][:60]}\")
" 2>/dev/null || echo "  (journal indisponible)"
