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

## Features

✓ **DNS Management** - List, add, update, delete DNS Resolver entries  
✓ **DNS Aliases** - Add/delete aliases for host overrides  
✓ **HAProxy Backends** - Create and manage HAProxy backend servers  
✓ **HAProxy Frontend Routes** - Configure ACLs and actions for routing  
✓ **Complete Service Deployment** - One command to configure DNS + HAProxy  
✓ **Complete Service Teardown** - One command to remove DNS + HAProxy  
✓ **WireGuard VPN Provisioning** - Zero-touch ProtonVPN setup from a `.conf` file: tunnel, peer, interface, gateway, NAT, kill-switch firewall rules  
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
```

### WireGuard / ProtonVPN

`wg:provision` (alias: `wg:apply`) does a full zero-touch ProtonVPN setup from a standard WireGuard `.conf` file. It is fully idempotent — safe to re-run when switching servers or rotating keys.

#### What it configures automatically

| Step | Resource |
|------|----------|
| 1 | WireGuard tunnel (listen port, MTU, private key) |
| 2 | WireGuard peer (public key, endpoint, AllowedIPs, keepalive 25s) |
| 3 | Interface assignment with static tunnel IP |
| 4 | Gateway with external monitor IP (default `1.1.1.1`) |
| 5 | Outbound NAT: LAN subnet → VPN interface address |
| 6 | WAN inbound rule for the WireGuard listen port (skipped if already covered) |
| 7 | LAN routing rule per kill-switch host: `tag=vpntraffic`, gateway → VPN |
| 8 | Apply all changes |

The existing floating WAN block rule (`tagged=vpntraffic`) provides the kill switch — if the VPN gateway goes offline, tagged traffic cannot exit WAN.

#### Three steps that require the pfSense GUI (API limitation)

These are printed at the end of every `wg:provision` run:

1. **Gateway group** — `System > Routing > Gateway Groups > Add`  
   Name: `ProtonVPN_GWGrp`, Trigger: Packet Loss or High Latency, Member: `PROTONVPN_GW` Tier 1  
   Add future tunnel gateways here; the LAN routing rules already point to this group name.

2. **Update LAN routing rule gateway** from the single gateway to the group  
   `Firewall > Rules > LAN` → edit `pf-protonvpn-ks-*` rule → set gateway to `ProtonVPN_GWGrp`

3. **earlyshellcmd** — `Services > Shellcmd > Add`  
   Type: earlyshellcmd, Command: `route add -host 1.1.1.1 10.2.0.1`  
   Ensures dpinger can reach the monitor IP after reboot before WireGuard is fully up.

#### Provision first tunnel

```bash
# Download a WireGuard .conf from account.proton.me > Downloads > WireGuard
make wg-provision CONF=~/Downloads/PFSenseProtonVPN01-US-VA-78.conf KILL_SWITCH='192.168.7.6/32'

# Preview without making changes
make wg-dry-run CONF=~/Downloads/PFSenseProtonVPN01-US-VA-78.conf KILL_SWITCH='192.168.7.6/32'

# Multiple kill-switch hosts
make wg-provision CONF=~/Downloads/PFSenseProtonVPN01-US-VA-78.conf \
  KILL_SWITCH='192.168.7.6/32 192.168.7.7/32'
```

#### Provision a second tunnel (redundancy / failover)

Each additional tunnel needs a unique description, interface name, listen port, and monitor IP.
After provisioning, add the new gateway to `ProtonVPN_GWGrp` in the GUI (Tier 1 for active-active, Tier 2 for standby).

```bash
make wg-provision \
  CONF=~/Downloads/PFSenseProtonVPN02-US-NY.conf \
  KILL_SWITCH='192.168.7.6/32' \
  TUNNEL=ProtonVPN02 \
  IFACE=PROTONVPN2 \
  LISTEN_PORT=51822 \
  MONITOR_IP=9.9.9.9

# Then in GUI: System > Routing > Gateway Groups > ProtonVPN_GWGrp > add PROTONVPN2_GW Tier 1
# And: Services > Shellcmd > Add earlyshellcmd: route add -host 9.9.9.9 <new_gateway_ip>
```

#### Switch to a different ProtonVPN server

Re-run `wg-provision` with the new `.conf`. All resources are updated in place; nothing is deleted and re-created.

```bash
make wg-provision CONF=~/Downloads/PFSenseProtonVPN01-US-TX.conf KILL_SWITCH='192.168.7.6/32'
```

#### All available wg options

| Variable | Default | Description |
|----------|---------|-------------|
| `CONF` | *(required)* | Path to ProtonVPN WireGuard `.conf` file |
| `KILL_SWITCH` | `''` | Space-separated host CIDRs to route through VPN with kill-switch |
| `TUNNEL` | `ProtonVPN01` | Tunnel description in pfSense |
| `IFACE` | `PROTONVPN` | Interface description in pfSense |
| `GW` | *(derived: IFACE_GW)* | Gateway name |
| `GW_GROUP` | `ProtonVPN_GWGrp` | Gateway group name for multi-tunnel failover |
| `LISTEN_PORT` | `51821` | WireGuard listen port on pfSense |
| `MTU` | `1420` | WireGuard MTU |
| `MONITOR_IP` | `1.1.1.1` | Gateway monitor IP (must differ per tunnel) |
| `LAN_SUBNET` | `192.168.7.0/24` | LAN subnet for outbound NAT |
| `LAN` | `lan` | pfSense internal interface name for LAN |

#### Tear down

Removes all `pf-protonvpn-*` firewall rules, NAT mappings, gateway, and peers for the specified tunnel. Does not remove the WireGuard tunnel itself.

```bash
make wg-teardown                                    # defaults: ProtonVPN01 / PROTONVPN
make wg-teardown TUNNEL=ProtonVPN02 IFACE=PROTONVPN2
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

# HAProxy frontend routes
docker-compose run --rm pfsense-cli haproxy:route-add \
  --frontend HomePrivateServers \
  --acl myapp \
  --hostname myapp.example.com \
  --backend myapp
```

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
make add-service        # Complete service deployment (DNS + HAProxy); SSL=true for HTTPS backends
make delete-service     # Complete service teardown (reverse of add-service)
make wg-status          # Show WireGuard tunnel and peer status
make wg-provision       # Full ProtonVPN provisioning from a .conf file (alias: wg-apply)
make wg-dry-run         # Preview wg-provision without making changes
make wg-teardown        # Remove ProtonVPN rules, NAT, gateway, and peer
make clean              # Clean up Docker resources
```

## Documentation

- **[setup-alias.sh](scripts/setup-alias.sh)** - Shell helper script with usage examples
- **[INSTALL_API.md](docs/INSTALL_API.md)** - pfSense REST API package installation
- **[SETUP.md](docs/SETUP.md)** - Initial setup and API configuration
- **[ALIASES.md](docs/ALIASES.md)** - DNS alias management examples

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

### WireGuard / ProtonVPN Not Connecting

```bash
# Check tunnel and peer status
make wg-status

# On pfSense shell: verify WireGuard session
wg show

# On pfSense shell: check pf state for a kill-switch host
pfctl -ss | grep 192.168.7.6

# On kill-switch host: verify exit IP is ProtonVPN, not WAN
curl ifconfig.io

# On pfSense shell: confirm gateway is online
netstat -rn | grep 10.2.0
```

**Kill-switch host can't reach internet at all (gateway offline):**
- Check `Status > Gateways` — PROTONVPN_GW must show Online
- If offline, verify WireGuard tunnel: `wg show` on pfSense should show a recent handshake
- earlyshellcmd `route add -host 1.1.1.1 10.2.0.1` must be configured (`Services > Shellcmd`)

**Traffic routes through WAN instead of VPN:**
- `pfctl -ss | grep 192.168.7.6` — check NAT address; should be `10.2.0.2`, not your WAN IP
- Verify LAN routing rule exists and points to the gateway group (`Firewall > Rules > LAN`)
- Confirm the LAN rule is above the VPNBalanced rule for the same source

**WireGuard re-handshake fails after ~3 minutes (tunnel drops periodically):**
- WAN firewall rule must allow UDP on the pfSense listen port (default 51821), not just 51820
- Check `Firewall > Rules > WAN` for a rule covering port 51821 inbound
- PersistentKeepalive=25 in the peer config keeps the pf state alive; verify with `wg show`

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
  - `/api/v2/firewall/apply`, `/api/v2/routing/apply`, etc. — apply changes

**API limitations** (not exposed by pfSense REST API v2 on pfSense 2.7.x):
- Gateway groups — configure in GUI: `System > Routing > Gateway Groups`
- Shellcmd / earlyshellcmd — configure in GUI: `Services > Shellcmd`
