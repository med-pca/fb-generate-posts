#!/bin/bash
# Double-cliquez ce fichier pour lancer l'agent PostFlow (laissez la fenêtre ouverte).
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo ""
  echo "Python 3 n'est pas installé sur ce Mac."
  echo "Installez-le depuis https://www.python.org/downloads/ puis relancez ce fichier."
  echo ""
  read -r -p "Appuyez sur Entrée pour fermer…" _
  exit 1
fi
python3 postflow_agent.py "$@"
echo ""
read -r -p "L'agent s'est arrêté. Appuyez sur Entrée pour fermer…" _
