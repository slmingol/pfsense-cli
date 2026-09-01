# pfSense CLI

```
    ____  ______ ____                            __________    ____
   / __ \/ ____// __ \___  ____  ________       / ____/ /   /  _/
  / /_/ / /_   / / / / _ \/ __ \/ ___/ _ \     / /   / /    / /  
 / ____/ __/  / /_/ /  __/ / / (__  )  __/    / /___/ /____/ /   
/_/   /_/     \____/\___/_/ /_/____/\___/     \____/_____/___/   
                                                                  
         DNS & HAProxy Management made simple
```

[![CI](https://github.com/slmingol/pfsense-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/slmingol/pfsense-cli/actions/workflows/ci.yml)
[![Release](https://github.com/slmingol/pfsense-cli/actions/workflows/release.yml/badge.svg)](https://github.com/slmingol/pfsense-cli/actions/workflows/release.yml)
[![GitHub release](https://img.shields.io/github/v/release/slmingol/pfsense-cli)](https://github.com/slmingol/pfsense-cli/releases)
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool to manage DNS, HAProxy, and WireGuard VPN configuration in pfSense via the REST API.

<details>
<summary><strong>Table of Contents</strong></summary>

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Makefile site configuration](#makefile-site-configuration)
- [Usage](#usage)
  - [Help / List Available Commands](#help--list-available-commands)
  - [DNS Management](#dns-management)
  - [HAProxy Backend Management](#haproxy-backend-management)
  - [HAProxy Frontend Management](#haproxy-frontend-management)
  - [HAProxy Frontend Routing](#haproxy-frontend-routing)
  - [WireGuard](#wireguard)
  - [NordVPN WireGuard (NordLynx)](#nordvpn-wireguard-nordlynx)
  - [Firewall Alias Management](#firewall-alias-management)
  - [NAT Port Forward Management](#nat-port-forward-management)
  - [Bulk Operations](#bulk-operations)
  - [Certificate Management](#certificate-management)
  - [DHCP Static Mappings](#dhcp-static-mappings)
  - [Configuration History](#configuration-history)
  - [USB Config Backup](#usb-config-backup)
  - [SFP+ Optics Diagnostics](#sfp-optics-diagnostics)
  - [Package Update Checker](#package-update-checker)
- [Architecture](#architecture)
  - [DNS Strategy](#dns-strategy)
  - [HAProxy Configuration](#haproxy-configuration)
  - [Complete Workflow Example](#complete-workflow-example)
- [Helper Alias](#helper-alias)
- [Available Make Targets](#available-make-targets)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Technical Details](#technical-details)

</details>

## Features

✓ **DNS Management** - List, add, update, delete DNS Resolver entries  
✓ **DNS Aliases** - Add/delete aliases for host overrides  
✓ **HAProxy Backends** - Create and manage HAProxy backend servers; convert between IPs and hostnames (`use-dns`/`use-ip`); inspect raw JSON; apply and restart; clear resolver config  
✓ **HAProxy Frontends** - Create, delete, and list frontends; assign or swap SSL certificates  
✓ **HAProxy Frontend Routes** - Configure ACLs and actions for routing  
✓ **Complete Service Deployment** - One command to configure DNS + HAProxy  
✓ **Complete Service Teardown** - One command to remove DNS + HAProxy  
✓ **WireGuard VPN Provisioning** - Zero-touch setup from a `.conf` file: tunnel, peer, interface, gateway, NAT, kill-switch firewall rules  
✓ **NordVPN WireGuard** - Fetch credentials from API, list/rotate servers, teardown  
✓ **Firewall Alias Management** - Create/update pfSense host aliases; add or remove IPs without touching firewall rules  
✓ **Firewall Rule Management** - List, add, delete, and update pfSense firewall rules  
✓ **NAT Port Forward Management** - List, add, and delete inbound NAT port forward rules with optional auto-created firewall pass rule  
✓ **Bulk Operations** - Import multiple services, DNS entries, or HAProxy backends from a single JSON or CSV file with validation and dry-run support; export current config as a reimportable JSON snapshot  
✓ **Certificate Management** - List certificates with expiry dates, import cert+key pairs, delete, renew, and check expiry (Nagios-compatible exit codes); schedule daily cron alerts via `cert-check-schedule`  
✓ **Wildcard Cert Renewal** - Renew Let's Encrypt wildcard certs via acme.sh DNS-01 challenge and import into pfSense in one step  
✓ **DHCP Static Mappings** - List, add, update, and delete DHCP static host-to-IP assignments across all interfaces  
✓ **Configuration History** - List and prune pfSense config history revisions; install a scheduled cron job for automatic pruning  
✓ **SFP+ Optics Diagnostics** - Read transceiver DDM data (TX/RX power, temperature, voltage) for SFP+ interfaces  
✓ Idempotent - safe to re-run; all commands check before creating  
✓ Automatic configuration application  
✓ Self-signed certificate support  

## Prerequisites

- Docker and Docker Compose installed
- pfSense 2.5.0 or newer
- **pfSense RESTAPI package installed** (see below)
- API credentials (key and secret)

## Setup

1. **Install the pfSense RESTAPI Package** ⚠️ **Required!**
   
   The RESTAPI package is not installed by default. For pfSense 2.7.2:
   
   ```bash
   # SSH into pfSense and run:
   pkg install -y https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/v2.7.2/pfSense-2.7.2-pkg-RESTAPI.pkg
   /etc/rc.restart_webgui
   ```
   
   📖 **See [INSTALL_API.md](docs/INSTALL_API.md) for detailed installation instructions**

2. **Enable pfSense API**
   - In pfSense, go to System > API
   - Enable the API and create API credentials
   - Note your API key and secret

3. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your pfSense details:
   ```
   PFSENSE_HOST=https://192.168.1.1
   PFSENSE_API_KEY=your-api-key
   PFSENSE_API_SECRET=your-api-secret
   ```

4. **Build Docker Image**
   ```bash
   docker-compose build
   ```

5. **Set up shell alias (optional but recommended)**
   ```bash
   source scripts/setup-alias.sh
   # Or add to ~/.bashrc or ~/.zshrc for permanent setup
   ```

6. **Test API Connection**
   ```bash
   make test-api
   ```
   
   This will verify that:
   - Your credentials are correct
   - The pfSense API package is installed
   - The API is accessible from your machine
   
   If you get a 404 error, you need to install the pfSense API package (see SETUP.md)

### Makefile site configuration

The Makefile uses sensible defaults for the `add-service` / `delete-service` / `list-hosts` targets. Override them without modifying the Makefile by creating a `config.mk` (gitignored):

```bash
cp config.mk.example config.mk
```

Edit `config.mk`:

```makefile
HOST_BUB         = docker-host-01-svcs   # backend host (no domain)
HOST_LAMOLABS    = lamolabs-svcs         # frontend host (no domain)
DOMAIN_BACKEND   = bub.lan              # internal DNS domain
DOMAIN_FRONTEND  = lamolabs.org         # external/HAProxy domain
HAPROXY_FRONTEND = HomePrivateServers   # HAProxy frontend name
```

## Usage

### Help / List Available Commands

To see all available make targets:

```bash
make help
# or just 'make' (help is the default target)
```

This displays all commands with their required parameters, plus usage examples.

### Quick Start: Complete Service Deployment

Deploy a new service (DNS aliases + HAProxy backend + frontend route):

```bash
make add-service ALIAS=myapp PORT=3000 DESC="My Application"

# HOST_BUB / HOST_LAMOLABS: hostname (no domain) of an existing DNS entry
# in the respective domain. Run 'make list-hosts' to see valid values.
# Common patterns: docker-host-02-svcs, orangepi5-svcs, or any arbitrary name.
make add-service ALIAS=myapp PORT=3000 DESC="My Application" HOST_BUB=my-backend HOST_LAMOLABS=my-frontend

# SSL=true: use when the backend service itself serves HTTPS (e.g. port 443).
# HAProxy normally terminates SSL and connects to backends over plain HTTP.
# Only set this when the backend is HTTPS — most app ports (3000, 8080, etc.) don't need it.
make add-service ALIAS=myapp PORT=443 DESC="My Application" HOST_BUB=my-backend SSL=true
```

`add-service` runs four steps with colorized progress output:

```
[1/4] DNS alias myapp.example.local → docker-host-01-svcs.bub.lan (backend)
  ✓ Successfully added alias: myapp.example.local → ...
  ✓ DNS Resolver applied

[2/4] DNS alias myapp.example.com → lamolabs-svcs.lamolabs.org (frontend)
  ✓ Successfully added alias: myapp.example.com → ...
  ✓ DNS Resolver applied

[3/4] HAProxy backend myapp → myapp.example.local:3000
  ✓ Successfully created HAProxy backend: myapp
  ✓ Added server: myapp.example.local (myapp.example.local:3000)
  ✓ HAProxy applied

# With SSL=true the header shows [SSL]:
[3/4] HAProxy backend myapp → myapp.example.local:443 [SSL]
  ✓ Successfully created HAProxy backend: myapp
  ✓ Added server: myapp.example.local (myapp.example.local:443)
  ✓ HAProxy applied

[4/4] Frontend route myapp.example.com → myapp backend
  ✓ Created ACL: myapp
  ✓ Created action: myapp.example.com → myapp
  ✓ HAProxy applied
```

Steps are idempotent — re-running skips already-configured resources with an `ℹ` notice.

**Result:** Service accessible at `https://myapp.example.com`

**Traffic Flow:**
```
User → https://myapp.example.com
  ↓ DNS resolves to 192.168.1.1 (HAProxy frontend)
  ↓ HAProxy HomePrivateServers frontend matches ACL
  ↓ Routes to myapp backend
  ↓ Backend connects to myapp.example.local:3000
  ↓ DNS resolves to 192.168.1.100:3000 (actual service)
```

### Quick Start: Complete Service Teardown

Remove a service in reverse order (frontend route → HAProxy backend → DNS aliases):

```bash
make delete-service ALIAS=myapp

# If the service was deployed to non-default hosts, specify the same overrides:
make delete-service ALIAS=myapp HOST_BUB=my-backend HOST_LAMOLABS=my-frontend
```

`delete-service` runs four steps (reverse of `add-service`):

```
[1/4] Frontend route myapp.example.com
  ✓ Deleted frontend route for ACL: myapp
  ✓ HAProxy applied

[2/4] HAProxy backend myapp
  ✓ Successfully deleted HAProxy backend: myapp
  ✓ HAProxy applied

[3/4] DNS alias myapp.example.com → lamolabs-svcs.lamolabs.org (frontend)
  ✓ Successfully deleted alias: myapp.example.com
  ✓ DNS Resolver applied

[4/4] DNS alias myapp.example.local → docker-host-01-svcs.bub.lan (backend)
  ✓ Successfully deleted alias: myapp.example.local
  ✓ DNS Resolver applied
```

All steps use `|| true` — safe to re-run if a previous teardown was partial.

### DNS Management

```bash
# List all DNS entries
make dns-list

# Add a new DNS entry
make dns-add HOST=myserver DOMAIN=local.lan IP=192.168.1.100 DESC="My test server"

# Update an entry
make dns-update HOST=myserver DOMAIN=local.lan IP=192.168.1.101

# Delete an entry
make dns-delete HOST=myserver DOMAIN=local.lan

# Add an alias to an existing entry
make dns-alias-add HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan DESC="Web alias"

# Delete an alias
make dns-alias-delete HOST=myserver DOMAIN=local.lan ALIAS=www ALIAS_DOMAIN=local.lan

# Add alias to both internal and external domains
make add-dual-alias ALIAS=myservice DESC="My service description"
```

### HAProxy Backend Management

```bash
# List all HAProxy backends
make haproxy-list

# Add a backend with server
make haproxy-add NAME=myapp SERVER=myapp.example.local PORT=8080

# Delete a backend
make haproxy-delete NAME=myapp

# List frontends (bind address, mode, SSL cert)
make haproxy-frontend-list

# Create a frontend
make haproxy-frontend-add NAME=HomePrivateServers BIND=0.0.0.0:443 MODE=http CERT=my-wildcard-cert

# Delete a frontend
make haproxy-frontend-delete NAME=HomePrivateServers

# Assign or swap SSL cert on existing frontend
make haproxy-frontend-cert NAME=HomePrivateServers CERT=my-wildcard-cert

# Dry-run: show which backend addresses would be converted to .bub.lan hostnames
make haproxy-use-dns

# Apply: commit the conversion (scope to one backend with NAME=)
make haproxy-use-dns APPLY=true
make haproxy-use-dns NAME=myapp APPLY=true

# Dry-run: show which hostname addresses would be converted to static IPs
make haproxy-use-ip
make haproxy-use-ip NAME=myapp APPLY=true

# Inspect raw backend JSON (useful for debugging server fields like resolver)
make haproxy-inspect NAME=myapp

# Apply pending HAProxy config changes (reload without full restart)
make haproxy-apply

# Restart HAProxy (clears stale _0/_1 DOWN server-state entries)
# Note: pfSense API has no restart endpoint — this prints GUI instructions
make haproxy-restart

# Clear resolver config on backend servers (dry-run by default)
make haproxy-disable-resolver
make haproxy-disable-resolver NAME=myapp APPLY=true
```

#### HAProxy watchdog daemon

HAProxy can enter a broken state after pfSense gateway events (e.g. WireGuard tunnel drop) trigger `rc.newwanip → restart_packages` — the rapid restart race leaves backends `UP` with 0 active servers, causing 503s on all proxied services. The watchdog daemon detects and self-heals this.

Deploy to pfSense:

```bash
scp services/haproxy-watchdog/haproxy-watchdog.sh \
    admin@pfsense-rtr1.bub.lan:/usr/local/etc/rc.d/haproxy-watchdog.sh
scp services/haproxy-watchdog/haproxy-watchdog-loop.sh \
    admin@pfsense-rtr1.bub.lan:/usr/local/libexec/haproxy-watchdog-loop.sh
chmod +x /usr/local/etc/rc.d/haproxy-watchdog.sh \
          /usr/local/libexec/haproxy-watchdog-loop.sh
echo 'haproxy_watchdog_enable="YES"' >> /etc/rc.conf.local
service haproxy-watchdog.sh start
```

The daemon runs every 60s. If any backend is `UP` with 0 active servers for >90s it does a hard `stop && start` of HAProxy and logs to `/var/log/haproxy-watchdog.log`. Starts at boot, survives pfSense upgrades (stored in `/usr/local`).

```bash
# On pfSense — manage the watchdog
service haproxy-watchdog.sh status
service haproxy-watchdog.sh restart
service haproxy-watchdog.sh stop
```

### WireGuard

#### Generic provisioning (`wg:provision`)

`wg:provision` (alias: `wg:apply`) does a full zero-touch VPN setup from a standard WireGuard `.conf` file. Works with any WireGuard VPN provider. Fully idempotent — safe to re-run when switching servers or rotating keys.

**What it configures automatically:**

| Step | Resource |
|------|----------|
| 1 | WireGuard tunnel (listen port, MTU, private key) |
| 2 | WireGuard peer (public key, endpoint, AllowedIPs, keepalive 25s) |
| 3 | Interface assignment with static tunnel IP |
| 4 | Gateway with external monitor IP (default `1.1.1.1`) |
| 5 | Outbound NAT: LAN subnet → VPN interface address |
| 6 | WAN inbound rule for the WireGuard listen port (skipped if already covered) |
| 7 | Kill-switch LAN rules — alias mode (one pass + one block rule referencing a named alias) or per-IP mode (one pair per CIDR) |
| 8 | Apply all changes |

The existing floating WAN block rule (`tagged=vpntraffic`) provides the kill switch — if the VPN gateway goes offline, tagged traffic cannot exit WAN.

**Alias-based kill-switch** (`KS_ALIAS=`): instead of one rule pair per IP, provision creates/updates a named pfSense host alias with the kill-switch IPs and attaches a single pass+block rule pair to it. Adding hosts to the VPN route later only requires updating the alias — no new rules needed.

**Three steps that require the pfSense GUI (API limitation) — printed at the end of every run:**

1. **Gateway group** — `System > Routing > Gateway Groups > Add`  
   Trigger: Packet Loss or High Latency, Member: `<GW>` Tier 1

2. **Update LAN routing rule gateway** from the single gateway to the group  
   `Firewall > Rules > LAN` → edit the `pf-*-ks-*` pass rule → set gateway to the group

3. **Shellcmd** — `Services > Shellcmd > Add`  
   Type: shellcmd, Command: `route add -host <MONITOR_IP> <tunnel_gateway_ip>`  
   Ensures dpinger can reach the monitor IP after reboot before WireGuard establishes its first handshake.

```bash
# Alias mode (recommended): one rule pair references the alias; add IPs later without new rules
make wg-provision CONF=path/to/vpn.conf KILL_SWITCH='192.168.7.6/32' KS_ALIAS=RouteThroughNordVPN_WG
make wg-dry-run   CONF=path/to/vpn.conf KILL_SWITCH='192.168.7.6/32' KS_ALIAS=RouteThroughNordVPN_WG

# Per-IP mode (legacy): one rule pair per CIDR
make wg-provision CONF=path/to/vpn.conf KILL_SWITCH='192.168.7.6/32'

make wg-teardown                              # remove rules/NAT/gateway/peer
make wg-teardown KS_ALIAS=RouteThroughNordVPN_WG  # also delete the alias
make wg-teardown TUNNEL=MyVPN02 IFACE=MYVPN2
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CONF` | *(required)* | Path to WireGuard `.conf` file |
| `KILL_SWITCH` | `''` | Space-separated host CIDRs to kill-switch through the VPN |
| `KS_ALIAS` | `''` | pfSense alias name to use as kill-switch source (creates/updates the alias with `KILL_SWITCH` IPs) |
| `TUNNEL` | `ProtonVPN01` | Tunnel description in pfSense |
| `IFACE` | `PROTONVPN` | Interface description in pfSense |
| `GW` | *(derived: IFACE_GW)* | Gateway name |
| `GW_GROUP` | `ProtonVPN_GWGrp` | Gateway group name for multi-tunnel failover |
| `LISTEN_PORT` | `51821` | WireGuard listen port on pfSense |
| `MTU` | `1420` | WireGuard MTU |
| `MONITOR_IP` | `1.1.1.1` | Gateway monitor IP (must differ per tunnel) |
| `LAN_SUBNET` | `192.168.7.0/24` | LAN subnet for outbound NAT |
| `LAN` | `lan` | pfSense internal interface name for LAN |

#### ProtonVPN watchdog (120s deadlock prevention)

ProtonVPN WireGuard hits the same REKEY_AFTER_TIME=120s simultaneous-initiation deadlock as NordVPN. `scripts/protonvpn-wg-watchdog.sh` prevents this by proactively resetting the peer every 85 seconds when the gateway is online, and silencing initiations (removing the peer) during a 300-second backoff when offline. Unlike the NordVPN watchdog, there is no server rotation escalation — ProtonVPN uses a stable server per account.

```bash
# Deploy the watchdog to pfSense (SSH as root):
scp scripts/protonvpn-wg-watchdog.sh root@pfsense:/usr/local/bin/
ssh root@pfsense "
  chmod +x /usr/local/bin/protonvpn-wg-watchdog.sh
  cat > /var/db/protonvpn-wg-peer.conf << 'EOF'
PEER_PK=<server_pubkey>
ENDPOINT=<server_ip>:51820
ALLOWED_IPS=0.0.0.0/0,::/0
EOF
  chmod 600 /var/db/protonvpn-wg-peer.conf
  date +%s > /var/db/protonvpn-wg-last-reset
  echo '*/1 * * * * root /usr/local/bin/protonvpn-wg-watchdog.sh' \
    > /etc/cron.d/protonvpn-wg-watchdog
"
```

State files written to `/var/db/`:

| File | Purpose |
|------|---------|
| `protonvpn-wg-peer.conf` | Current peer pubkey and endpoint (fallback when `wg show` has no peer) |
| `protonvpn-wg-last-reset` | Timestamp of last peer reset — drives the 85s proactive reset cycle and 300s offline backoff |
| `protonvpn-wg-down-since` | Timestamp when the GW first went down — drives the 300s backoff timer |

Edit `WG_IFACE` and `GW_NAME` at the top of the script to match your tunnel (defaults: `tun_wg1` / `PROTONVPN_GW`).

---

### NordVPN WireGuard (NordLynx)

NordVPN WireGuard uses an account-wide private key (nordlynx_private_key) shared across all servers. All servers share the same public key. The NordVPN API is used to fetch credentials and find the lowest-load server.

#### Initial setup

```bash
# 1. Fetch your nordlynx_private_key and VPN credentials
NORDVPN_TOKEN=<access_token> make nordvpn-creds

# 2. List available US servers (country_id 228) sorted by load
make nordvpn-servers

# 3. Build a .conf file manually (Address derives gateway as x.x.x.x-1, omit DNS):
#    [Interface]
#    PrivateKey = <nordlynx_private_key>
#    Address    = 10.5.0.2/32
#
#    [Peer]
#    PublicKey          = xZSvRIZAae4khlgXjkeLVVtXTj2N1V2sORI/T4nKkDU=
#    Endpoint           = <server_ip>:51820
#    AllowedIPs         = 0.0.0.0/0,::/0
#    PersistentKeepalive = 25

# 4. Provision into pfSense (reuses an existing tunnel slot if --tunnel matches)
make wg-provision \
  CONF=NordVPNWG01-US-8495.conf \
  TUNNEL=NordVPNWG01 \
  IFACE=NORDVPNWG \
  GW=NORDVPNWG_GW \
  GW_GROUP=NordVPN_WG_GWGrp \
  LISTEN_PORT=51821 \
  KILL_SWITCH='192.168.7.6/32' \
  KS_ALIAS=RouteThroughNordVPN_WG
```

> **Gateway derivation for NordVPN**: NordVPN's WireGuard tunnel address is `10.5.0.2/32`. Omit the `DNS` field from the conf — `wg:provision` derives the gateway as `address - 1 = 10.5.0.1`. If DNS is present it is used as the gateway instead (wrong for NordVPN).

#### Server rotation

Fetches the lowest-load US WireGuard server from the NordVPN API and updates the peer endpoint in pfSense without a full teardown. Checks that `NORDVPNWG_GW` is online before rotating — skips silently if the tunnel is down. After rotating, automatically updates `/var/db/nordvpn-wg-peer.conf` on pfSense and applies the change directly to the running WireGuard kernel.

```bash
make nordvpn-rotate-wg

# Different country (country_id lookup: api.nordvpn.com/v1/servers/countries)
make nordvpn-rotate-wg COUNTRY_ID=228

# Preview without applying
make nordvpn-rotate-wg DRY_RUN=1

# Force rotate even when the gateway is currently down (use when the server is
# routing-dead: WG handshake alive but 100% packet loss through the tunnel)
make nordvpn-rotate-wg FORCE=1
```

`NORDVPN_TOKEN` is not required for rotation — the server list uses the public NordVPN API. It is only needed for `nordvpn-creds` (fetching the nordlynx_private_key).

After each rotation the watchdog peer conf and WG kernel are updated directly. The monitor route (`1.1.1.1 → 10.5.0.1 via tun_wg1`) is restored automatically by the watchdog on its next run — no manual `route add` needed.

#### Watchdog (120s deadlock prevention + auto-recovery)

NordVPN WireGuard (like most WireGuard implementations) hits a REKEY_AFTER_TIME=120s deadlock when both endpoints try to re-initiate simultaneously. The watchdog prevents this by proactively resetting the peer every 85 seconds when the gateway is online, and silences initiations (removes the peer) during a 300-second backoff when the gateway is offline.

**Auto-recovery escalation**: if the gateway stays down for more than ~8 minutes (ESCALATION_TIME=500s), the watchdog fetches a fresh NordVPN server from the public API using `fetch` + PHP (both native to pfSense/FreeBSD), swaps the peer via `wg set`, and updates the peer conf — no operator intervention required.

**Monitor route maintenance**: pfSense adds a host route `1.1.1.1 → 10.5.0.1 (tun_wg1)` on WG apply. Direct `wg set` calls (used by the watchdog and by `nordvpn-rotate-wg`) bypass pfSense apply and never restore this route. Without it, dpinger sends gateway probes via the WAN interface instead of the WG tunnel, sees 100% loss, and declares the gateway down — even when the WireGuard handshake is live and the NordVPN server is healthy. The watchdog's `ensure_monitor_route()` checks and restores this route on every peer change and every healthy-gateway run, making it self-healing after reboots.

**Escalation grace period**: after escalation sets a new peer, the watchdog skips the backoff `remove_peer` call for 300s so pfSense's gateway monitor has time to register recovery before the peer is yanked.

```bash
# Deploy the watchdog to pfSense (SSH as root):
scp scripts/nordvpn-wg-watchdog.sh root@pfsense:/usr/local/bin/
ssh root@pfsense "
  chmod +x /usr/local/bin/nordvpn-wg-watchdog.sh
  cat > /var/db/nordvpn-wg-peer.conf << 'EOF'
PEER_PK=<server_pubkey>
ENDPOINT=<server_ip>:51820
ALLOWED_IPS=0.0.0.0/0,::/0
EOF
  chmod 600 /var/db/nordvpn-wg-peer.conf
  date +%s > /var/db/nordvpn-wg-last-reset
  echo '*/1 * * * * root /usr/local/bin/nordvpn-wg-watchdog.sh' \
    > /etc/cron.d/nordvpn-wg-watchdog
"
```

State files written to `/var/db/`:

| File | Purpose |
|------|---------|
| `nordvpn-wg-peer.conf` | Current peer pubkey and endpoint (fallback when `wg show` has no peer) |
| `nordvpn-wg-last-reset` | Timestamp of last peer reset — drives the 300s backoff between reactive reset attempts |
| `nordvpn-wg-down-since` | Timestamp when the GW first went down — drives the 500s escalation timer (never reset during reactive resets) |
| `nordvpn-wg-last-escalation` | Timestamp of last server rotation — drives the 300s post-escalation grace period |

#### Tear down

```bash
make nordvpn-teardown-wg                  # remove rules, NAT, gateway, peer; leave tunnel
make nordvpn-teardown-wg DELETE_TUNNEL=1  # also delete the WireGuard tunnel
```

#### NordVPN make targets

| Target | Description |
|--------|-------------|
| `nordvpn-servers` | List recommended WireGuard servers (`COUNTRY_ID=228`) |
| `nordvpn-creds` | Fetch nordlynx_private_key from API (`NORDVPN_TOKEN=`) |
| `nordvpn-rotate-wg` | Rotate to lowest-load server — checks gateway first, updates WG kernel and watchdog peer conf (`COUNTRY_ID=`, `TUNNEL=`, `GW_NAME=`, `DRY_RUN=`, `FORCE=`) |
| `nordvpn-teardown-wg` | Remove kill-switch rules, NAT, gateway, peer (`TUNNEL=`, `IFACE=`, `GW=`, `DELETE_TUNNEL=`) |

### Firewall Alias Management

pfSense firewall aliases are named groups of IPs, networks, or ports that can be referenced in firewall rules. Managing kill-switch hosts through an alias means adding a new host to the VPN route only requires updating the alias — no new rules are needed.

```bash
# List all aliases (or filter by name)
make fw-alias-list
make fw-alias-list FILTER=NordVPN

# Add a host to the kill-switch alias
make fw-alias-add-host NAME=RouteThroughNordVPN_WG HOST=192.168.7.7 DETAIL='pi-vpn2'

# Remove a host
make fw-alias-remove-host NAME=RouteThroughNordVPN_WG HOST=192.168.7.7

# Create a new alias with initial hosts
make fw-alias-create NAME=RouteThroughNordVPN_WG HOST='192.168.7.6' DESC='Kill-switch hosts routed via NordVPN WireGuard'

# Delete an alias entirely
make fw-alias-delete NAME=RouteThroughNordVPN_WG
```

The `RouteThroughNordVPN_WG` alias is referenced by two firewall rules in `Firewall > Rules > LAN`:

| Rule | Type | Source | Gateway |
|------|------|--------|---------|
| `pf-protonvpn-ks-RouteThroughNordVPN_WG` | pass | `RouteThroughNordVPN_WG` | `NordVPN_WG_GWGrp` |
| `pf-protonvpn-ks-fallback-RouteThroughNordVPN_WG` | block | `RouteThroughNordVPN_WG` | *(none — kill-switch fallback)* |

The pass rule must sit above the general VPN routing rule; the block rule must immediately follow. Both are created automatically by `wg-provision KS_ALIAS=...`.

### NAT Port Forward Management

Create and manage inbound NAT port forward rules (Firewall > NAT > Port Forward). Pass `ADD_FW_RULE=1` to automatically create the associated WAN firewall pass rule at the same time.

```bash
# List all port forward rules (or filter by description)
make nat-list
make nat-list FILTER=Transmission

# Add a port forward — WAN:51413 → 192.168.13.10:51413, with auto firewall rule
make nat-add NAT_PORT=51413 NAT_TARGET=192.168.13.10 NAT_DESC="Transmission torrent client" ADD_FW_RULE=1

# Forward to a different internal port
make nat-add NAT_PORT=2022 NAT_TARGET=192.168.7.34 NAT_LOCAL_PORT=22 NAT_PROTO=tcp NAT_DESC="SSH to pivot"

# Delete by id (from nat-list) or exact description
make nat-delete NAT_ID=14
make nat-delete NAT_DESC="Transmission torrent client"
```

API endpoints: `GET /api/v2/firewall/nat/port_forwards` (list), `POST/DELETE /api/v2/firewall/nat/port_forward` (create/delete).

### Bulk Operations

Import and export DNS entries and HAProxy configuration in a single command. Import validates all records before applying. Export produces a JSON snapshot compatible with bulk:import.

#### Export

```bash
# Export current DNS + HAProxy config to JSON (stdout)
make bulk-export

# Write to a file
make bulk-export OUT=snapshot.json

# Re-import later
make bulk-import BULK_FILE=snapshot.json DRY_RUN=1   # preview
make bulk-import BULK_FILE=snapshot.json              # apply
```

The export includes `dns`, `haproxy`, and `frontends` keys. The `frontends` key is metadata-only (not yet consumable by bulk:import) but useful for snapshots.

#### Dry run (preview without applying)

```bash
make bulk-import BULK_FILE=examples/bulk-services.json DRY_RUN=1
make bulk-import BULK_FILE=examples/bulk-services.csv  DRY_RUN=1
```

#### Apply

```bash
make bulk-import BULK_FILE=examples/bulk-services.json
```

#### JSON format

Three top-level keys are supported. You can mix them in one file:

```json
{
  "services": [
    {
      "alias": "grafana",
      "port": "3000",
      "description": "Grafana — metrics dashboard",
      "ssl": false
    }
  ],
  "dns": [
    {
      "host": "nas01",
      "domain": "bub.lan",
      "ip": "192.168.7.20",
      "description": "TrueNAS primary"
    }
  ],
  "haproxy": [
    {
      "name": "myapp",
      "server": "myapp.bub.lan",
      "port": "8080",
      "ssl": false
    }
  ]
}
```

A bare JSON array is treated as `services`.

#### CSV format

The record type is inferred from the header columns:

| Header columns | Record type |
|----------------|-------------|
| `alias`, `port`, `description` | services |
| `host`, `domain`, `ip` | dns |
| `name`, `server`, `port` | haproxy |

**Services CSV** (also accepts `ssl`, `host_bub`, `host_lamolabs` columns):

```csv
alias,port,description,ssl
uptime-kuma,3001,Uptime Kuma — status monitoring,false
vaultwarden,8080,Vaultwarden — password manager,false
```

**DNS CSV**:

```csv
host,domain,ip,description
nas01,bub.lan,192.168.7.20,TrueNAS primary
```

Comments (lines starting with `#`) are stripped.

#### Service record fields

A `services` record creates four resources per entry (same as `make add-service`):

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `alias` | yes | | Service name / hostname prefix |
| `port` | yes | | Backend port number |
| `description` | yes | | Human-readable label |
| `ssl` | no | `false` | Whether the backend speaks HTTPS |
| `host_bub` | no | `docker-host-01-svcs` | Backend DNS host |
| `host_lamolabs` | no | `lamolabs-svcs` | Frontend DNS host |

See `examples/` for ready-to-use sample files.

### Alternative: Gluetun (Docker-based VPN client)

[Gluetun](https://github.com/qdm12/gluetun) is a Docker container that manages VPN connections directly, with native support for ProtonVPN, NordVPN, Mullvad, and many others. It is an alternative to configuring WireGuard inside pfSense.

**How it differs from the pfSense approach:**

| | pfSense WireGuard (this tool) | Gluetun |
|---|---|---|
| VPN scope | Whole network or per-firewall-rule | Per Docker container or host |
| Peer renewal | Manual or watchdog script | Automatic (`UPDATER_PERIOD`) |
| Kill switch | pfSense floating firewall rule | Built-in container firewall |
| Complexity | High (API provisioning, watchdog) | Low (env vars in docker-compose) |

**When to use Gluetun instead:**

- You only need specific Docker services (e.g. a torrent client, a media grabber) to route through VPN, not your whole LAN
- You want automatic peer renewal without watchdog scripts — Gluetun fetches fresh server configs on a schedule and reconnects when a peer goes stale
- You want a simpler setup that doesn't touch pfSense at all

**When to stick with pfSense WireGuard (this tool):**

- You need whole-network or subnet-level VPN routing enforced at the firewall
- You need kill-switch guarantees at the network layer, not just per-container
- You need gateway groups and failover across multiple VPN tunnels

**Quick example (ProtonVPN via Gluetun):**

```yaml
services:
  gluetun:
    image: qmcgaw/gluetun
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      - VPN_SERVICE_PROVIDER=protonvpn
      - VPN_TYPE=wireguard
      - WIREGUARD_PRIVATE_KEY=<your-private-key>
      - SERVER_COUNTRIES=US
      - UPDATER_PERIOD=24h   # auto-refresh server list and reconnect

  my-app:
    image: my-app
    network_mode: service:gluetun   # routes through VPN
```

The `UPDATER_PERIOD` setting is what resolves the peer renewal problem encountered with pfSense: Gluetun periodically pulls a fresh server list from the provider API and reconnects, eliminating the need for watchdog scripts or manual key rotation.

### HAProxy Frontend Management

Manage frontends (bind address, mode, SSL cert) directly:

```bash
# List frontends
make haproxy-frontend-list

# Create a frontend
make haproxy-frontend-add NAME=HomePrivateServers BIND=0.0.0.0:443 MODE=http CERT=my-wildcard-cert

# Delete a frontend
make haproxy-frontend-delete NAME=HomePrivateServers

# Assign or swap SSL cert on existing frontend
make haproxy-frontend-cert NAME=HomePrivateServers CERT=my-wildcard-cert
```

### HAProxy Frontend Routing

Frontend routes connect hostnames to backends using ACLs and actions:

```bash
# Add frontend route (ACL + Action)
docker-compose run --rm pfsense-cli haproxy:route-add \
  --frontend HomePrivateServers \
  --acl myapp \
  --hostname myapp.example.com \
  --backend myapp

# Delete frontend route
docker-compose run --rm pfsense-cli haproxy:route-delete \
  --frontend HomePrivateServers \
  --acl myapp
```

### Advanced: Using Docker Compose Directly

For more control, use docker-compose commands directly:

```bash
# DNS operations
docker-compose run --rm pfsense-cli list
docker-compose run --rm pfsense-cli list --filter myhost
docker-compose run --rm pfsense-cli add --host myserver --domain local.lan --ip 192.168.1.100
docker-compose run --rm pfsense-cli update --host myserver --domain local.lan --ip 192.168.1.101
docker-compose run --rm pfsense-cli delete --host myserver --domain local.lan

# DNS aliases
docker-compose run --rm pfsense-cli alias:add \
  --host myserver --domain local.lan \
  --alias-host www --alias-domain local.lan \
  --description "Web alias"

# HAProxy backends
docker-compose run --rm pfsense-cli haproxy:list
docker-compose run --rm pfsense-cli haproxy:add \
  --name myapp \
  --server-name myapp.example.local \
  --server-address myapp.example.local \
  --server-port 8080

# HAProxy frontends
docker-compose run --rm pfsense-cli haproxy:frontend-list
docker-compose run --rm pfsense-cli haproxy:frontend-add \
  --name HomePrivateServers --bind 0.0.0.0:443 --mode http --cert my-wildcard-cert
docker-compose run --rm pfsense-cli haproxy:frontend-delete --name HomePrivateServers
docker-compose run --rm pfsense-cli haproxy:frontend-cert \
  --name HomePrivateServers --cert my-wildcard-cert

# HAProxy frontend routes
docker-compose run --rm pfsense-cli haproxy:route-add \
  --frontend HomePrivateServers \
  --acl myapp \
  --hostname myapp.example.com \
  --backend myapp
```

### Certificate Management

Manage SSL certificates stored in the pfSense certificate manager. Certificates listed here can be assigned to HAProxy frontends.

```bash
# List all certificates with expiry info
make cert-list

# Filter by name
make cert-list FILTER=mysite

# Show only certificates expiring within 30 days
make cert-list EXPIRING=30

# Import a cert+key from PEM files
make cert-import CERT_NAME=mysite CERT_FILE=mysite.crt KEY_FILE=mysite.key

# Import as a user (client) certificate
make cert-import CERT_NAME=client-cert CERT_FILE=client.crt KEY_FILE=client.key CERT_TYPE=user

# Delete a certificate by name
make cert-delete CERT_NAME=mysite

# Delete by refid (from cert-list output)
make cert-delete CERT_REFID=6789abc123

# Renew an internally-generated certificate
make cert-renew CERT_NAME=mysite

# Check for expiring/expired certs (exits 1 if found — Nagios/monitoring compatible)
make cert-check

# Check with a custom threshold (default 30 days)
make cert-check EXPIRING=60

# Schedule a daily cron job to run cert-check (default: 08:00)
make cert-check-schedule
make cert-check-schedule EXPIRING=60 CERT_CHECK_SCHEDULE="0 6 * * *"

# Show or remove the cron job
make cert-check-cron-status
make cert-check-unschedule
```

> **Let's Encrypt**: Obtain the certificate using any ACME client (certbot, acme.sh, etc.) on a host that can fulfill the challenge, then import the resulting `fullchain.pem` and `privkey.pem` with `cert-import`. The pfSense ACME package is not exposed via the REST API.

> **Cert in use**: pfSense returns HTTP 403 if you try to delete a certificate that is referenced by a service (e.g. an active HAProxy frontend). Remove the reference in the GUI or via the API first.

#### Wildcard Certificate Renewal

Automate renewal of a Let's Encrypt wildcard certificate via DNS-01 challenge (acme.sh) and import the result into pfSense:

```bash
# Renew *.lamolabs.org and import as "wildcard-lamolabs" in pfSense cert manager
make cert-renew-wildcard DOMAIN=lamolabs.org CERT_NAME=wildcard-lamolabs

# Use a different DNS provider hook (default: dns_cf for Cloudflare)
make cert-renew-wildcard DOMAIN=example.com CERT_NAME=wildcard-example DNS_HOOK=dns_aws

# Test with Let's Encrypt staging
STAGING=1 make cert-renew-wildcard DOMAIN=lamolabs.org CERT_NAME=wildcard-lamolabs
```

Required environment variables (set in `.env` or shell):

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Base domain (e.g. `lamolabs.org`) — cert will cover `*.DOMAIN` and `DOMAIN` |
| `CERT_NAME` | Name to use in pfSense certificate manager |
| `DNS_HOOK` | acme.sh DNS plugin (default: `dns_cf`) |
| `CF_Token` / `CF_Account_ID` | Cloudflare API credentials (for `dns_cf`) |

acme.sh must be installed (`~/.acme.sh/acme.sh`). The script treats exit code 2 (not yet due) as success, so it is safe to run on a schedule.

### DHCP Static Mappings

Manage DHCP static host-to-IP assignments across all interfaces. Reads from the embedded `staticmap` arrays returned by the pfSense DHCP server API; writes via the singular static_mapping endpoint with automatic apply.

```bash
# List all static mappings across all interfaces
make dhcp-list

# Filter by MAC, IP, hostname, or description
make dhcp-list FILTER=k8s
make dhcp-list FILTER=192.168.7

# Limit to a single interface
make dhcp-list IFACE=lan

# Add a static mapping
make dhcp-add IFACE=lan MAC=aa:bb:cc:dd:ee:ff IP=192.168.7.50 HOSTNAME_VAL=myhost DESC="my device"

# Add with a custom DNS server
make dhcp-add IFACE=lan MAC=aa:bb:cc:dd:ee:ff IP=192.168.7.50 DNS=192.168.7.1

# Update an existing mapping (looked up by MAC)
make dhcp-update IFACE=lan MAC=aa:bb:cc:dd:ee:ff IP=192.168.7.51 HOSTNAME_VAL=newname

# Delete a mapping
make dhcp-delete IFACE=lan MAC=aa:bb:cc:dd:ee:ff
```

Interface names match pfSense convention (`lan`, `opt2`, `opt3`, etc.). Changes are applied immediately via `dhcp_server/apply` after each mutation.

### Configuration History

pfSense automatically records a config history entry each time a change is applied. These entries can be listed and pruned through the API. Downloading or restoring a config revision is not exposed by the pfSense REST API v2 — use the GUI (`Diagnostics > Backup & Restore`) or SCP the file directly from `/cf/conf/backup/`.

```bash
# List all config history revisions, newest first
make config-history

# Show only the 10 most recent
make config-history LIMIT=10

# Delete revisions older than 30 days
make config-history-prune OLDER_THAN=30

# Keep only the 20 most recent revisions, delete the rest
make config-history-prune KEEP_LAST=20
```

#### Scheduled auto-pruning

Install a cron job on the local machine to prune config history on a schedule:

```bash
# Install: daily at 3am, keep last 20 revisions (default schedule)
make config-history-schedule KEEP_LAST=20

# Custom schedule and retention
make config-history-schedule KEEP_LAST=30 PRUNE_SCHEDULE="0 2 * * 0"   # Sundays at 2am

# Combine both policies
make config-history-schedule KEEP_LAST=20 OLDER_THAN=60

# Show installed cron job
make config-history-cron-status

# Remove the cron job
make config-history-unschedule
```

Prune output is appended to `/tmp/pfsense-config-prune.log` by default (override with `LOG_FILE=`). The script sources `.env` automatically, so no credential setup is needed beyond the existing `.env` file.

### USB Config Backup

Backs up pfSense `config.xml` to a USB drive attached to the router. The backup script (`scripts/backup-config-to-usb.sh`) runs on pfSense and is stored on the USB itself so it persists across pfSense reinstalls.

**First-time setup (or after reinstall/recovery):**

```bash
# Check what USB device is visible and whether it's mounted
make backup-usb-status

# Deploy backup script to USB and install hourly cron on pfSense
make backup-usb-install USB_DEV=da0s1

# Custom schedule (every 6 hours) and retention (60 backups)
make backup-usb-install USB_DEV=da0s1 KEEP_LAST=60 BACKUP_SCHEDULE="0 */6 * * *"
```

**Day-to-day:**

```bash
# Run a backup now
make backup-usb-now

# Check backup status, recent files, and cron entry
make backup-usb-status
```

**How it works:**

1. `backup-usb-install` mounts `/dev/USB_DEV` at `/mnt/usb_backup`, writes the backup script, `RECOVERY.md`, and `install-api.sh` to the USB root, then installs a cron job via the pfSense RESTAPI v2 cron endpoint (stored in `config.xml`). Falls back to `/etc/cron.d/` if the cron API is unavailable.
2. The cron job runs `backup.sh` on pfSense, copies `/cf/conf/config.xml` to `/mnt/usb_backup/pfsense-backups/config-<timestamp>.xml`, and rotates old files beyond `KEEP_LAST`.
3. All recovery tools are on the USB itself — after reinstall, plug in the USB and follow `RECOVERY.md`. Re-run `backup-usb-install` to restore the cron entry.

**USB root after install:**

```
/mnt/usb_backup/
  RECOVERY.md           — step-by-step reinstall recovery guide
  backup.sh             — hourly backup script
  install-api.sh        — pfSense RESTAPI package installer
  pfsense-backups/      — config snapshots
    config-<ts>.xml
```

**Refresh recovery files only** (if README or install-api.sh changed):

```bash
make backup-usb-readme USB_DEV=da0s1 KEEP_LAST=90
```

**USB device detection:** Use `make backup-usb-status` to see which `/dev/da*` devices are present. On most systems the USB drive is `da0` and the first partition is `da0s1` (FAT32). Adjust `USB_DEV` if your setup differs.

| Variable | Default | Description |
|----------|---------|-------------|
| `USB_DEV` | `da0s1` | USB partition device node |
| `KEEP_LAST` | `30` | Number of backup files to retain |
| `BACKUP_SCHEDULE` | `0 * * * *` | Cron schedule (hourly) |

Cron log: `/tmp/pfsense-usb-backup.log` on pfSense.

### SFP+ Optics Diagnostics

Read transceiver DDM (Digital Diagnostic Monitoring) data from SFP+ interfaces via the pfSense diagnostics API. Useful for verifying signal levels and module health without SSH.

```bash
# Auto-detect SFP+ interfaces and show all
make optics-show

# Show a specific interface
make optics-show IFACE=ix0
```

Output includes module type, vendor/PN/SN, TX/RX power (dBm), temperature, voltage, and bias current. RX/TX power is color-coded:

| Color | Range | Meaning |
|-------|-------|---------|
| Green | > -10 dBm | Good signal |
| Yellow | -10 to -25 dBm | Marginal |
| Red | < -25 dBm | Weak |
| Red (no signal) | -40 dBm | No fiber connected |

> **Driver support**: Tested with the `ix` driver (Intel X550/X540 10G). Other SFP+ drivers (`ixl`, `cxgbe`, `sfxge`) are auto-detected by prefix. Output format varies by driver — if DDM parsing fails, raw optics-related lines are shown instead.

> **Requirement**: `diagnostics/command_prompt` must be enabled in pfSense API settings (`System > API`).

### Package Update Checker

Deploys `pkg_check.php` to pfSense and installs a daily cron job that checks for available package updates and sends a notification when updates are found.

```bash
# Deploy script and install cron job (daily at 07:30, default)
pfsense pkgcheck:install

# Custom schedule
pfsense pkgcheck:install --schedule "0 6 * * *"   # 06:00 daily
```

What it does:

1. Writes `pkg_check.php` to `/usr/local/sbin/` on pfSense via the command prompt API
2. Installs a cron job (`30 7 * * *` by default) via the pfSense REST API v2, with automatic fallback to `cron.inc` PHP for older API versions
3. Removes any pre-existing `pkg_check.php` cron entry before re-adding (idempotent)

#### Notification methods

The script uses pfSense's built-in notification functions — all rely on credentials configured under `System > Advanced > Notifications`. Edit `scripts/pkg_check.php` to choose the method(s) before deploying:

| Method | Function | Notes |
|--------|----------|-------|
| Slack | `notify_via_slack($msg)` | **Default** — uses pfSense's configured Slack webhook |
| All configured targets | `notify_all_remote($msg)` | Sends to every enabled target (email, Pushover, Slack, etc.) |
| SMTP / email | `notify_via_smtp($msg)` | Uses pfSense's SMTP settings |
| Pushover | `notify_via_pushover($msg)` | Requires Pushover credentials in pfSense |
| Telegram | `notify_via_telegram($msg)` | Requires Telegram bot token in pfSense |

To switch methods, uncomment the desired line(s) and comment out `notify_via_slack`, then re-run `pkgcheck:install` to redeploy.

> **Requirement**: `diagnostics/command_prompt` must be enabled in pfSense API settings (`System > API`).

## Architecture

### DNS Strategy

- **`.example.local` domain**: Internal DNS resolution for backend servers
  - Example: `myapp.example.local` → `192.168.1.100:3000`
  - Used by HAProxy backends to reach actual services
  - Not exposed to end users

- **`.example.com` domain**: Public-facing frontend access
  - Example: `myapp.example.com` → `192.168.1.1` (HAProxy)
  - Used by end users to access services
  - Routed through HAProxy for load balancing, SSL termination, etc.

### HAProxy Configuration

- **Backends**: Define where traffic goes (server + port)
  - Uses `.example.local` hostnames to resolve to actual service IPs
  
- **Frontend**: `HomePrivateServers` (main frontend)
  - **ACLs**: Match incoming hostnames (e.g., `myapp.example.com`)
  - **Actions**: Route matched traffic to specific backends

### Complete Workflow Example

```bash
# Deploy
make add-service ALIAS=myapp PORT=3000 DESC="My Application"
make add-service ALIAS=myapp PORT=3000 DESC="My Application" HOST_BUB=my-backend HOST_LAMOLABS=my-frontend

# Tear down
make delete-service ALIAS=myapp
make delete-service ALIAS=myapp HOST_BUB=my-backend HOST_LAMOLABS=my-frontend
```

`add-service` creates:
1. **DNS**: `myapp.example.local` → backend host (default: `docker-host-01-svcs.bub.lan`, override with `HOST_BUB`)
2. **DNS**: `myapp.example.com` → frontend host (default: `lamolabs-svcs.lamolabs.org`, override with `HOST_LAMOLABS`)
3. **HAProxy Backend**: `myapp` → connects to `myapp.example.local:3000`
4. **HAProxy Frontend**: Routes `myapp.example.com` → `myapp` backend

`delete-service` removes all four in reverse order.

User accesses `https://myapp.example.com` → routed through HAProxy → reaches service at `192.168.1.100:3000`

## Helper Alias

### Quick Setup

Source the provided setup script:

```bash
source /path/to/pfsense-cli/scripts/setup-alias.sh
```

Or add it permanently to your `~/.bashrc` or `~/.zshrc`:

```bash
# pfSense CLI
source /path/to/pfsense-cli/scripts/setup-alias.sh
```

### Manual Setup

Alternatively, add this alias directly:

```bash
alias pfsense='make -C /path/to/pfsense-cli'
```

### Using the Alias

Once configured, use shortened commands:
```bash
pfsense dns-list
pfsense add-service ALIAS=myapp PORT=3000 DESC="My Application"
pfsense haproxy-list
```

**The setup script includes comprehensive usage examples in its comments!**

## Available Make Targets

```bash
make help               # Show all available targets (default)
make build              # Build Docker image
make test-api           # Test API connectivity
make list-hosts         # Show valid HOST_BUB / HOST_LAMOLABS values from live DNS
make dns-list           # List DNS entries
make dns-add            # Add DNS entry
make dns-update         # Update DNS entry
make dns-delete         # Delete DNS entry
make dns-alias-add      # Add DNS alias
make dns-alias-delete   # Delete DNS alias
make add-dual-alias     # Add DNS alias to both domains
make haproxy-list       # List HAProxy backends
make haproxy-add        # Add HAProxy backend
make haproxy-delete     # Delete HAProxy backend
make haproxy-use-dns    # Convert IP backend addresses to .bub.lan hostnames (APPLY=true to commit)
make add-service        # Complete service deployment (DNS + HAProxy); SSL=true for HTTPS backends
make delete-service     # Complete service teardown (reverse of add-service)
make wg-status               # Show WireGuard tunnel and peer status
make wg-provision            # Full VPN provisioning from a .conf file (alias: wg-apply)
make wg-dry-run              # Preview wg-provision without making changes
make wg-teardown             # Remove WireGuard rules, NAT, gateway, and peer (KS_ALIAS= to also delete alias)
make nordvpn-servers         # List recommended NordVPN WireGuard servers
make nordvpn-creds           # Fetch NordVPN nordlynx_private_key from API
make nordvpn-rotate-wg       # Rotate NordVPN WireGuard to lowest-load server
make nordvpn-teardown-wg     # Remove NordVPN WireGuard rules, NAT, gateway, peer
make fw-alias-list           # List pfSense firewall aliases (FILTER= optional)
make fw-alias-create         # Create or update a host alias (NAME= HOST= DESC=)
make fw-alias-add-host       # Add a host/IP to an alias (NAME= HOST= DETAIL=)
make fw-alias-remove-host    # Remove a host/IP from an alias (NAME= HOST=)
make fw-alias-delete         # Delete an alias (NAME=)
make fw-rule-list            # List firewall rules (FILTER= RULE_IFACE= RULE_TYPE=)
make fw-rule-add             # Add a firewall rule (RULE_TYPE= RULE_IFACE= RULE_SRC= RULE_DEST= RULE_GW= ...)
make fw-rule-delete          # Delete a firewall rule (RULE_ID= or RULE_DESC=)
make fw-rule-update          # Update a firewall rule field (RULE_ID= or RULE_DESC=, ENABLE=1 DISABLE=1)
make nat-list                # List NAT port forward rules ([FILTER=])
make nat-add                 # Add a port forward (NAT_PORT= NAT_TARGET= [NAT_PROTO=tcp/udp] [NAT_LOCAL_PORT=] [NAT_DESC=] [ADD_FW_RULE=1])
make nat-delete              # Delete a port forward (NAT_ID= or NAT_DESC=)
make bulk-import             # Bulk import services/DNS/HAProxy from JSON or CSV (BULK_FILE= [DRY_RUN=1])
make cert-list               # List certificates with expiry info (FILTER= EXPIRING=<days>)
make cert-import             # Import cert+key PEM files (CERT_NAME= CERT_FILE= KEY_FILE= [CERT_TYPE=])
make cert-delete             # Delete a certificate (CERT_NAME= or CERT_REFID=)
make cert-renew              # Renew an internally-generated certificate (CERT_NAME= or CERT_REFID=)
make config-history          # List config history revisions ([LIMIT=N])
make config-history-prune    # Prune old config revisions (OLDER_THAN=<days> or KEEP_LAST=<n>)
make backup-usb-status       # Check USB device, mount state, and backup files on pfSense
make backup-usb-now          # Run a USB config backup immediately ([USB_DEV=da0s1])
make backup-usb-install      # Deploy backup script and install cron ([USB_DEV=da0s1] [KEEP_LAST=30])
make backup-usb-readme       # Refresh RECOVERY.md and install-api.sh on the USB
make optics-show             # Show SFP+ transceiver DDM diagnostics ([IFACE=ix0])
make clean              # Clean up Docker resources
```

## Documentation

- **[setup-alias.sh](scripts/setup-alias.sh)** — adds a `pfsense` shell alias pointing at `node cli.js`. Source from `~/.bashrc` or `~/.zshrc`.
- **[check-certs.sh](scripts/check-certs.sh)** — cron-safe cert expiry wrapper; sources `.env`, logs with timestamps, exits 1 on expiry. Installed by `make cert-check-schedule`.
- **[prune-config-history.sh](scripts/prune-config-history.sh)** — cron-safe config history prune wrapper. Installed by `make config-history-schedule`.
- **[renew-wildcard-cert.sh](scripts/renew-wildcard-cert.sh)** — renews a wildcard cert via acme.sh and imports it into pfSense. Used by `make cert-renew-wildcard`.
- **[protonvpn-wg-watchdog.sh](scripts/protonvpn-wg-watchdog.sh)** — ProtonVPN WireGuard deadlock-prevention watchdog; runs on the pfSense router via cron. See [ProtonVPN watchdog](#protonvpn-watchdog-120s-deadlock-prevention).
- **[nordvpn-wg-watchdog.sh](scripts/nordvpn-wg-watchdog.sh)** — NordVPN WireGuard watchdog with auto-recovery server rotation. See [NordVPN Watchdog](#watchdog-120s-deadlock-prevention--auto-recovery).
- **[backup-config-to-usb.sh](scripts/backup-config-to-usb.sh)** — runs on pfSense; copies `config.xml` to the USB drive at `/mnt/usb_backup/pfsense-backups/`. Deployed and scheduled via `make backup-usb-install`. Stored on the USB so it survives reinstalls.
- **[install-api.sh](scripts/install-api.sh)** — run on the pfSense box to install the REST API package for the correct pfSense version.
- **[migrate-ks-to-alias.js](scripts/migrate-ks-to-alias.js)** — one-shot migration: replaces per-IP kill-switch rules with a single alias-based rule pair. Run once after switching to `KS_ALIAS=` mode.
- **[INSTALL_API.md](docs/INSTALL_API.md)** — pfSense REST API package installation
- **[SETUP.md](docs/SETUP.md)** — Initial setup and API configuration
- **[ALIASES.md](docs/ALIASES.md)** — DNS alias management examples

## Troubleshooting

### Self-Signed Certificate Errors
If using self-signed certificates, add to your `.env`:
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
NODE_NO_WARNINGS=1
```

### API Connection Issues
- Verify pfSense API is enabled (System > API)
- Check firewall rules allow API access from your machine
- Confirm credentials are correct in `.env`
- Test connectivity: `make test-api`
- Test API endpoint: `curl -k https://your-pfsense-ip/api/v2/system/version`

### DNS Not Resolving
- Verify DNS Resolver is running in pfSense
- Check that your client is using pfSense as DNS server
- Confirm DNS entry was created: `make dns-list`
- Check pfSense logs: Status > System Logs > System

### WireGuard Not Connecting

```bash
# Check tunnel and peer status
make wg-status

# On pfSense shell: verify WireGuard session (latest-handshake should be recent)
wg show

# On pfSense shell: check pf state for a kill-switch host
pfctl -ss | grep 192.168.7.6

# On kill-switch host: verify exit IP is VPN, not WAN
curl ifconfig.io

# On pfSense shell: confirm gateway is online and routing table has tunnel gateway
netstat -rn | grep 10.5.0
```

**Kill-switch host can't reach internet (gateway offline):**
- Check `Status > Gateways` — gateway must show Online
- If offline: `wg show` on pfSense should show a recent handshake; if not, the tunnel is down
- Shellcmd `route add -host <MONITOR_IP> <tunnel_gateway_ip>` must be configured (`Services > Shellcmd`)

**Traffic routes through WAN instead of VPN:**
- `pfctl -ss | grep 192.168.7.6` — NAT address should be the tunnel IP, not your WAN IP
- Verify LAN routing rule exists and points to the gateway group (`Firewall > Rules > LAN`)
- Confirm the LAN kill-switch rule is above the VPNBalanced rule for the same source

**WireGuard tunnel drops every ~2 minutes (120s REKEY deadlock):**
- This is a known WireGuard behavior when both endpoints try to re-key simultaneously
- Deploy `scripts/nordvpn-wg-watchdog.sh` (NordVPN) to proactively reset the peer every 85s
- WAN firewall rule must allow UDP on the pfSense listen port (default 51821)
- `PersistentKeepalive = 25` in the peer config is required; verify with `wg show`

**Gateway shows 100% loss but `wg show` has a live handshake:**
- The monitor host route is missing — dpinger is sending probes via the WAN interface instead of the WG tunnel
- Check: `netstat -rn | grep 1.1.1.1` — should show `1.1.1.1 10.5.0.1 UGHS tun_wg1`
- Fix immediately: `route add -host 1.1.1.1 10.5.0.1` on pfSense
- Permanent fix: ensure the watchdog is deployed — `ensure_monitor_route()` restores it on every run
- On pfSense, add a Shellcmd (`Services > Shellcmd`, Type: shellcmd): `route add -host 1.1.1.1 10.5.0.1` so the route survives reboots before the first watchdog run

**Watchdog escalation never fires (gateway stuck down > 8 min):**
- Verify the cron job runs from `/usr/local/bin/nordvpn-wg-watchdog.sh` (not `/usr/local/sbin/`)
- Check: `cat /etc/cron.d/nordvpn-wg-watchdog`
- Check state files: `down-since` age must exceed 500s; `last-reset` must exist (drives backoff timer)
- Manually force: backdate the down-since file: `echo $(( $(date +%s) - 600 )) > /var/db/nordvpn-wg-down-since` then run the watchdog directly

### HAProxy Not Routing
- Verify backend exists: `make haproxy-list`
- Confirm frontend ACL was created (check pfSense UI: Services > HAProxy > Frontend)
- Check HAProxy is running: Services > HAProxy
- Review HAProxy logs in pfSense

### Service Not Accessible
1. Test DNS resolution: `nslookup myapp.example.com`
2. Verify DNS entry exists: `make dns-list | grep myapp`
3. Verify HAProxy backend: `make haproxy-list | grep myapp`
4. Check frontend routing in pfSense UI
5. Test backend connectivity from pfSense: `curl http://myapp.example.local:3000`
6. Verify service is running on port 3000 at 192.168.1.100

## Development

The code is mounted as a volume, so changes are reflected without rebuilding:

```bash
# Edit lib/dns.js or lib/haproxy.js
# Then immediately test:
docker-compose run --rm pfsense-cli list
```

Rebuild only when changing dependencies:
```bash
docker-compose build
```

## Technical Details

- **API Version**: pfSense REST API v2
- **Authentication**: KeyAuth with `x-api-key` header
- **Node.js**: 20-alpine
- **Dependencies**: axios, commander, dotenv
- **Endpoints Used**:
  - `/api/v2/services/dns_resolver/*` - DNS management
  - `/api/v2/services/haproxy/*` - HAProxy configuration
  - `/api/v2/vpn/wireguard/tunnel` — WireGuard tunnel CRUD
  - `/api/v2/vpn/wireguard/peer` — WireGuard peer CRUD
  - `/api/v2/interface` — interface assignment and config
  - `/api/v2/routing/gateway` — gateway CRUD
  - `/api/v2/firewall/nat/outbound/mapping` — outbound NAT CRUD
  - `/api/v2/firewall/rule` — firewall rule CRUD
  - `/api/v2/firewall/alias` — firewall alias CRUD
  - `/api/v2/firewall/apply`, `/api/v2/routing/apply`, etc. — apply changes
  - `/api/v2/system/certificate` — certificate CRUD (import, delete, renew)
  - `/api/v2/system/certificates` — list all certificates
  - `/api/v2/diagnostics/config_history/revisions` — list/delete config history
  - `/api/v2/diagnostics/command_prompt` — shell command execution (used by optics:show)

**API limitations** (not exposed by pfSense REST API v2 on pfSense 2.7.x):
- Gateway groups — configure in GUI: `System > Routing > Gateway Groups`
- Shellcmd / earlyshellcmd — configure in GUI: `Services > Shellcmd`
