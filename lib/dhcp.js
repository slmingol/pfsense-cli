const { getPfSenseClient } = require('./pfsense');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
};

// Fetch all static mappings from embedded staticmap arrays in /api/v2/services/dhcp_servers
async function fetchAllMappings(client, iface) {
  const resp    = await client.get('/api/v2/services/dhcp_servers', { params: { limit: 0 } });
  const servers = resp.data.data || [];
  const result  = [];
  for (const s of servers) {
    if (iface && s.id !== iface) continue;
    for (const m of s.staticmap || []) {
      result.push(m);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// List static mappings
// ---------------------------------------------------------------------------

async function listStaticMappings({ iface, filter } = {}) {
  const client = getPfSenseClient();
  let   mappings = await fetchAllMappings(client, iface);

  if (filter) {
    const f = filter.toLowerCase();
    mappings = mappings.filter(m =>
      (m.mac      || '').toLowerCase().includes(f) ||
      (m.hostname || '').toLowerCase().includes(f) ||
      (m.ipaddr   || '').includes(f) ||
      (m.descr    || '').toLowerCase().includes(f)
    );
  }

  if (mappings.length === 0) {
    console.log(filter
      ? `No static mappings matching "${filter}".`
      : `No DHCP static mappings found${iface ? ` on ${iface}` : ''}.`);
    return;
  }

  // Group by interface
  const byIface = {};
  for (const m of mappings) {
    const key = m.parent_id || '?';
    (byIface[key] = byIface[key] || []).push(m);
  }

  console.log(`\n${c.bold}DHCP Static Mappings (${mappings.length}):${c.reset}`);

  for (const [ifName, entries] of Object.entries(byIface)) {
    console.log(`\n  ${c.bold}${c.yellow}${ifName}${c.reset}  ${c.gray}(${entries.length} mapping${entries.length !== 1 ? 's' : ''})${c.reset}`);
    console.log('  ' + c.gray + '─'.repeat(68) + c.reset);
    for (const m of entries) {
      const ip       = m.ipaddr   ? c.cyan  + m.ipaddr   + c.reset : c.gray + '(dynamic)' + c.reset;
      const hostname = m.hostname ? c.green + m.hostname + c.reset : '';
      const dns      = m.dnsserver?.length ? `  ${c.gray}dns:${m.dnsserver.join(',')}${c.reset}` : '';
      console.log(`  ${c.bold}${m.mac}${c.reset}  →  ${ip}  ${hostname}${dns}`);
      if (m.descr) console.log(`    ${c.gray}${m.descr}${c.reset}`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Add static mapping
// ---------------------------------------------------------------------------

async function addStaticMapping({ iface, mac, ip, hostname, description, dns, gateway }) {
  if (!iface) throw new Error('--interface is required');
  if (!mac)   throw new Error('--mac is required');

  const client  = getPfSenseClient();
  const payload = {
    parent_id: iface,
    mac:       mac.toLowerCase(),
  };
  if (ip)          payload.ipaddr    = ip;
  if (hostname)    payload.hostname  = hostname;
  if (description) payload.descr     = description;
  if (dns?.length) payload.dnsserver = dns;
  if (gateway)     payload.gateway   = gateway;

  await client.post('/api/v2/services/dhcp_server/static_mapping', payload);
  await client.post('/api/v2/services/dhcp_server/apply', { interface: iface });

  console.log(`  ${c.green}✓${c.reset} Added static mapping ${c.cyan}${mac}${c.reset} → ${ip || '(any)'}${hostname ? ' (' + hostname + ')' : ''} on ${iface}`);
}

// ---------------------------------------------------------------------------
// Update static mapping
// ---------------------------------------------------------------------------

async function updateStaticMapping({ iface, mac, ...fields }) {
  if (!iface) throw new Error('--interface is required');
  if (!mac)   throw new Error('--mac is required');

  const client  = getPfSenseClient();
  const all     = await fetchAllMappings(client, iface);
  const entry   = all.find(m => m.mac.toLowerCase() === mac.toLowerCase());
  if (!entry) throw new Error(`No static mapping found for MAC ${mac} on ${iface}`);

  const patch = { id: entry.id, parent_id: iface };
  if (fields.ip          !== null && fields.ip          !== undefined) patch.ipaddr    = fields.ip;
  if (fields.hostname    !== null && fields.hostname    !== undefined) patch.hostname  = fields.hostname;
  if (fields.description !== null && fields.description !== undefined) patch.descr     = fields.description;
  if (fields.dns?.length)                                              patch.dnsserver = fields.dns;
  if (fields.gateway     !== null && fields.gateway     !== undefined) patch.gateway   = fields.gateway;

  await client.patch('/api/v2/services/dhcp_server/static_mapping', patch);
  await client.post('/api/v2/services/dhcp_server/apply', { interface: iface });

  console.log(`  ${c.green}✓${c.reset} Updated static mapping ${c.cyan}${mac}${c.reset} on ${iface}`);
}

// ---------------------------------------------------------------------------
// Delete static mapping
// ---------------------------------------------------------------------------

async function deleteStaticMapping({ iface, mac }) {
  if (!iface) throw new Error('--interface is required');
  if (!mac)   throw new Error('--mac is required');

  const client = getPfSenseClient();
  const all    = await fetchAllMappings(client, iface);
  const entry  = all.find(m => m.mac.toLowerCase() === mac.toLowerCase());
  if (!entry) throw new Error(`No static mapping found for MAC ${mac} on ${iface}`);

  await client.delete('/api/v2/services/dhcp_server/static_mapping', { data: { id: entry.id, parent_id: iface } });
  await client.post('/api/v2/services/dhcp_server/apply', { interface: iface });

  console.log(`  ${c.green}✓${c.reset} Deleted static mapping ${c.cyan}${mac}${c.reset} from ${iface}`);
}

module.exports = { listStaticMappings, addStaticMapping, updateStaticMapping, deleteStaticMapping };
