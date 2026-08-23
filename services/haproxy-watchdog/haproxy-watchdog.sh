#!/bin/sh
#
# PROVIDE: haproxy_watchdog
# REQUIRE: haproxy
# KEYWORD: shutdown

. /etc/rc.subr

name="haproxy_watchdog"
rcvar=haproxy_watchdog_enable
pidfile="/var/run/haproxy_watchdog.pid"
logfile="/var/log/haproxy-watchdog.log"

start_cmd="haproxy_watchdog_start"
stop_cmd="haproxy_watchdog_stop"
status_cmd="haproxy_watchdog_status"

SOCKET="/tmp/haproxy.socket"
CHECK_INTERVAL=60
MIN_DOWNTIME=90
LOOP_SCRIPT="/usr/local/libexec/haproxy-watchdog-loop.sh"

haproxy_watchdog_start() {
    if [ -f "${pidfile}" ] && kill -0 "$(cat ${pidfile})" 2>/dev/null; then
        echo "${name} already running (PID $(cat ${pidfile}))"
        return 0
    fi
    echo "Starting ${name}."
    /usr/sbin/daemon -f -p "${pidfile}" -o "${logfile}" "${LOOP_SCRIPT}"
}

haproxy_watchdog_stop() {
    if [ -f "${pidfile}" ]; then
        echo "Stopping ${name}."
        kill "$(cat ${pidfile})" 2>/dev/null
        rm -f "${pidfile}"
    else
        echo "${name} not running."
    fi
}

haproxy_watchdog_status() {
    if [ -f "${pidfile}" ] && kill -0 "$(cat ${pidfile})" 2>/dev/null; then
        echo "${name} running as PID $(cat ${pidfile})"
    else
        echo "${name} not running"
    fi
}

load_rc_config "${name}"
: ${haproxy_watchdog_enable:=NO}
run_rc_command "$1"
