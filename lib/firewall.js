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

async function listAliases({ filter } = {}) {
  const client = getPfSenseClient();
  const resp = await client.get('/api/v2/firewall/aliases', { params: { limit: 0 } });
  let aliases = resp.data.data || [];

  if (filter) {
    const f = filter.toLowerCase();
    aliases = aliases.filter(a =>
      a.name.toLowerCase().includes(f) || (a.descr || '').toLowerCase().includes(f)
    );
  }

  if (aliases.length === 0) {
    console.log(filter ? `No aliases matching "${filter}".` : 'No firewall aliases configured.');
    return;
  }

  console.log(`\n${c.bold}Firewall Aliases:${c.reset}`);
  console.log(c.gray + '─'.repeat(70) + c.reset);
  for (const a of aliases) {
    const addrs   = a.address || [];
    const details = a.detail  || [];
    console.log(`\n  ${c.bold}${c.cyan}${a.name}${c.reset}  ${c.gray}(${a.type})${c.reset}  ${a.descr || ''}`);
    if (addrs.length === 0) {
      console.log(`    ${c.gray}(empty)${c.reset}`);
    } else {
      addrs.forEach((addr, i) => {
        const note = details[i] ? `  ${c.gray}# ${details[i]}${c.reset}` : '';
        console.log(`    ${addr}${note}`);
      });
    }
  }
  console.log('');
}

async function createOrUpdateAlias({ name, type = 'host', description = '', hosts = [], details = [] }) {
  const client = getPfSenseClient();

  const resp     = await client.get('/api/v2/firewall/aliases', { params: { limit: 0 } });
  const existing = (resp.data.data || []).find(a => a.name === name);

  const normalised = hosts.map(h => h.split('/')[0]); // strip /32 for host-type aliases
  const payload = {
    name,
    type,
    descr:   description,
    address: normalised,
    detail:  details.length ? details : normalised.map(() => ''),
  };

  if (existing) {
    await client.patch('/api/v2/firewall/alias', { id: existing.id, ...payload });
    console.log(`  ${c.green}✓${c.reset} Updated alias ${c.cyan}${name}${c.reset} (${normalised.length} host(s))`);
  } else {
    await client.post('/api/v2/firewall/alias', payload);
    console.log(`  ${c.green}✓${c.reset} Created alias ${c.cyan}${name}${c.reset} (${normalised.length} host(s))`);
  }

  await client.post('/api/v2/firewall/apply');
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

async function addAliasHost({ name, host, detail = '' }) {
  const client = getPfSenseClient();

  const resp  = await client.get('/api/v2/firewall/aliases', { params: { limit: 0 } });
  const alias = (resp.data.data || []).find(a => a.name === name);
  if (!alias) throw new Error(`Alias not found: ${name}`);

  const ip      = host.split('/')[0]; // normalise — strip CIDR for host aliases
  const addrs   = alias.address || [];
  const details = alias.detail  || [];

  if (addrs.includes(ip)) {
    console.log(`  ${c.blue}ℹ${c.reset} ${ip} already in ${name}`);
    return;
  }

  addrs.push(ip);
  details.push(detail);

  await client.patch('/api/v2/firewall/alias', { id: alias.id, address: addrs, detail: details });
  await client.post('/api/v2/firewall/apply');

  console.log(`  ${c.green}✓${c.reset} Added ${c.cyan}${ip}${c.reset} to alias ${c.cyan}${name}${c.reset}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

async function removeAliasHost({ name, host }) {
  const client = getPfSenseClient();

  const resp  = await client.get('/api/v2/firewall/aliases', { params: { limit: 0 } });
  const alias = (resp.data.data || []).find(a => a.name === name);
  if (!alias) throw new Error(`Alias not found: ${name}`);

  const ip      = host.split('/')[0];
  const addrs   = alias.address || [];
  const details = alias.detail  || [];

  const idx = addrs.indexOf(ip);
  if (idx === -1) {
    console.log(`  ${c.blue}ℹ${c.reset} ${ip} not found in alias ${name}`);
    return;
  }

  addrs.splice(idx, 1);
  details.splice(idx, 1);

  await client.patch('/api/v2/firewall/alias', { id: alias.id, address: addrs, detail: details });
  await client.post('/api/v2/firewall/apply');

  console.log(`  ${c.green}✓${c.reset} Removed ${c.cyan}${ip}${c.reset} from alias ${c.cyan}${name}${c.reset}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

async function deleteAlias({ name }) {
  const client = getPfSenseClient();

  const resp  = await client.get('/api/v2/firewall/aliases', { params: { limit: 0 } });
  const alias = (resp.data.data || []).find(a => a.name === name);

  if (!alias) {
    console.log(`  ${c.blue}ℹ${c.reset} Alias ${name} not found — skipped`);
    return;
  }

  await client.delete('/api/v2/firewall/alias', { data: { id: alias.id } });
  await client.post('/api/v2/firewall/apply');

  console.log(`  ${c.green}✓${c.reset} Deleted alias ${c.cyan}${name}${c.reset}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

// ---------------------------------------------------------------------------
// Firewall rule management
// ---------------------------------------------------------------------------

function fmtBytes(n) {
  if (n == null) return '-';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'G';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

async function listRules({ filter, iface, type } = {}) {
  const client = getPfSenseClient();
  const resp = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
  let rules = resp.data.data || [];

  if (filter) {
    const f = filter.toLowerCase();
    rules = rules.filter(r => (r.descr || '').toLowerCase().includes(f));
  }
  if (iface) {
    rules = rules.filter(r => {
      const ifaces = Array.isArray(r.interface) ? r.interface : [r.interface];
      return ifaces.includes(iface);
    });
  }
  if (type) rules = rules.filter(r => r.type === type);

  if (rules.length === 0) {
    console.log('No firewall rules found matching criteria.');
    return;
  }

  console.log(`\n${c.bold}Firewall Rules (${rules.length}):${c.reset}`);
  console.log(c.gray + '─'.repeat(100) + c.reset);

  for (const r of rules) {
    const rtype     = r.type || '?';
    const typeColor = rtype === 'pass' ? c.green : rtype === 'block' ? c.red : c.yellow;
    const ifaces    = (Array.isArray(r.interface) ? r.interface : [r.interface]).join(',');
    const src       = r.source       || 'any';
    const dst       = r.destination  || 'any';
    const proto     = r.protocol     || '*';
    const gw        = r.gateway      || '-';
    const disabled  = r.disabled ? ` ${c.gray}[disabled]${c.reset}` : '';
    const floating  = r.floating ? ` ${c.yellow}[float]${c.reset}` : '';

    console.log(
      `\n  ${c.bold}${String(r.id).padEnd(4)}${c.reset}` +
      ` ${typeColor}${rtype.toUpperCase().padEnd(6)}${c.reset}` +
      ` ${c.cyan}${ifaces.padEnd(8)}${c.reset}` +
      `${disabled}${floating}`
    );
    console.log(`       src: ${c.cyan}${src}${r.source_port ? ':' + r.source_port : ''}${c.reset}  →  dst: ${c.cyan}${dst}${r.destination_port ? ':' + r.destination_port : ''}${c.reset}  proto: ${proto}`);
    if (r.gateway) console.log(`       gateway: ${c.yellow}${gw}${c.reset}`);
    if (r.tag)     console.log(`       tag: ${r.tag}`);
    if (r.descr)   console.log(`       ${c.gray}${r.descr}${c.reset}`);
  }
  console.log('');
}

async function addRule({
  type,
  iface,
  source      = 'any',
  sourcePort  = null,
  destination = 'any',
  destPort    = null,
  protocol    = null,
  ipprotocol  = 'inet',
  gateway     = null,
  tag         = null,
  description = '',
  log         = false,
  disabled    = false,
  floating    = false,
}) {
  const client = getPfSenseClient();

  const payload = {
    type,
    interface:        [iface],
    ipprotocol,
    protocol:         protocol || null,
    source,
    source_port:      sourcePort || null,
    destination,
    destination_port: destPort || null,
    descr:            description,
    disabled:         !!disabled,
    log:              !!log,
    floating:         !!floating,
    gateway:          gateway || null,
    tag:              tag || null,
  };

  const resp = await client.post('/api/v2/firewall/rule', payload);
  await client.post('/api/v2/firewall/apply');

  const id = resp.data.data?.id;
  const typeColor = type === 'pass' ? c.green : c.red;
  console.log(`  ${c.green}✓${c.reset} Created ${typeColor}${type.toUpperCase()}${c.reset} rule${description ? ': ' + description : ''}${id != null ? c.gray + ' (id=' + id + ')' + c.reset : ''}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

async function deleteRule({ id, description }) {
  const client = getPfSenseClient();

  let ruleId = id != null ? Number(id) : null;

  if (ruleId == null) {
    if (!description) throw new Error('Either --id or --description is required');
    const resp  = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const rules = (resp.data.data || []).filter(r => r.descr === description);
    if (rules.length === 0) throw new Error(`No rule found with description: ${description}`);
    if (rules.length > 1)  throw new Error(`Multiple rules match "${description}" — use --id instead`);
    ruleId = rules[0].id;
  }

  await client.delete('/api/v2/firewall/rule', { data: { id: ruleId } });
  await client.post('/api/v2/firewall/apply');

  console.log(`  ${c.green}✓${c.reset} Deleted rule id=${ruleId}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

async function updateRule({ id, description, ...fields }) {
  const client = getPfSenseClient();

  let ruleId = id != null ? Number(id) : null;
  let existing;

  if (ruleId == null) {
    if (!description) throw new Error('Either --id or --description is required');
    const resp  = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const rules = (resp.data.data || []).filter(r => r.descr === description);
    if (rules.length === 0) throw new Error(`No rule found with description: ${description}`);
    if (rules.length > 1)  throw new Error(`Multiple rules match "${description}" — use --id instead`);
    existing = rules[0];
    ruleId   = existing.id;
  }

  // Only send fields explicitly provided (non-null)
  const patch = { id: ruleId };
  const map = {
    type:        'type',
    iface:       'interface',
    source:      'source',
    sourcePort:  'source_port',
    destination: 'destination',
    destPort:    'destination_port',
    protocol:    'protocol',
    ipprotocol:  'ipprotocol',
    gateway:     'gateway',
    tag:         'tag',
    descr:       'descr',
    log:         'log',
    disabled:    'disabled',
    floating:    'floating',
  };

  for (const [jsKey, apiKey] of Object.entries(map)) {
    if (fields[jsKey] !== undefined && fields[jsKey] !== null) {
      patch[apiKey] = jsKey === 'iface' ? [fields[jsKey]] : fields[jsKey];
    }
  }

  await client.patch('/api/v2/firewall/rule', patch);
  await client.post('/api/v2/firewall/apply');

  console.log(`  ${c.green}✓${c.reset} Updated rule id=${ruleId}`);
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
}

module.exports = {
  listAliases,
  createOrUpdateAlias,
  addAliasHost,
  removeAliasHost,
  deleteAlias,
  listRules,
  addRule,
  deleteRule,
  updateRule,
};
