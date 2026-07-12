#!/usr/bin/env node

const { Command } = require('commander');
const { listEntries, addEntry, updateEntry, deleteEntry, addAlias, deleteAlias: deleteDnsAlias } = require('./lib/dns');
const { listBackends, addBackend, deleteBackend, addFrontendRoute, deleteFrontendRoute } = require('./lib/haproxy');
const { listTunnels, applyProtonVPN, teardownProtonVPN } = require('./lib/wireguard');
const { listAliases, createOrUpdateAlias, addAliasHost, removeAliasHost, deleteAlias,
        listRules, addRule, deleteRule, updateRule } = require('./lib/firewall');
const { rotateNordVPNWG, printNordVPNCreds, listNordVPNServers, teardownNordVPNWG } = require('./lib/nordvpn');
const { bulkImport } = require('./lib/bulk');
const { listCerts, importCert, deleteCert, renewCert } = require('./lib/cert');
const { showOptics } = require('./lib/optics');
const { listConfigHistory, pruneConfigHistory } = require('./lib/config');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');

const program = new Command();

program
  .name('pfsense')
  .description('CLI tool to manage DNS and HAProxy configuration in pfSense')
  .version(packageJson.version);

// Logo command
program
  .command('logo')
  .description('Display the pfSense CLI logo')
  .action(() => {
    try {
      const logoPath = path.join(__dirname, '.logo');
      if (fs.existsSync(logoPath)) {
        const logo = fs.readFileSync(logoPath, 'utf8');
        console.log(logo);
        console.log(`Version: ${packageJson.version}`);
        console.log(`License: ${packageJson.license}`);
        console.log(`Repository: ${packageJson.repository?.url || 'N/A'}\n`);
      } else {
        console.log('Logo file not found');
      }
    } catch (e) {
      console.error('Error displaying logo:', e.message);
    }
  });

// List command
program
  .command('list')
  .description('List all DNS host override entries')
  .option('-f, --filter <hostname>', 'Filter by hostname')
  .action(async (options) => {
    try {
      await listEntries(options.filter);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add command
program
  .command('add')
  .description('Add a new DNS host override entry')
  .requiredOption('-h, --host <hostname>', 'Hostname')
  .requiredOption('-d, --domain <domain>', 'Domain')
  .requiredOption('-i, --ip <ip>', 'IP address')
  .option('-D, --description <description>', 'Description')
  .action(async (options) => {
    try {
      await addEntry({
        host: options.host,
        domain: options.domain,
        ip: options.ip,
        description: options.description || ''
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Update command
program
  .command('update')
  .description('Update an existing DNS host override entry')
  .requiredOption('-h, --host <hostname>', 'Hostname to update')
  .requiredOption('-d, --domain <domain>', 'Domain to update')
  .option('-i, --ip <ip>', 'New IP address')
  .option('-D, --description <description>', 'New description')
  .action(async (options) => {
    try {
      await updateEntry({
        host: options.host,
        domain: options.domain,
        ip: options.ip,
        description: options.description
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete command
program
  .command('delete')
  .description('Delete a DNS host override entry')
  .requiredOption('-h, --host <hostname>', 'Hostname')
  .requiredOption('-d, --domain <domain>', 'Domain')
  .action(async (options) => {
    try {
      await deleteEntry(options.host, options.domain);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add alias command
program
  .command('alias:add')
  .description('Add an alias to an existing DNS host override entry')
  .requiredOption('-h, --host <hostname>', 'Parent hostname')
  .requiredOption('-d, --domain <domain>', 'Parent domain')
  .requiredOption('-a, --alias-host <alias>', 'Alias hostname')
  .requiredOption('-A, --alias-domain <alias-domain>', 'Alias domain')
  .option('-D, --description <description>', 'Alias description')
  .action(async (options) => {
    try {
      await addAlias({
        host: options.host,
        domain: options.domain,
        aliasHost: options.aliasHost,
        aliasDomain: options.aliasDomain,
        description: options.description || ''
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete alias command
program
  .command('alias:delete')
  .description('Delete an alias from a DNS host override entry')
  .requiredOption('-h, --host <hostname>', 'Parent hostname')
  .requiredOption('-d, --domain <domain>', 'Parent domain')
  .requiredOption('-a, --alias-host <alias>', 'Alias hostname to delete')
  .requiredOption('-A, --alias-domain <alias-domain>', 'Alias domain to delete')
  .action(async (options) => {
    try {
      await deleteDnsAlias({
        host: options.host,
        domain: options.domain,
        aliasHost: options.aliasHost,
        aliasDomain: options.aliasDomain
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// HAProxy commands

// List backends command
program
  .command('haproxy:list')
  .description('List all HAProxy backends')
  .option('-f, --filter <name>', 'Filter by backend name')
  .action(async (options) => {
    try {
      await listBackends({ filter: options.filter });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add backend command
program
  .command('haproxy:add')
  .description('Add a HAProxy backend with a server')
  .requiredOption('-n, --name <name>', 'Backend name')
  .requiredOption('-s, --server-name <name>', 'Server name')
  .requiredOption('-a, --server-address <address>', 'Server address (hostname or IP)')
  .requiredOption('-p, --server-port <port>', 'Server port')
  .option('-b, --balance <type>', 'Load balance algorithm', 'roundrobin')
  .option('-c, --check-type <type>', 'Health check type', 'Basic')
  .option('--ssl', 'Enable SSL for backend server', false)
  .action(async (options) => {
    try {
      await addBackend({
        name: options.name,
        serverName: options.serverName,
        serverAddress: options.serverAddress,
        serverPort: parseInt(options.serverPort),
        balance: options.balance,
        checkType: options.checkType,
        ssl: options.ssl
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete backend command
program
  .command('haproxy:delete')
  .description('Delete a HAProxy backend')
  .requiredOption('-n, --name <name>', 'Backend name')
  .action(async (options) => {
    try {
      await deleteBackend(options.name);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add frontend route command
program
  .command('haproxy:route-add')
  .description('Add a frontend ACL and action to route to a backend')
  .requiredOption('-f, --frontend <name>', 'Frontend name')
  .requiredOption('-a, --acl <name>', 'ACL name')
  .requiredOption('-H, --hostname <hostname>', 'Hostname to match')
  .requiredOption('-b, --backend <name>', 'Backend name to route to')
  .action(async (options) => {
    try {
      await addFrontendRoute({
        frontendName: options.frontend,
        aclName: options.acl,
        hostname: options.hostname,
        backendName: options.backend
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete frontend route command
program
  .command('haproxy:route-delete')
  .description('Delete a frontend ACL and action')
  .requiredOption('-f, --frontend <name>', 'Frontend name')
  .requiredOption('-a, --acl <name>', 'ACL name')
  .action(async (options) => {
    try {
      await deleteFrontendRoute({
        frontendName: options.frontend,
        aclName: options.acl
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// WireGuard / ProtonVPN commands
// ---------------------------------------------------------------------------

program
  .command('wg:status')
  .description('List WireGuard tunnels and peers')
  .action(async () => {
    try {
      await listTunnels();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('wg:provision <conf-file>')
  .alias('wg:apply')
  .description('Full zero-touch ProtonVPN WireGuard setup from a .conf file (tunnel, peer, interface, gateway, NAT, firewall)')
  .option('-t, --tunnel <descr>',       'Tunnel description',                         'ProtonVPN01')
  .option('-n, --iface-name <name>',    'pfSense interface description',              'PROTONVPN')
  .option('-g, --gateway-name <name>',  'Gateway name (default: <IFACE>_GW)')
  .option('--gw-group <name>',          'Gateway group name for multi-tunnel failover', 'ProtonVPN_GWGrp')
  .option('-p, --listen-port <port>',   'WireGuard listen port on pfSense',           '51821')
  .option('-m, --mtu <bytes>',          'WireGuard MTU',                              '1420')
  .option('--monitor-ip <ip>',          'Gateway monitor IP',                         '1.1.1.1')
  .option('-s, --lan-subnet <cidr>',    'LAN subnet for outbound NAT',                '192.168.7.0/24')
  .option('-k, --kill-switch <host>',   'Host IP/CIDR to route through VPN with kill-switch (repeatable)', (v, a) => { a.push(v); return a; }, [])
  .option('--ks-alias <name>',          'pfSense firewall alias to use as kill-switch source (creates alias if missing)')
  .option('-l, --lan <iface>',          'LAN interface internal name (e.g. lan, opt1)', 'lan')
  .option('--dry-run',                  'Print planned changes without applying')
  .action(async (confFile, options) => {
    try {
      if (!fs.existsSync(confFile)) {
        console.error(`Error: Config file not found: ${confFile}`);
        process.exit(1);
      }
      await applyProtonVPN({
        confFile,
        tunnelDescr:     options.tunnel,
        ifaceName:       options.ifaceName,
        gatewayName:     options.gatewayName,
        gwGroupName:     options.gwGroup,
        listenPort:      parseInt(options.listenPort, 10),
        mtu:             parseInt(options.mtu, 10),
        monitorIP:       options.monitorIp,
        lanSubnet:       options.lanSubnet,
        killSwitchHosts: options.killSwitch,
        killSwitchAlias: options.ksAlias || null,
        lanIface:        options.lan,
        dryRun:          !!options.dryRun,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('wg:teardown')
  .description('Remove ProtonVPN WireGuard kill-switch rules, gateway, and peer')
  .option('-t, --tunnel <descr>',     'Tunnel description to target', 'ProtonVPN01')
  .option('-n, --iface-name <name>',  'pfSense interface description', 'PROTONVPN')
  .option('-g, --gateway-name <name>','Gateway name (default: <IFACE>_GW)')
  .option('--ks-alias <name>',        'Also delete the named kill-switch alias')
  .action(async (options) => {
    try {
      await teardownProtonVPN({
        tunnelDescr:     options.tunnel,
        ifaceName:       options.ifaceName,
        gatewayName:     options.gatewayName,
        killSwitchAlias: options.ksAlias || null,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// NordVPN commands
// ---------------------------------------------------------------------------

program
  .command('nordvpn:rotate-wg')
  .description('Rotate NordVPN WireGuard peer to the lowest-load server from the API')
  .option('--token <token>',       'NordVPN access token (default: NORDVPN_TOKEN env var)')
  .option('--country-id <id>',     'NordVPN country ID (228 = US)',                 '228')
  .option('-t, --tunnel <descr>',  'WireGuard tunnel description in pfSense',       'ProtonVPN01')
  .option('-m, --monitor-ip <ip>', 'Gateway monitor IP (informational only)',       '1.1.1.1')
  .option('--dry-run',             'Print planned change without applying')
  .action(async (options) => {
    try {
      await rotateNordVPNWG({
        accessToken: options.token || process.env.NORDVPN_TOKEN,
        countryId:   parseInt(options.countryId, 10),
        tunnelDescr: options.tunnel,
        monitorIP:   options.monitorIp,
        dryRun:      !!options.dryRun,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('nordvpn:creds')
  .description('Fetch NordVPN WireGuard credentials (nordlynx_private_key) from the API')
  .option('--token <token>', 'NordVPN access token (default: NORDVPN_TOKEN env var)')
  .action(async (options) => {
    try {
      await printNordVPNCreds(options.token || process.env.NORDVPN_TOKEN);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('nordvpn:teardown-wg')
  .description('Remove NordVPN WireGuard kill-switch rules, gateway, NAT, interface, and peer')
  .option('-t, --tunnel <descr>',    'WireGuard tunnel description',    'NordVPNWG01')
  .option('-n, --iface-name <name>', 'pfSense interface description',   'NORDVPNWG')
  .option('-g, --gateway-name <name>','Gateway name (default: <IFACE>_GW)')
  .option('--delete-tunnel',         'Also delete the WireGuard tunnel (not just the peer)')
  .action(async (options) => {
    try {
      await teardownNordVPNWG({
        tunnelDescr:  options.tunnel,
        ifaceName:    options.ifaceName,
        gatewayName:  options.gatewayName,
        deleteTunnel: !!options.deleteTunnel,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('nordvpn:servers')
  .description('List recommended NordVPN WireGuard servers for a country')
  .option('--country-id <id>', 'NordVPN country ID (228 = US)', '228')
  .option('-n, --limit <n>',   'Number of servers to show',     '10')
  .action(async (options) => {
    try {
      await listNordVPNServers({
        countryId: parseInt(options.countryId, 10),
        limit:     parseInt(options.limit, 10),
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Firewall rule commands
// ---------------------------------------------------------------------------

program
  .command('fw-rule:list')
  .description('List pfSense firewall rules')
  .option('-f, --filter <text>',     'Filter by description (case-insensitive substring)')
  .option('-i, --interface <iface>', 'Filter by interface (e.g. lan, wan, opt1)')
  .option('-t, --type <type>',       'Filter by type: pass | block | reject')
  .action(async (options) => {
    try {
      await listRules({ filter: options.filter, iface: options.interface, type: options.type });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-rule:add')
  .description('Add a pfSense firewall rule')
  .requiredOption('-t, --type <type>',           'Rule type: pass | block | reject')
  .requiredOption('-i, --interface <iface>',      'Interface (e.g. lan, wan)')
  .option('-s, --source <src>',                  'Source IP, CIDR, alias, or "any"', 'any')
  .option('--source-port <port>',                'Source port or range')
  .option('-d, --destination <dst>',             'Destination IP, CIDR, alias, or "any"', 'any')
  .option('--dest-port <port>',                  'Destination port or range')
  .option('-p, --protocol <proto>',              'Protocol: tcp | udp | tcp/udp | icmp | any')
  .option('--ip-version <ver>',                  'IP version: inet | inet6 | inet46', 'inet')
  .option('-g, --gateway <name>',                'Gateway or gateway group name (for policy routing)')
  .option('--tag <tag>',                         'Packet tag to set')
  .option('-D, --description <text>',            'Rule description')
  .option('--log',                               'Enable rule logging')
  .option('--disabled',                          'Create rule in disabled state')
  .option('--floating',                          'Create as a floating rule')
  .action(async (options) => {
    try {
      await addRule({
        type:        options.type,
        iface:       options.interface,
        source:      options.source,
        sourcePort:  options.sourcePort,
        destination: options.destination,
        destPort:    options.destPort,
        protocol:    options.protocol,
        ipprotocol:  options.ipVersion,
        gateway:     options.gateway,
        tag:         options.tag,
        description: options.description || '',
        log:         !!options.log,
        disabled:    !!options.disabled,
        floating:    !!options.floating,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-rule:delete')
  .description('Delete a pfSense firewall rule by id or description')
  .option('-i, --id <id>',             'Rule id (from fw-rule:list)')
  .option('-D, --description <text>',  'Exact rule description (used if --id not given)')
  .action(async (options) => {
    try {
      await deleteRule({ id: options.id, description: options.description });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-rule:update')
  .description('Update fields on an existing pfSense firewall rule')
  .option('-i, --id <id>',             'Rule id (from fw-rule:list)')
  .option('-D, --description <text>',  'Exact rule description to look up (if --id not given)')
  .option('-t, --type <type>',         'New type: pass | block | reject')
  .option('--interface <iface>',       'New interface')
  .option('-s, --source <src>',        'New source')
  .option('-d, --destination <dst>',   'New destination')
  .option('-p, --protocol <proto>',    'New protocol')
  .option('-g, --gateway <name>',      'New gateway')
  .option('--enable',                  'Enable the rule (sets disabled=false)')
  .option('--disable',                 'Disable the rule (sets disabled=true)')
  .option('--descr <text>',            'New description')
  .action(async (options) => {
    try {
      const disabled = options.disable ? true : options.enable ? false : undefined;
      await updateRule({
        id:          options.id,
        description: options.description,
        type:        options.type,
        iface:       options.interface,
        source:      options.source,
        destination: options.destination,
        protocol:    options.protocol,
        gateway:     options.gateway,
        disabled,
        descr:       options.descr,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Firewall alias commands
// ---------------------------------------------------------------------------

program
  .command('fw-alias:list')
  .description('List pfSense firewall aliases')
  .option('-f, --filter <text>', 'Filter by name or description')
  .action(async (options) => {
    try {
      await listAliases({ filter: options.filter });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-alias:create')
  .description('Create or update a pfSense firewall alias')
  .requiredOption('-n, --name <name>',       'Alias name (alphanumeric + underscore)')
  .option('-t, --type <type>',               'Alias type: host | network | port', 'host')
  .option('-D, --description <description>', 'Alias description')
  .option('-H, --host <ip>',                 'Host/IP to include (repeatable)', (v, a) => { a.push(v); return a; }, [])
  .action(async (options) => {
    try {
      await createOrUpdateAlias({
        name:        options.name,
        type:        options.type,
        description: options.description || '',
        hosts:       options.host,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-alias:add-host')
  .description('Add a host/IP to an existing pfSense firewall alias')
  .requiredOption('-n, --name <name>',   'Alias name')
  .requiredOption('-H, --host <ip>',     'Host or IP to add')
  .option('-d, --detail <comment>',      'Comment for this entry')
  .action(async (options) => {
    try {
      await addAliasHost({ name: options.name, host: options.host, detail: options.detail || '' });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-alias:remove-host')
  .description('Remove a host/IP from a pfSense firewall alias')
  .requiredOption('-n, --name <name>',   'Alias name')
  .requiredOption('-H, --host <ip>',     'Host or IP to remove')
  .action(async (options) => {
    try {
      await removeAliasHost({ name: options.name, host: options.host });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('fw-alias:delete')
  .description('Delete a pfSense firewall alias')
  .requiredOption('-n, --name <name>', 'Alias name')
  .action(async (options) => {
    try {
      await deleteAlias({ name: options.name });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Optics command
// ---------------------------------------------------------------------------

program
  .command('optics:show')
  .description('Show SFP+ transceiver diagnostics (DDM) for one or all SFP+ interfaces')
  .option('-i, --interface <iface>', 'Interface name (e.g. igb0, ix0, ixl0); auto-detects SFP+ if omitted')
  .action(async (options) => {
    try {
      await showOptics({ iface: options.interface });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Certificate commands
// ---------------------------------------------------------------------------

program
  .command('cert:list')
  .description('List pfSense certificates with expiry information')
  .option('-f, --filter <text>',     'Filter by certificate name')
  .option('-e, --expiring <days>',   'Show only certificates expiring within N days')
  .action(async (options) => {
    try {
      await listCerts({
        filter:      options.filter,
        expiringDays: options.expiring != null ? parseInt(options.expiring, 10) : undefined,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('cert:import')
  .description('Import a certificate and private key into pfSense')
  .requiredOption('-n, --name <name>', 'Certificate name (description in pfSense)')
  .requiredOption('-c, --cert <file>', 'Path to PEM certificate file')
  .requiredOption('-k, --key <file>',  'Path to PEM private key file')
  .option('-t, --type <type>',         'Certificate type: server | user', 'server')
  .action(async (options) => {
    try {
      await importCert({
        name:     options.name,
        certFile: options.cert,
        keyFile:  options.key,
        type:     options.type,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('cert:delete')
  .description('Delete a certificate from pfSense')
  .option('-n, --name <name>',   'Certificate name (exact match)')
  .option('-r, --refid <refid>', 'Certificate refid (from cert:list)')
  .action(async (options) => {
    try {
      await deleteCert({ name: options.name, refid: options.refid });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('cert:renew')
  .description('Renew a certificate in pfSense (internally-generated certs only)')
  .option('-n, --name <name>',   'Certificate name (exact match)')
  .option('-r, --refid <refid>', 'Certificate refid (from cert:list)')
  .action(async (options) => {
    try {
      await renewCert({ name: options.name, refid: options.refid });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Config history commands
// ---------------------------------------------------------------------------

program
  .command('config:history')
  .description('List pfSense configuration history revisions')
  .option('-n, --limit <n>', 'Show only the N most recent revisions')
  .action(async (options) => {
    try {
      await listConfigHistory({ limit: options.limit ? parseInt(options.limit, 10) : undefined });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('config:history-prune')
  .description('Delete old pfSense config history revisions')
  .option('--older-than <days>', 'Delete revisions older than N days')
  .option('--keep-last <n>',     'Keep only the N most recent revisions, delete the rest')
  .action(async (options) => {
    try {
      await pruneConfigHistory({
        olderThanDays: options.olderThan  ? parseInt(options.olderThan, 10)  : undefined,
        keepLast:      options.keepLast   ? parseInt(options.keepLast, 10)   : undefined,
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Bulk import command
// ---------------------------------------------------------------------------

program
  .command('bulk:import <file>')
  .description('Bulk import services, DNS entries, or HAProxy backends from a JSON or CSV file')
  .option('--dry-run', 'Preview what would be created without applying any changes')
  .action(async (file, options) => {
    try {
      await bulkImport({ file, dryRun: !!options.dryRun });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
