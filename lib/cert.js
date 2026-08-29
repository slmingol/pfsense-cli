const fs   = require('fs');
const path = require('path');
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtExpiry(daysLeft) {
  if (daysLeft == null) return c.gray + '?' + c.reset;
  if (daysLeft < 0)    return c.red  + `EXPIRED (${Math.abs(daysLeft)}d ago)` + c.reset;
  if (daysLeft < 30)   return c.red  + `${daysLeft}d` + c.reset;
  if (daysLeft < 90)   return c.yellow + `${daysLeft}d` + c.reset;
  return c.green + `${daysLeft}d` + c.reset;
}

function fmtDate(iso) {
  if (!iso) return '?';
  return String(iso).replace('T', ' ').replace(/\.\d+Z$/, '');
}

async function findCert(client, name) {
  const resp  = await client.get('/api/v2/system/certificates', { params: { limit: 0 } });
  const certs = resp.data.data || [];
  const match = certs.filter(c => c.descr === name || c.refid === name);
  if (match.length === 0) throw new Error(`Certificate not found: ${name}`);
  if (match.length > 1)   throw new Error(`Multiple certificates match "${name}" — use --refid`);
  return match[0];
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

async function listCerts({ filter, expiringDays } = {}) {
  const client = getPfSenseClient();
  const resp   = await client.get('/api/v2/system/certificates', { params: { limit: 0 } });
  let   certs  = resp.data.data || [];

  if (filter) {
    const f = filter.toLowerCase();
    certs = certs.filter(ct => (ct.descr || '').toLowerCase().includes(f));
  }
  if (expiringDays != null) {
    certs = certs.filter(ct => ct.valid_days_left != null && ct.valid_days_left <= expiringDays);
  }

  if (certs.length === 0) {
    console.log(filter || expiringDays != null
      ? 'No certificates match the filter.'
      : 'No certificates found.');
    return;
  }

  // Sort soonest-to-expire first (copy to avoid mutating API response data)
  certs = [...certs].sort((a, b) => (a.valid_days_left ?? Infinity) - (b.valid_days_left ?? Infinity));

  console.log(`\n${c.bold}Certificates (${certs.length}):${c.reset}`);
  console.log(c.gray + '─'.repeat(80) + c.reset);

  for (const ct of certs) {
    const expires = fmtExpiry(ct.valid_days_left);
    const type    = ct.type ? ` ${c.gray}[${ct.type}]${c.reset}` : '';
    console.log(`\n  ${c.bold}${c.cyan}${ct.descr || '(unnamed)'}${c.reset}${type}`);
    console.log(`    refid   : ${c.gray}${ct.refid || '?'}${c.reset}`);
    console.log(`    expires : ${expires}  ${c.gray}(${fmtDate(ct.valid_until)})${c.reset}`);
    if (ct.valid_from) console.log(`    issued  : ${c.gray}${fmtDate(ct.valid_from)}${c.reset}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function importCert({ name, certFile, keyFile, type = 'server' }) {
  if (!name)     throw new Error('--name is required');
  if (!certFile) throw new Error('--cert is required');
  if (!keyFile)  throw new Error('--key is required');

  if (!fs.existsSync(certFile)) throw new Error(`Cert file not found: ${certFile}`);
  if (!fs.existsSync(keyFile))  throw new Error(`Key file not found: ${keyFile}`);

  const crtPem = fs.readFileSync(certFile, 'utf-8').trim();
  const prvPem = fs.readFileSync(keyFile,  'utf-8').trim();

  // API expects base64-encoded PEM strings
  const crt = Buffer.from(crtPem).toString('base64');
  const prv = Buffer.from(prvPem).toString('base64');

  const client = getPfSenseClient();
  const resp   = await client.post('/api/v2/system/certificate', { descr: name, type, crt, prv });
  const refid  = resp.data.data?.refid;

  console.log(`  ${c.green}✓${c.reset} Imported certificate ${c.cyan}${name}${c.reset}${refid ? c.gray + ' (refid=' + refid + ')' + c.reset : ''}`);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

async function deleteCert({ name, refid }) {
  const client = getPfSenseClient();

  let id = refid;
  if (!id) {
    if (!name) throw new Error('Either --name or --refid is required');
    const ct = await findCert(client, name);
    id = ct.refid;
  }

  await client.delete('/api/v2/system/certificate', { data: { id } });
  console.log(`  ${c.green}✓${c.reset} Deleted certificate (refid=${id})`);
}

// ---------------------------------------------------------------------------
// Renew
// ---------------------------------------------------------------------------

async function renewCert({ name, refid }) {
  const client = getPfSenseClient();

  let id = refid;
  let descr = name;
  if (!id) {
    if (!name) throw new Error('Either --name or --refid is required');
    const ct = await findCert(client, name);
    id    = ct.refid;
    descr = ct.descr;
  }

  await client.post('/api/v2/system/certificate/renew', { id });
  console.log(`  ${c.green}✓${c.reset} Renewed certificate ${c.cyan}${descr || id}${c.reset}`);
}

// ---------------------------------------------------------------------------
// Monitoring check — exits 1 if any cert expires within threshold
// ---------------------------------------------------------------------------

async function checkCerts({ expiringDays = 30 } = {}) {
  const client = getPfSenseClient();
  const resp   = await client.get('/api/v2/system/certificates', { params: { limit: 0 } });
  const certs  = resp.data.data || [];

  const expiring = certs.filter(ct => ct.valid_days_left != null && ct.valid_days_left <= expiringDays);
  const expired  = expiring.filter(ct => ct.valid_days_left < 0);
  const soon     = expiring.filter(ct => ct.valid_days_left >= 0);

  if (expiring.length === 0) {
    console.log(`OK: all ${certs.length} certificate(s) valid for more than ${expiringDays} days`);
    return;
  }

  // Print summary line first (Nagios-style)
  const parts = [];
  if (expired.length) parts.push(`${expired.length} EXPIRED`);
  if (soon.length)    parts.push(`${soon.length} expiring within ${expiringDays}d`);
  console.log(`${c.red}${c.bold}CRITICAL: ${parts.join(', ')}${c.reset}`);

  expiring.sort((a, b) => a.valid_days_left - b.valid_days_left);
  for (const ct of expiring) {
    const tag = ct.valid_days_left < 0
      ? `${c.red}EXPIRED ${Math.abs(ct.valid_days_left)}d ago${c.reset}`
      : `${c.yellow}expires in ${ct.valid_days_left}d${c.reset}`;
    console.log(`  ${ct.descr || ct.refid}  ${tag}`);
  }

  process.exit(1);
}

module.exports = { listCerts, importCert, deleteCert, renewCert, checkCerts };
