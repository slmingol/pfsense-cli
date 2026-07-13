#!/bin/sh
# NordVPN WireGuard auto-recovery: force-rotate when gateway has been down
# longer than RECOVERY_THRESHOLD seconds (default: 300 = 5 minutes).
#
# The pfSense watchdog handles short outages (REKEY deadlock, brief blips).
# This script escalates: if the tunnel is still down after RECOVERY_THRESHOLD,
# it calls nordvpn:rotate-wg --force to replace the dead server.
#
# Run every 5 minutes via cron (make nordvpn-schedule-recovery).
#
# Optional env vars:
#   RECOVERY_THRESHOLD  - seconds before forcing a rotation (default: 300)
#   COUNTRY_ID          - NordVPN country ID (default: 228 = US)
#   TUNNEL              - WireGuard tunnel description (default: NordVPNWG01)
#   GATEWAY_NAME        - pfSense gateway to monitor (default: NORDVPNWG_GW)
#   DOWN_STATE_FILE     - local file tracking first-down timestamp
#   LOG_FILE            - where to append output (default: /tmp/nordvpn-recover.log)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${LOG_FILE:-/tmp/nordvpn-recover.log}"

if [ -f "$PROJECT_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  . "$PROJECT_ROOT/.env"
fi

RECOVERY_THRESHOLD="${RECOVERY_THRESHOLD:-300}"
COUNTRY_ID="${COUNTRY_ID:-228}"
TUNNEL="${TUNNEL:-NordVPNWG01}"
GATEWAY_NAME="${GATEWAY_NAME:-NORDVPNWG_GW}"
DOWN_STATE_FILE="${DOWN_STATE_FILE:-/tmp/nordvpn-gw-down-since}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

NOW=$(date +%s)

# Query gateway status via pfSense API
GW_STATUS=$(node "$PROJECT_ROOT/cli.js" --help > /dev/null 2>&1; \
  node -e "
    const { getPfSenseClient } = require('$PROJECT_ROOT/lib/pfsense');
    getPfSenseClient().get('/api/v2/status/gateways', { params: { limit: 0 } })
      .then(r => {
        const gw = (r.data.data || []).find(g => g.name === '$GATEWAY_NAME');
        process.stdout.write(gw ? gw.status : 'unknown');
      })
      .catch(() => process.stdout.write('error'));
  " 2>/dev/null)

if [ "$GW_STATUS" = "online" ]; then
  # Gateway is up — clear any down-state tracking
  if [ -f "$DOWN_STATE_FILE" ]; then
    log "Gateway $GATEWAY_NAME recovered — clearing down-state"
    rm -f "$DOWN_STATE_FILE"
  fi
  exit 0
fi

if [ "$GW_STATUS" = "error" ] || [ "$GW_STATUS" = "unknown" ]; then
  log "Could not determine gateway status (API unreachable?) — skipping"
  exit 0
fi

# Gateway is down — record first-down time if not already set
if [ ! -f "$DOWN_STATE_FILE" ]; then
  echo "$NOW" > "$DOWN_STATE_FILE"
  log "Gateway $GATEWAY_NAME is $GW_STATUS — recording first-down (threshold: ${RECOVERY_THRESHOLD}s)"
  exit 0
fi

DOWN_SINCE=$(cat "$DOWN_STATE_FILE")
DOWN_AGE=$((NOW - DOWN_SINCE))

if [ "$DOWN_AGE" -lt "$RECOVERY_THRESHOLD" ]; then
  log "Gateway $GATEWAY_NAME down for ${DOWN_AGE}s — waiting for watchdog (threshold: ${RECOVERY_THRESHOLD}s)"
  exit 0
fi

# Threshold exceeded — force-rotate to a new server
log "Gateway $GATEWAY_NAME down for ${DOWN_AGE}s — escalating to force-rotation"

node "$PROJECT_ROOT/cli.js" nordvpn:rotate-wg \
  --country-id   "$COUNTRY_ID" \
  --tunnel       "$TUNNEL" \
  --gateway-name "$GATEWAY_NAME" \
  --force \
  2>&1 | tee -a "$LOG_FILE"

STATUS=${PIPESTATUS[0]:-$?}

if [ "$STATUS" -eq 0 ]; then
  # Reset down-since so we give the new server time to come up before rotating again
  echo "$NOW" > "$DOWN_STATE_FILE"
  log "Force-rotation complete — resetting down-state timer (will re-escalate in ${RECOVERY_THRESHOLD}s if still down)"
else
  log "Force-rotation failed (exit $STATUS) — will retry next cycle"
fi

exit "$STATUS"
