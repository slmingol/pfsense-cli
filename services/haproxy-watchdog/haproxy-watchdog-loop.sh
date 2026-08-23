#!/bin/sh
# HAProxy watchdog loop — run via daemon(8), not directly

SOCKET="/tmp/haproxy.socket"
CHECK_INTERVAL=60
MIN_DOWNTIME=90

while true; do
    sleep "${CHECK_INTERVAL}"

    # HAProxy not running at all — start it
    if ! pgrep -q haproxy 2>/dev/null; then
        echo "$(date): haproxy not running, starting"
        service haproxy.sh start 2>&1
        continue
    fi

    # Stats socket not ready — skip this check
    if [ ! -S "${SOCKET}" ]; then
        continue
    fi

    # Count BACKEND rows that are UP but have 0 active servers and have been
    # in that state longer than MIN_DOWNTIME seconds (field 75 = downtime_s)
    broken=$(echo 'show stat' | nc -U "${SOCKET}" 2>/dev/null | awk -F',' \
        -v min="${MIN_DOWNTIME}" '
        $2 == "BACKEND" && $18 == "UP" && $20 == "0" && $25+0 > min { count++ }
        END { print count+0 }
    ')

    if [ "${broken}" -gt 0 ]; then
        echo "$(date): ${broken} backend(s) UP with 0 active servers for >${MIN_DOWNTIME}s — hard-restarting haproxy"
        service haproxy.sh stop 2>&1
        sleep 3
        service haproxy.sh start 2>&1
    fi
done
