#!/bin/sh
# HAProxy watchdog loop — run via daemon(8), not directly

SOCKET="/tmp/haproxy.socket"
CHECK_INTERVAL=60
# Require 2 consecutive checks with UP+0-server backends before restarting
# (2 × CHECK_INTERVAL = 120s grace period for normal startup warmup)
CONSECUTIVE_THRESHOLD=2

consecutive_broken=0

while true; do
    sleep "${CHECK_INTERVAL}"

    # HAProxy not running at all — start it
    if ! pgrep -q haproxy 2>/dev/null; then
        echo "$(date): haproxy not running, starting"
        service haproxy.sh start 2>&1
        consecutive_broken=0
        continue
    fi

    # Stats socket not ready — skip this check
    if [ ! -S "${SOCKET}" ]; then
        consecutive_broken=0
        continue
    fi

    # Count BACKEND rows that are UP but have 0 active servers.
    # NOTE: HAProxy's downtime counter only increments when status=DOWN,
    # not when status=UP with 0 servers — so we track consecutive checks
    # instead of relying on the downtime field.
    broken=$(echo 'show stat' | nc -U "${SOCKET}" 2>/dev/null | awk -F',' '
        $2 == "BACKEND" && $18 == "UP" && $20 == "0" &&
        $1 != "HAProxyLocalStats" { count++ }
        END { print count+0 }
    ')

    if [ "${broken}" -gt 0 ]; then
        consecutive_broken=$((consecutive_broken + 1))
        echo "$(date): ${broken} backend(s) UP with 0 active servers (check ${consecutive_broken}/${CONSECUTIVE_THRESHOLD})"
        if [ "${consecutive_broken}" -ge "${CONSECUTIVE_THRESHOLD}" ]; then
            echo "$(date): threshold reached — hard-restarting haproxy"
            service haproxy.sh stop 2>&1
            sleep 3
            service haproxy.sh start 2>&1
            consecutive_broken=0
        fi
    else
        consecutive_broken=0
    fi
done
