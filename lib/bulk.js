const fs   = require('fs');
const path = require('path');
const { getPfSenseClient } = require('./pfsense');
const { addEntry, addAlias, deleteAlias } = require('./dns');
const { addBackend, deleteBackend, addFrontendRoute, deleteFrontendRoute } = require('./haproxy');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseJSON(filePath) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch (e) { throw new Error(`Invalid JSON in ${filePath}: ${e.message}`, { cause: e }); }
  if (raw === null || typeof raw !== 'object') throw new Error(`Invalid JSON in ${filePath}: expected an object or array, got ${JSON.stringify(raw)?.slice(0, 40)}`);
  // Bare array → assume services
  return Array.isArray(raw) ? { services: raw } : raw;
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = parseCSVLine(lines[0]);
  const rows    = lines.slice(1).map((line, idx) => {
    const vals = parseCSVLine(line);
    if (vals.length !== headers.length) {
      throw new Error(`CSV row ${idx + 2} has ${vals.length} fields but header has ${headers.length} — check for unquoted commas`);
    }
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });

  // Infer record type from header set
  const h = new Set(headers);
  if (h.has('alias') && h.has('port'))                  return { services: rows };
  if (h.has('host')  && h.has('domain') && h.has('ip')) return { dns: rows };
  if (h.has('name')  && h.has('server') && h.has('port')) return { haproxy: rows };
  throw new Error(`Cannot infer record type from CSV headers: ${headers.join(', ')}\n  Expected: alias+port (services), host+domain+ip (dns), or name+server+port (haproxy)`);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(data) {
  const errors = [];

  (data.services || []).forEach((s, i) => {
    if (!s.alias)       errors.push(`services[${i}]: missing alias`);
    else if (!/^[a-z0-9][a-z0-9-]*$/i.test(s.alias)) errors.push(`services[${i}]: alias "${s.alias}" contains invalid characters (a-z, 0-9, hyphen only)`);
    if (!s.port)        errors.push(`services[${i}]: missing port`);
    else if (!/^\d+$/.test(String(s.port)) || parseInt(s.port) < 1 || parseInt(s.port) > 65535) errors.push(`services[${i}]: port must be 1-65535`);
    if (!s.description) errors.push(`services[${i}]: missing description`);
  });

  const aliases = (data.services || []).map(s => s.alias).filter(Boolean);
  const dupAliases = aliases.filter((a, i) => aliases.indexOf(a) !== i);
  if (dupAliases.length) errors.push(`Duplicate service aliases: ${[...new Set(dupAliases)].join(', ')}`);

  (data.dns || []).forEach((d, i) => {
    if (!d.host)   errors.push(`dns[${i}]: missing host`);
    if (!d.domain) errors.push(`dns[${i}]: missing domain`);
    if (!d.ip)     errors.push(`dns[${i}]: missing ip`);
    if (d.ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(d.ip)) errors.push(`dns[${i}]: ip "${d.ip}" does not look like an IPv4 address`);
  });

  (data.haproxy || []).forEach((h, i) => {
    if (!h.name)   errors.push(`haproxy[${i}]: missing name`);
    if (!h.server) errors.push(`haproxy[${i}]: missing server`);
    if (!h.port)   errors.push(`haproxy[${i}]: missing port`);
    if (h.port && isNaN(parseInt(h.port))) errors.push(`haproxy[${i}]: port must be a number`);
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Dry-run preview
// ---------------------------------------------------------------------------

function previewServices(services) {
  console.log(`\n${c.bold}Services (${services.length}):${c.reset}`);
  for (const s of services) {
    const hostBub      = s.host_bub      || 'docker-host-01-svcs';
    const hostLamolabs = s.host_lamolabs || 'lamolabs-svcs';
    const ssl = s.ssl === true || s.ssl === 'true';
    console.log(`  ${c.cyan}${s.alias}${c.reset}  port=${s.port}${ssl ? ` ${c.yellow}[SSL]${c.reset}` : ''}  "${s.description}"`);
    console.log(`    ${c.gray}DNS  ${s.alias}.bub.lan → ${hostBub}.bub.lan${c.reset}`);
    console.log(`    ${c.gray}DNS  ${s.alias}.lamolabs.org → ${hostLamolabs}.lamolabs.org${c.reset}`);
    console.log(`    ${c.gray}HAProxy  ${s.alias} → ${s.alias}.bub.lan:${s.port}${c.reset}`);
    console.log(`    ${c.gray}Frontend ${s.alias}.lamolabs.org → ${s.alias}${c.reset}`);
  }
}

function previewDNS(entries) {
  console.log(`\n${c.bold}DNS entries (${entries.length}):${c.reset}`);
  for (const d of entries) {
    console.log(`  ${c.cyan}${d.host}.${d.domain}${c.reset} → ${d.ip}${d.description ? `  ${c.gray}"${d.description}"${c.reset}` : ''}`);
  }
}

function previewHAProxy(backends) {
  console.log(`\n${c.bold}HAProxy backends (${backends.length}):${c.reset}`);
  for (const h of backends) {
    const ssl = h.ssl === true || h.ssl === 'true';
    console.log(`  ${c.cyan}${h.name}${c.reset} → ${h.server}:${h.port}${ssl ? ` ${c.yellow}[SSL]${c.reset}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyServices(services) {
  console.log(`\n${c.bold}[Services]${c.reset}`);
  let ok = 0, fail = 0;
  for (const s of services) {
    const hostBub      = s.host_bub      || 'docker-host-01-svcs';
    const hostLamolabs = s.host_lamolabs || 'lamolabs-svcs';
    const ssl = s.ssl === true || s.ssl === 'true';
    console.log(`\n  ${c.cyan}${s.alias}${c.reset}  port=${s.port}${ssl ? ` ${c.yellow}[SSL]${c.reset}` : ''}`);

    const done = [];
    try {
      await addAlias({ host: hostBub,      domain: 'bub.lan',      aliasHost: s.alias, aliasDomain: 'bub.lan',      description: s.description });
      done.push('dns-bub');
      console.log(`    ${c.green}✓${c.reset} DNS ${s.alias}.bub.lan`);

      await addAlias({ host: hostLamolabs, domain: 'lamolabs.org', aliasHost: s.alias, aliasDomain: 'lamolabs.org', description: s.description });
      done.push('dns-lamolabs');
      console.log(`    ${c.green}✓${c.reset} DNS ${s.alias}.lamolabs.org`);

      await addBackend({ name: s.alias, serverName: `${s.alias}.bub.lan`, serverAddress: `${s.alias}.bub.lan`, serverPort: parseInt(s.port), ssl });
      done.push('backend');
      console.log(`    ${c.green}✓${c.reset} HAProxy backend :${s.port}`);

      await addFrontendRoute({ frontendName: 'HomePrivateServers', aclName: s.alias, hostname: `${s.alias}.lamolabs.org`, backendName: s.alias });
      done.push('frontend');
      console.log(`    ${c.green}✓${c.reset} Frontend route`);

      ok++;
    } catch (e) {
      console.log(`    ${c.red}✗${c.reset} ${e.message}`);
      if (done.length) {
        console.log(`    ${c.yellow}↩${c.reset} Rolling back ${done.length} step(s)...`);
        if (done.includes('frontend'))    await deleteFrontendRoute({ frontendName: 'HomePrivateServers', aclName: s.alias }).catch(re => console.log(`    ${c.red}✗${c.reset} rollback frontend: ${re.message}`));
        if (done.includes('backend'))     await deleteBackend(s.alias).catch(re => console.log(`    ${c.red}✗${c.reset} rollback backend: ${re.message}`));
        if (done.includes('dns-lamolabs')) await deleteAlias({ host: hostLamolabs, domain: 'lamolabs.org', aliasHost: s.alias, aliasDomain: 'lamolabs.org' }).catch(re => console.log(`    ${c.red}✗${c.reset} rollback dns-lamolabs: ${re.message}`));
        if (done.includes('dns-bub'))     await deleteAlias({ host: hostBub,      domain: 'bub.lan',      aliasHost: s.alias, aliasDomain: 'bub.lan'      }).catch(re => console.log(`    ${c.red}✗${c.reset} rollback dns-bub: ${re.message}`));
      }
      fail++;
    }
  }
  return { ok, fail };
}

async function applyDNS(entries) {
  console.log(`\n${c.bold}[DNS]${c.reset}`);
  let ok = 0, fail = 0;
  for (const d of entries) {
    try {
      await addEntry({ host: d.host, domain: d.domain, ip: d.ip, description: d.description || '' });
      console.log(`  ${c.green}✓${c.reset} ${d.host}.${d.domain} → ${d.ip}`);
      ok++;
    } catch (e) {
      console.log(`  ${c.red}✗${c.reset} ${d.host}.${d.domain}: ${e.message}`);
      fail++;
    }
  }
  return { ok, fail };
}

async function applyHAProxy(backends) {
  console.log(`\n${c.bold}[HAProxy]${c.reset}`);
  let ok = 0, fail = 0;
  for (const h of backends) {
    const ssl = h.ssl === true || h.ssl === 'true';
    try {
      await addBackend({ name: h.name, serverName: h.server, serverAddress: h.server, serverPort: parseInt(h.port), ssl });
      console.log(`  ${c.green}✓${c.reset} ${h.name} → ${h.server}:${h.port}${ssl ? ` [SSL]` : ''}`);
      ok++;
    } catch (e) {
      console.log(`  ${c.red}✗${c.reset} ${h.name}: ${e.message}`);
      fail++;
    }
  }
  return { ok, fail };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function bulkImport({ file, dryRun = false }) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

  const ext  = path.extname(file).toLowerCase();
  let   data;
  if      (ext === '.json') data = parseJSON(file);
  else if (ext === '.csv')  data = parseCSV(file);
  else throw new Error(`Unsupported file type: ${ext}  (use .json or .csv)`);

  // Validate before touching anything
  const errors = validate(data);
  if (errors.length) {
    console.log(`\n${c.red}${c.bold}Validation errors (${errors.length}):${c.reset}`);
    errors.forEach(e => console.log(`  ${c.red}✗${c.reset} ${e}`));
    throw new Error(`Validation failed — nothing applied`);
  }

  const nServices = (data.services || []).length;
  const nDNS      = (data.dns      || []).length;
  const nHAProxy  = (data.haproxy  || []).length;

  console.log(`\n${c.bold}Bulk import${c.reset}${dryRun ? `  ${c.yellow}[DRY RUN]${c.reset}` : ''}`);
  console.log(c.gray + '─'.repeat(56) + c.reset);
  if (nServices) console.log(`  services : ${nServices}`);
  if (nDNS)      console.log(`  dns      : ${nDNS}`);
  if (nHAProxy)  console.log(`  haproxy  : ${nHAProxy}`);
  console.log(`  total    : ${nServices + nDNS + nHAProxy}`);

  if (dryRun) {
    if (data.services?.length) previewServices(data.services);
    if (data.dns?.length)      previewDNS(data.dns);
    if (data.haproxy?.length)  previewHAProxy(data.haproxy);
    console.log(`\n${c.yellow}Dry run — no changes applied.${c.reset}\n`);
    return;
  }

  let totalOk = 0, totalFail = 0;
  if (data.services?.length) { const r = await applyServices(data.services); totalOk += r.ok; totalFail += r.fail; }
  if (data.dns?.length)      { const r = await applyDNS(data.dns);           totalOk += r.ok; totalFail += r.fail; }
  if (data.haproxy?.length)  { const r = await applyHAProxy(data.haproxy);   totalOk += r.ok; totalFail += r.fail; }

  console.log(`\n${c.bold}Done.${c.reset}  ${c.green}${totalOk} succeeded${c.reset}${totalFail ? `  ${c.red}${totalFail} failed${c.reset}` : ''}\n`);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function bulkExport({ output } = {}) {
  const client = getPfSenseClient();

  // DNS host overrides
  const dnsResp  = await client.get('/api/v2/services/dns_resolver/host_overrides', { params: { limit: 0 } });
  const dns      = (dnsResp.data.data || []).map(e => {
    const ip    = Array.isArray(e.ip) ? e.ip[0] : e.ip;
    const entry = { host: e.host, domain: e.domain, ip };
    if (e.descr) entry.description = e.descr;
    return entry;
  });

  // HAProxy backends — one record per server entry
  const haResp = await client.get('/api/v2/services/haproxy/backends', { params: { limit: 0 } });
  const haproxy = (haResp.data.data || []).flatMap(b =>
    (b.servers || []).map(s => {
      const entry = { name: b.name, server: s.address, port: s.port };
      if (s.ssl) entry.ssl = true;
      return entry;
    })
  );

  // HAProxy frontends (metadata — not yet importable, included for snapshot completeness)
  const feResp  = await client.get('/api/v2/services/haproxy/frontends', { params: { limit: 0 } });
  const frontends = (feResp.data.data || []).map(f => ({
    name:    f.name,
    acls:    (f.ha_acls        || []).map(a => ({ name: a.name, hostname: a.value })),
    actions: (f.a_actionitems  || []).map(a => ({ acl: a.acl, backend: a.backend })),
  }));

  const snapshot = {
    exported_at: new Date().toISOString(),
    dns,
    haproxy,
    frontends,
  };

  const json = JSON.stringify(snapshot, null, 2) + '\n';

  if (output) {
    fs.writeFileSync(output, json);
    console.log(`Exported ${dns.length} DNS entries, ${haproxy.length} HAProxy backend(s), ${frontends.length} frontend(s) → ${output}`);
  } else {
    process.stdout.write(json);
  }
}

module.exports = { bulkImport, bulkExport };
