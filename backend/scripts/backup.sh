#!/usr/bin/env bash
# Backup del database PostgreSQL (Fase S7 - iniziativa Sicurezza).
#
# In PRODUZIONE il backup primario è quello gestito dal provider (es. Neon offre il point-in-time
# recovery automatico): questo script è un backup logico AGGIUNTIVO/manuale, utile per esportazioni
# puntuali, migrazioni o copie locali prima di operazioni delicate.
#
# Uso:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup.sh [cartella_output]
# In locale carica le variabili da backend/.env se DATABASE_URL non è già impostata.
#
# Richiede `pg_dump` (client PostgreSQL) installato.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Carica DATABASE_URL da backend/.env se non già presente nell'ambiente.
if [ -z "${DATABASE_URL:-}" ] && [ -f "$BACKEND_DIR/.env" ]; then
  # Estrae solo la riga DATABASE_URL, ignorando i commenti.
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$BACKEND_DIR/.env" | head -1 | cut -d '=' -f2-)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] DATABASE_URL non impostata (né in ambiente né in backend/.env)." >&2
  exit 1
fi

OUT_DIR="${1:-$BACKEND_DIR/backups}"
mkdir -p "$OUT_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/turni_backup_$TIMESTAMP.sql.gz"

echo "[backup] Esporto il database in $OUT_FILE ..."
# --no-owner / --no-privileges: rende il dump più facile da ripristinare su un'altra istanza.
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUT_FILE"

echo "[backup] Completato: $OUT_FILE"
