const { getPfSenseClient } = require('./pfsense');
const dns = require('dns').promises;

const c = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  green:     '\x1b[32m',
  cyan:      '\x1b[36m',
  blue:      '\x1b[34m',
  yellow:    '\x1b[33m',
  gray:      '\x1b[90m',
};

/**
 * List HAProxy backends
 */
async function listBackends({ filter } = {}) {
  const client = getPfSenseClient();
  
  try {
    const response = await client.get('/api/v2/services/haproxy/backends');
    
    if (response.data.code !== 200) {
      throw new Error(response.data.message || 'Failed to list backends');
    }
    
    let backends = response.data.data || [];
    
    // Apply filter if provided
    if (filter) {
      backends = backends.filter(backend => 
        backend.name.toLowerCase().includes(filter.toLowerCase())
      );
    }
    
    console.log(`\n${c.bold}HAProxy Backend Entries:${c.reset}`);
    console.log(c.gray + '═'.repeat(80) + c.reset);
    console.log('');

    backends.forEach((backend, index) => {
      console.log(`${c.gray}${index + 1}.${c.reset} ${c.bold}${c.cyan}${backend.name}${c.reset}`);
      console.log(`   ${c.gray}Balance:${c.reset}    ${backend.balance || 'none'}`);
      console.log(`   ${c.gray}Check Type:${c.reset} ${backend.check_type || 'none'}`);

      if (backend.servers && backend.servers.length > 0) {
        console.log(`   ${c.gray}Servers:${c.reset}`);
        backend.servers.forEach(server => {
          const ssl = server.ssl ? ` ${c.yellow}[SSL]${c.reset}` : '';
          console.log(`     ${c.gray}-${c.reset} ${c.cyan}${server.name}${c.reset} ${c.gray}(${server.address}:${server.port})${c.reset}${ssl} ${c.gray}[${server.status}]${c.reset}`);
        });
      } else {
        console.log(`   ${c.gray}Servers: none${c.reset}`);
      }
      console.log('');
    });

    console.log(c.gray + '═'.repeat(80) + c.reset);
    console.log(`${c.gray}Total: ${backends.length} backends${c.reset}\n`);
    
  } catch (error) {
    throw new Error(`Failed to list backends: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Add a HAProxy backend with a single server
 */
async function addBackend({ name, serverName, serverAddress, serverPort, checkType = 'Basic', balance = 'roundrobin', ssl = false }) {
  const client = getPfSenseClient();
  
  try {
    // Check if backend already exists
    const listResponse = await client.get('/api/v2/services/haproxy/backends');
    const backends = listResponse.data.data || [];
    const existingBackend = backends.find(b => b.name === name);
    
    if (existingBackend) {
      console.log(`  ${c.blue}ℹ${c.reset} Backend already exists: ${c.cyan}${name}${c.reset}`);
      
      // Check if server already exists in the backend (name is globally unique in pfSense HAProxy)
      const existingServer = existingBackend.servers?.find(s => s.name === serverName);
      
      if (existingServer) {
        console.log(`  ${c.blue}ℹ${c.reset} Server already exists in backend: ${c.cyan}${serverName}${c.reset} ${c.gray}(${serverAddress}:${serverPort})${c.reset}`);
        return;
      }
      
      // Server doesn't exist, add it to existing backend
      const serverPayload = {
        parent_id: existingBackend.id,
        name: serverName,
        address: serverAddress,
        port: serverPort.toString(),
        status: 'active',
        ssl: ssl,
        sslserververify: false,
        weight: 1
      };
      
      const serverResponse = await client.post('/api/v2/services/haproxy/backend/server', serverPayload);
      
      if (serverResponse.data.code !== 200) {
        throw new Error(serverResponse.data.message || 'Failed to add server to backend');
      }
      
      console.log(`  ${c.green}✓${c.reset} Added server to existing backend: ${c.cyan}${serverName}${c.reset} ${c.gray}(${serverAddress}:${serverPort})${c.reset}`);
      await applyChanges(client);
      return;
    }
    
    // Create the backend (it doesn't exist)
    const backendPayload = {
      name,
      balance,
      check_type: checkType,
      servers: []
    };
    
    const backendResponse = await client.post('/api/v2/services/haproxy/backend', backendPayload);
    
    if (backendResponse.data.code !== 200) {
      throw new Error(backendResponse.data.message || 'Failed to create backend');
    }
    
    // Get the backend ID from the response
    const backendId = backendResponse.data.data.id;
    
    // Now add the server to the backend
    const serverPayload = {
      parent_id: backendId,
      name: serverName,
      address: serverAddress,
      port: serverPort.toString(),
      status: 'active',
      ssl: ssl,
      sslserververify: false,
      weight: 1
    };
    
    const serverResponse = await client.post('/api/v2/services/haproxy/backend/server', serverPayload);
    
    if (serverResponse.data.code !== 200) {
      throw new Error(serverResponse.data.message || 'Failed to add server to backend');
    }
    
    console.log(`  ${c.green}✓${c.reset} Successfully created HAProxy backend: ${c.cyan}${name}${c.reset}`);
    console.log(`  ${c.green}✓${c.reset} Added server: ${c.cyan}${serverName}${c.reset} ${c.gray}(${serverAddress}:${serverPort})${c.reset}`);
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to add backend: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete a HAProxy backend
 */
async function deleteBackend(name) {
  const client = getPfSenseClient();
  
  try {
    // First, get the backend ID
    const listResponse = await client.get('/api/v2/services/haproxy/backends');
    const backends = listResponse.data.data || [];
    
    const backendIndex = backends.findIndex(b => b.name === name);
    
    if (backendIndex === -1) {
      throw new Error(`Backend not found: ${name}`);
    }
    
    const response = await client.delete('/api/v2/services/haproxy/backend', {
      data: { id: backendIndex }
    });
    
    if (response.data.code === 200) {
      console.log(`  ${c.green}✓${c.reset} Successfully deleted HAProxy backend: ${c.cyan}${name}${c.reset}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to delete backend');
    }
    
  } catch (error) {
    throw new Error(`Failed to delete backend: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Add frontend ACL and action to route to a backend
 */
async function addFrontendRoute({ frontendName, aclName, hostname, backendName }) {
  const client = getPfSenseClient();
  
  try {
    // Get frontend ID
    const frontendsResponse = await client.get('/api/v2/services/haproxy/frontends');
    const frontends = frontendsResponse.data.data || [];
    
    const frontend = frontends.find(f => f.name === frontendName);
    if (!frontend) {
      throw new Error(`Frontend not found: ${frontendName}`);
    }
    
    const frontendId = frontend.id;
    
    // Check if ACL already exists
    const existingAcl = frontend.ha_acls?.find(a => a.name === aclName);
    
    if (!existingAcl) {
      // Add ACL
      const aclPayload = {
        parent_id: frontendId,
        name: aclName,
        expression: 'host_matches',
        value: hostname,
        casesensitive: false,
        not: false
      };
      
      const aclResponse = await client.post('/api/v2/services/haproxy/frontend/acl', aclPayload);
      
      if (aclResponse.data.code !== 200) {
        throw new Error(aclResponse.data.message || 'Failed to add ACL');
      }
      console.log(`  ${c.green}✓${c.reset} Created ACL: ${c.cyan}${aclName}${c.reset}`);
    } else {
      console.log(`  ${c.blue}ℹ${c.reset} ACL already exists: ${c.cyan}${aclName}${c.reset}`);
    }
    
    // Check if action already exists
    const existingAction = frontend.a_actionitems?.find(a => a.acl === aclName && a.backend === backendName);
    
    if (!existingAction) {
      // Add action
      const actionPayload = {
        parent_id: frontendId,
        action: 'use_backend',
        acl: aclName,
        backend: backendName
      };
      
      const actionResponse = await client.post('/api/v2/services/haproxy/frontend/action', actionPayload);
      
      if (actionResponse.data.code !== 200) {
        throw new Error(actionResponse.data.message || 'Failed to add action');
      }
      console.log(`  ${c.green}✓${c.reset} Created action: ${c.cyan}${hostname}${c.reset} ${c.gray}→${c.reset} ${c.cyan}${backendName}${c.reset}`);
    } else {
      console.log(`  ${c.blue}ℹ${c.reset} Action already exists: ${c.cyan}${hostname}${c.reset} ${c.gray}→ ${backendName}${c.reset}`);
    }
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to add frontend route: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete frontend ACL and action
 */
async function deleteFrontendRoute({ frontendName, aclName }) {
  const client = getPfSenseClient();
  
  try {
    // Get frontend details
    const frontendsResponse = await client.get('/api/v2/services/haproxy/frontends');
    const frontends = frontendsResponse.data.data || [];
    
    const frontend = frontends.find(f => f.name === frontendName);
    if (!frontend) {
      throw new Error(`Frontend not found: ${frontendName}`);
    }
    
    const frontendId = frontend.id;
    
    // Find ACL ID
    const acl = frontend.ha_acls?.find(a => a.name === aclName);
    if (!acl) {
      throw new Error(`ACL not found: ${aclName}`);
    }
    
    // Find action ID
    const action = frontend.a_actionitems?.find(a => a.acl === aclName);
    
    // Delete action first (if exists)
    if (action) {
      await client.delete('/api/v2/services/haproxy/frontend/action', {
        data: { parent_id: frontendId, id: action.id }
      });
    }
    
    // Delete ACL
    await client.delete('/api/v2/services/haproxy/frontend/acl', {
      data: { parent_id: frontendId, id: acl.id }
    });
    
    console.log(`  ${c.green}✓${c.reset} Deleted frontend route for ACL: ${c.cyan}${aclName}${c.reset}`);
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to delete frontend route: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Apply HAProxy configuration changes
 */
async function applyChanges(client) {
  try {
    await client.post('/api/v2/services/haproxy/apply');
    console.log(`  ${c.gray}✓ HAProxy applied${c.reset}`);
  } catch (error) {
    console.warn(`${c.yellow}Warning: Changes saved but failed to apply automatically. You may need to apply manually.${c.reset}`);
  }
}

/**
 * Resolve an IP to a .bub.lan hostname via reverse DNS, then verify forward.
 * Returns the hostname string on success, null if no verified mapping found.
 */
async function resolveHostnameForIp(ip) {
  // Try reverse DNS first
  try {
    const hosts = await dns.reverse(ip);
    for (const host of hosts) {
      if (host.endsWith('.bub.lan')) {
        const addrs = await dns.lookup(host, 4).then(r => r.address).catch(() => null);
        if (addrs === ip) return host;
      }
    }
  } catch {}
  return null;
}

/**
 * Convert IP-based backend server addresses to DNS hostnames.
 * Dry-run by default; pass apply=true to commit changes.
 */
async function fixBackendDnsAddresses({ apply = false, name = null } = {}) {
  const client = getPfSenseClient();

  const response = await client.get('/api/v2/services/haproxy/backends');
  let backends = response.data.data || [];

  if (name) {
    backends = backends.filter(b => b.name === name);
    if (backends.length === 0) {
      console.error(`No backend named "${name}" found.`);
      process.exit(1);
    }
  }

  const IP_RE = /^\d+\.\d+\.\d+\.\d+$/;
  const toUpdate = [];
  const skipped  = [];

  for (const backend of backends) {
    for (const server of (backend.servers || [])) {
      if (!IP_RE.test(server.address)) continue;

      const hostname = await resolveHostnameForIp(server.address);
      if (hostname) {
        toUpdate.push({ backend, server, hostname });
      } else {
        skipped.push({ backend, server });
      }
    }
  }

  // Report
  console.log(`\n${c.bold}HAProxy DNS conversion${apply ? '' : ' (dry-run)'}${c.reset}`);
  console.log(c.gray + '─'.repeat(72) + c.reset);

  if (toUpdate.length === 0 && skipped.length === 0) {
    console.log(`${c.green}Nothing to do -- all ${backends.length} backend server addresses are already hostnames.${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Will convert (${toUpdate.length}):${c.reset}`);
  for (const { backend, server, hostname } of toUpdate) {
    console.log(`  ${c.cyan}${backend.name}${c.reset}  ${c.gray}${server.address}:${server.port}${c.reset}  →  ${c.green}${hostname}:${server.port}${c.reset}`);
  }

  if (skipped.length > 0) {
    console.log(`\n${c.bold}No hostname found (${skipped.length}):${c.reset}`);
    for (const { backend, server } of skipped) {
      console.log(`  ${c.yellow}${backend.name}${c.reset}  ${c.gray}${server.address}:${server.port}${c.reset}`);
    }
  }

  if (!apply) {
    console.log(`\n${c.gray}Run with --apply to commit changes.${c.reset}\n`);
    return;
  }

  // Apply changes
  console.log(`\n${c.bold}Applying...${c.reset}`);
  let ok = 0, fail = 0;
  for (const { backend, server, hostname } of toUpdate) {
    try {
      await client.patch('/api/v2/services/haproxy/backend/server', {
        parent_id: backend.id,
        id: server.id,
        address: hostname
      });
      console.log(`  ${c.green}✓${c.reset} ${backend.name}  ${c.gray}${server.address}${c.reset} → ${hostname}`);
      ok++;
    } catch (err) {
      console.log(`  ${c.yellow}✗${c.reset} ${backend.name}  ${err.response?.data?.message || err.message}`);
      fail++;
    }
  }

  await applyChanges(client);
  console.log(`\n${c.gray}Done: ${ok} updated, ${fail} failed, ${skipped.length} skipped (no DNS).${c.reset}\n`);
}

/**
 * Convert hostname-based backend server addresses to static IPs.
 * Dry-run by default; pass apply=true to commit changes.
 * This eliminates HAProxy server-template _1 DOWN slots caused by single-IP hostname resolution.
 */
async function fixBackendIpAddresses({ apply = false, name = null } = {}) {
  const client = getPfSenseClient();

  const response = await client.get('/api/v2/services/haproxy/backends');
  let backends = response.data.data || [];

  if (name) {
    backends = backends.filter(b => b.name === name);
    if (backends.length === 0) {
      console.error(`No backend named "${name}" found.`);
      process.exit(1);
    }
  }

  const IP_RE = /^\d+\.\d+\.\d+\.\d+$/;
  const toUpdate = [];
  const skipped  = [];

  for (const backend of backends) {
    for (const server of (backend.servers || [])) {
      if (IP_RE.test(server.address)) continue; // already an IP

      let ip = null;
      try {
        const result = await dns.lookup(server.address, 4);
        ip = result.address;
      } catch {}

      if (ip) {
        toUpdate.push({ backend, server, ip });
      } else {
        skipped.push({ backend, server });
      }
    }
  }

  console.log(`\n${c.bold}HAProxy IP conversion${apply ? '' : ' (dry-run)'}${c.reset}`);
  console.log(c.gray + '─'.repeat(72) + c.reset);

  if (toUpdate.length === 0 && skipped.length === 0) {
    console.log(`${c.green}Nothing to do -- all ${backends.length} backend server addresses are already IPs.${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Will convert (${toUpdate.length}):${c.reset}`);
  for (const { backend, server, ip } of toUpdate) {
    console.log(`  ${c.cyan}${backend.name}${c.reset}  ${c.gray}${server.address}:${server.port}${c.reset}  →  ${c.green}${ip}:${server.port}${c.reset}`);
  }

  if (skipped.length > 0) {
    console.log(`\n${c.bold}Could not resolve (${skipped.length}):${c.reset}`);
    for (const { backend, server } of skipped) {
      console.log(`  ${c.yellow}${backend.name}${c.reset}  ${c.gray}${server.address}:${server.port}${c.reset}`);
    }
  }

  if (!apply) {
    console.log(`\n${c.gray}Run with --apply to commit changes.${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Applying...${c.reset}`);
  let ok = 0, fail = 0;
  for (const { backend, server, ip } of toUpdate) {
    try {
      await client.patch('/api/v2/services/haproxy/backend/server', {
        parent_id: backend.id,
        id: server.id,
        address: ip
      });
      console.log(`  ${c.green}✓${c.reset} ${backend.name}  ${c.gray}${server.address}${c.reset} → ${ip}`);
      ok++;
    } catch (err) {
      console.log(`  ${c.yellow}✗${c.reset} ${backend.name}  ${err.response?.data?.message || err.message}`);
      fail++;
    }
  }

  await applyChanges(client);
  console.log(`\n${c.gray}Done: ${ok} updated, ${fail} failed, ${skipped.length} skipped (unresolvable).${c.reset}\n`);
}

/**
 * Restart the HAProxy service (full restart, not just reload/apply).
 * Clears the server-state file, which eliminates stale _0/_1 DOWN orphan entries.
 */
function restartHaproxy() {
  const raw = process.env.PFSENSE_HOST || '';
  const host = raw.replace(/^https?:\/\//, '').replace(/\/+$/, '') || '<pfsense-host>';
  console.log(`\n${c.yellow}The pfSense API does not expose a HAProxy restart endpoint.${c.reset}`);
  console.log(`Run this on pfSense directly:\n`);
  console.log(`  ${c.cyan}ssh admin@${host} service haproxy restart${c.reset}\n`);
}

/**
 * Print raw JSON for a named backend (useful for inspecting server fields like resolver).
 */
async function inspectBackend({ name }) {
  const client = getPfSenseClient();
  const response = await client.get('/api/v2/services/haproxy/backends');
  const backends = (response.data.data || []).filter(b => b.name === name);

  if (backends.length === 0) {
    console.error(`No backend named "${name}" found.`);
    process.exit(1);
  }

  console.log(JSON.stringify(backends[0], null, 2));
}

/**
 * Clear the resolver setting on backend servers to eliminate server-template _1 DOWN slots.
 * Dry-run by default; pass apply=true to commit changes.
 */
async function disableBackendResolver({ apply = false, name = null } = {}) {
  const client = getPfSenseClient();
  const response = await client.get('/api/v2/services/haproxy/backends');
  let backends = response.data.data || [];

  if (name) {
    backends = backends.filter(b => b.name === name);
    if (backends.length === 0) {
      console.error(`No backend named "${name}" found.`);
      process.exit(1);
    }
  }

  const toUpdate = [];

  for (const backend of backends) {
    for (const server of (backend.servers || [])) {
      const resolverVal = server.resolvers || server.resolver || server.server_resolverOpts;
      if (resolverVal && resolverVal !== '') {
        toUpdate.push({ backend, server, resolverVal });
      }
    }
  }

  console.log(`\n${c.bold}HAProxy resolver disable${apply ? '' : ' (dry-run)'}${c.reset}`);
  console.log(c.gray + '─'.repeat(72) + c.reset);

  if (toUpdate.length === 0) {
    console.log(`${c.green}Nothing to do -- no servers with resolver configured found in ${backends.length} backend(s).${c.reset}`);
    console.log(`${c.gray}Tip: run haproxy:inspect -n <name> to see raw server fields.${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Will clear resolver (${toUpdate.length}):${c.reset}`);
  for (const { backend, server, resolverVal } of toUpdate) {
    console.log(`  ${c.cyan}${backend.name}${c.reset}  ${c.gray}${server.name}${c.reset}  resolver=${c.yellow}${resolverVal}${c.reset}  →  ${c.green}(none)${c.reset}`);
  }

  if (!apply) {
    console.log(`\n${c.gray}Run with --apply to commit changes.${c.reset}\n`);
    return;
  }

  console.log(`\n${c.bold}Applying...${c.reset}`);
  let ok = 0, fail = 0;
  for (const { backend, server } of toUpdate) {
    try {
      await client.patch('/api/v2/services/haproxy/backend/server', {
        parent_id: backend.id,
        id: server.id,
        resolvers: '',
        resolver: '',
      });
      console.log(`  ${c.green}✓${c.reset} ${backend.name}  ${server.name}  resolver cleared`);
      ok++;
    } catch (err) {
      console.log(`  ${c.yellow}✗${c.reset} ${backend.name}  ${server.name}  ${err.response?.data?.message || err.message}`);
      fail++;
    }
  }

  await applyChanges(client);
  console.log(`\n${c.gray}Done: ${ok} cleared, ${fail} failed.${c.reset}\n`);
}

module.exports = {
  listBackends,
  addBackend,
  deleteBackend,
  addFrontendRoute,
  deleteFrontendRoute,
  fixBackendDnsAddresses,
  fixBackendIpAddresses,
  inspectBackend,
  disableBackendResolver,
  restartHaproxy,
};
