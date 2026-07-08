#!/usr/bin/env bash
# Ripristino del database PostgreSQL da un backup prodotto da backup.sh (Fase S7).
#
# ATTENZIONE: il ripristino SOVRASCRIVE i dati esistenti nel database di destinazione. Non eseguire
# mai contro il DB di produzione se non si è assolutamente certi. Pensato per ambienti di sviluppo/
# staging o per un recovery consapevole.
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/restore.sh <file_backup.sql.gz>
#
# Richiede `psql` (client PostgreSQL) installato.

set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] Specifica un file di backup esistente: ./scripts/restore.sh <file.sql.gz>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$BACKEND_DIR/.env" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | head -1 | cut -d '=' -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore] DATABASE_URL non impostata (né in ambiente né in backend/.env)." >&2
  exit 1
fi

# Protezione: richiede conferma esplicita se NODE_ENV=production.
if [ "${NODE_ENV:-}" = "production" ] && [ "${ALLOW_DESTRUCTIVE:-}" != "true" ]; then
  echo "[restore] NODE_ENV=production: ripristino rifiutato. Imposta ALLOW_DESTRUCTIVE=true se sei certo." >&2
  exit 1
fi

echo "[restore] Ripristino da $BACKUP_FILE (i dati esistenti verranno sovrascritti)..."
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
echo "[restore] Completato."
