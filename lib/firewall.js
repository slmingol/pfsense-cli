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

module.exports = {
  listAliases,
  createOrUpdateAlias,
  addAliasHost,
  removeAliasHost,
  deleteAlias,
};
