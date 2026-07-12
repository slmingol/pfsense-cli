#!/bin/sh
# Scheduled NordVPN WireGuard server rotation.
# Designed for use with cron — sources .env, checks gateway status, then rotates.
# Skips rotation silently if the tunnel is down (nordvpn:rotate-wg handles the check).
#
# Required env vars (or set via .env):
#   PFSENSE_HOST, PFSENSE_API_KEY, PFSENSE_API_SECRET, NORDVPN_TOKEN
#
# Optional env vars:
#   COUNTRY_ID    - NordVPN country ID (default: 228 = US)
#   TUNNEL        - WireGuard tunnel description in pfSense (default: ProtonVPN01)
#   GATEWAY_NAME  - pfSense gateway name to check before rotating (default: NORDVPNWG_GW)
#   LOG_FILE      - append output here (default: /tmp/nordvpn-rotate.log)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${LOG_FILE:-/tmp/nordvpn-rotate.log}"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
fi

COUNTRY_ID="${COUNTRY_ID:-228}"
TUNNEL="${TUNNEL:-ProtonVPN01}"
GATEWAY_NAME="${GATEWAY_NAME:-NORDVPNWG_GW}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

log "Starting NordVPN WireGuard rotation (country=$COUNTRY_ID tunnel=$TUNNEL gw=$GATEWAY_NAME)"

node "$PROJECT_ROOT/cli.js" nordvpn:rotate-wg \
  --country-id "$COUNTRY_ID" \
  --tunnel     "$TUNNEL" \
  --gateway-name "$GATEWAY_NAME" \
  2>&1 | tee -a "$LOG_FILE"

STATUS=${PIPESTATUS[0]:-$?}

if [ "$STATUS" -eq 0 ]; then
  log "Done (exit 0)"
else
  log "Failed (exit $STATUS)"
fi

exit "$STATUS"
