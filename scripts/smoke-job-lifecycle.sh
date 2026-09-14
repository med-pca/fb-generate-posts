#!/usr/bin/env bash
# Vérifie, sur une API déployée, que le cycle de vie d'un job va bien
# jusqu'au bout : claim -> consumed -> published -> complete.
#
# Avant le correctif de jobs.service.ts, `published` après `consumed`
# répondait 400 et `complete` restait bloqué. Ce script échoue si la
# régression revient.
#
# Aucune donnée réelle n'est touchée : le script crée son propre profil et
# son propre groupe, et la requête de réservation filtre sur
# `p.profile_id = <profil de test> AND pt.group_id = <groupe de test>`.
# Elle ne peut donc réserver que le post créé ici. Tout est supprimé à la fin
# (la suppression du profil est un vrai DELETE, qui cascade sur les posts,
# les cibles et les items de job).
#
# Usage :
#   export API_BASE=https://post.pulserecipe.com/api
#   export ADMIN_USERNAME=... ADMIN_PASSWORD=... AUTOMATION_API_KEY=...
#   ./scripts/smoke-job-lifecycle.sh

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api}"
: "${ADMIN_USERNAME:?ADMIN_USERNAME est requis}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD est requis}"
: "${AUTOMATION_API_KEY:?AUTOMATION_API_KEY est requis}"

SUFFIX="$(date +%s)-$$"
EXTERNAL_ID="smoke-profile-${SUFFIX}"
PROFILE_ID=""
GROUP_ID=""
FAILURES=0

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1 if d else '')" 2>/dev/null || true; }

cleanup() {
  echo
  echo "--- Nettoyage ---"
  if [ -n "$PROFILE_ID" ]; then
    code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$API_BASE/profiles/$PROFILE_ID")
    echo "profil de test supprimé (HTTP $code) - posts, cibles et job en cascade"
  fi
  if [ -n "$GROUP_ID" ]; then
    code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$API_BASE/groups/$GROUP_ID")
    echo "groupe de test supprimé (HTTP $code)"
  fi
}

step() { printf '\n== %s\n' "$1"; }

expect() { # expect <attendu-regex> <obtenu> <libellé>
  if [[ "$2" =~ $1 ]]; then
    echo "   OK   $3 ($2)"
  else
    echo "   ÉCHEC $3 : attendu $1, obtenu $2"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "API : $API_BASE"

step "Connexion admin"
LOGIN=$(curl -s -m 30 -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json "['accessToken']")
if [ -z "$TOKEN" ]; then
  echo "   ÉCHEC : pas de jeton admin. Vérifie ADMIN_USERNAME / ADMIN_PASSWORD."
  exit 1
fi
echo "   OK   jeton obtenu"
trap cleanup EXIT

AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

step "Création du profil de test (1 post par job)"
PROFILE=$(curl -s -m 30 -X POST "$API_BASE/profiles" "${AUTH[@]}" \
  -d "{\"name\":\"SMOKE $SUFFIX\",\"externalId\":\"$EXTERNAL_ID\",\"minPostsPerJob\":1,\"maxPostsPerJob\":1}")
PROFILE_ID=$(printf '%s' "$PROFILE" | json "['id']")
[ -n "$PROFILE_ID" ] || { echo "   ÉCHEC : $PROFILE"; exit 1; }
echo "   OK   profil $PROFILE_ID"

step "Création du groupe de test"
GROUP=$(curl -s -m 30 -X POST "$API_BASE/profiles/$PROFILE_ID/groups" "${AUTH[@]}" \
  -d "{\"name\":\"SMOKE GROUP $SUFFIX\",\"externalId\":\"smoke-group-$SUFFIX\",\"url\":\"https://facebook.com/groups/smoke-$SUFFIX\"}")
GROUP_ID=$(printf '%s' "$GROUP" | json "['id']")
[ -n "$GROUP_ID" ] || { echo "   ÉCHEC : $GROUP"; exit 1; }
echo "   OK   groupe $GROUP_ID"

step "Création du post de test"
POST=$(curl -s -m 30 -X POST "$API_BASE/posts" "${AUTH[@]}" \
  -d "{\"profileId\":\"$PROFILE_ID\",\"title\":\"SMOKE\",\"description\":\"smoke test\",\"delay\":0,\"groupIds\":[\"$GROUP_ID\"]}")
POST_ID=$(printf '%s' "$POST" | json "['id']")
[ -n "$POST_ID" ] || { echo "   ÉCHEC : $POST"; exit 1; }
echo "   OK   post $POST_ID"

step "Réservation (claim)"
# On passe par /jobs/claim (profileId + groupId) et non par
# /jobs/claim/profile/{externalId} : cette dernière appelle replenishProfile,
# qui crée des posts supplémentaires depuis les articles tant que le profil
# n'atteint pas minimumAvailablePerProfile. Le correctif testé ici vit dans
# updateItem/complete, identiques pour les deux routes.
CLAIM=$(curl -s -m 30 -X POST "$API_BASE/jobs/claim" \
  -H "X-API-Key: $AUTOMATION_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"profileId\":\"$PROFILE_ID\",\"groupId\":\"$GROUP_ID\"}")
JOB_ID=$(printf '%s' "$CLAIM" | json "['jobId']")
CLAIMED_ID=$(printf '%s' "$CLAIM" | json "['posts'][0]['id']")
COUNT=$(printf '%s' "$CLAIM" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('posts',[])))")
if [ -z "$JOB_ID" ]; then
  echo "   ÉCHEC : pas de job réservé. Réponse : $CLAIM"
  exit 1
fi
echo "   OK   job $JOB_ID"
expect '^1$' "$COUNT" "un seul post réservé"
expect "^${POST_ID}$" "$CLAIMED_ID" "c'est bien le post de test"
# Toutes les confirmations portent sur le post que l'API a réellement remis.
POST_ID="${CLAIMED_ID:-$POST_ID}"

api_post() {
  local body="${2-}"
  [ -n "$body" ] || body='{}'
  curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$1" \
    -H "X-API-Key: $AUTOMATION_API_KEY" -H 'Content-Type: application/json' -d "$body"
}

step "consumed"
expect '^2[0-9][0-9]$' "$(api_post "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/consumed")" "consumed accepté"

step "published APRÈS consumed  <-- le correctif"
code=$(api_post "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/published" \
  '{"externalPostUrl":"https://www.facebook.com/groups/1/posts/2/"}')
expect '^2[0-9][0-9]$' "$code" "published après consumed (400 = correctif absent du build déployé)"

step "published rejoué (idempotence)"
expect '^2[0-9][0-9]$' "$(api_post "$API_BASE/jobs/$JOB_ID/posts/$POST_ID/published")" "seconde confirmation tolérée"

step "complete  <-- le correctif"
expect '^2[0-9][0-9]$' "$(api_post "$API_BASE/jobs/$JOB_ID/complete")" "job clôturé (400 = CONSUMED compte encore comme non terminé)"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "RÉSULTAT : tout est passé - le correctif est bien en production."
else
  echo "RÉSULTAT : $FAILURES vérification(s) en échec."
fi
exit "$FAILURES"
