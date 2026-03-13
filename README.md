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

A Docker-based CLI tool to manage DNS entries and HAProxy configuration in pfSense.

## Features

✓ **DNS Management** - List, add, update, delete DNS Resolver entries  
✓ **DNS Aliases** - Add/delete aliases for host overrides  
✓ **HAProxy Backends** - Create and manage HAProxy backend servers  
✓ **HAProxy Frontend Routes** - Configure ACLs and actions for routing  
✓ **Complete Service Deployment** - One command to configure DNS + HAProxy  
✓ Automatic configuration application  
✓ Self-signed certificate support  
✓ Dockerized - no local Node.js installation required  

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
   
   📖 **See [INSTALL_API.md](INSTALL_API.md) for detailed installation instructions**

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
   source setup-alias.sh
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

The easiest way to deploy a new service with DNS and HAProxy configured:

```bash
make add-service ALIAS=myapp PORT=3000 DESC="My Application"
```

This single command:
1. ✅ Creates DNS alias `myapp.example.local` → `docker-host.example.local` (backend resolution)
2. ✅ Creates DNS alias `myapp.example.com` → `frontend.example.com` (frontend access)
3. ✅ Creates HAProxy backend `myapp` → `myapp.example.local:3000`
4. ✅ Adds frontend ACL/Action: `myapp.example.com` → routes to `myapp` backend

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
make add-service ALIAS=myapp PORT=3000 DESC="My Application"
```

Creates:
1. **DNS**: `myapp.example.local` → `192.168.1.100` (backend resolution)
2. **DNS**: `myapp.example.com` → `192.168.1.1` (frontend access)
3. **HAProxy Backend**: `myapp` → connects to `myapp.example.local:3000`
4. **HAProxy Frontend**: Routes `myapp.example.com` → `myapp` backend

User accesses `https://myapp.example.com` → routed through HAProxy → reaches service at `192.168.1.100:3000`

## Helper Alias

### Quick Setup

Source the provided setup script:

```bash
source /path/to/pfsense-cli/setup-alias.sh
```

Or add it permanently to your `~/.bashrc` or `~/.zshrc`:

```bash
# pfSense CLI
source /path/to/pfsense-cli/setup-alias.sh
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
make add-service        # Complete service deployment (DNS + HAProxy)
make clean              # Clean up Docker resources
```

## Documentation

- **[setup-alias.sh](setup-alias.sh)** - Shell helper script with usage examples
- **[INSTALL_API.md](INSTALL_API.md)** - pfSense REST API package installation
- **[SETUP.md](SETUP.md)** - Initial setup and API configuration
- **[ALIASES.md](ALIASES.md)** - DNS alias management examples

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
