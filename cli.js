#!/usr/bin/env node

const { Command } = require('commander');
const { listEntries, addEntry, updateEntry, deleteEntry, addAlias, deleteAlias } = require('./lib/dns');
const { listBackends, addBackend, deleteBackend, addFrontendRoute, deleteFrontendRoute } = require('./lib/haproxy');
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
      await deleteAlias({
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

program.parse();
