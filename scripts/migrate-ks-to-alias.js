#!/usr/bin/env node
// One-shot migration: replaces per-IP kill-switch rules with a single alias-based rule pair.
// Reads the gateway from the existing pass rule so nothing is hardcoded.
//
// Usage: node scripts/migrate-ks-to-alias.js

const { getPfSenseClient } = require('../lib/pfsense');
const { createOrUpdateAlias } = require('../lib/firewall');

const ALIAS_NAME = 'RouteThroughNordVPN_WG';
const KS_IP      = '192.168.7.6';
const LAN_IFACE  = 'lan';

const OLD_PASS_DESCR  = 'pf-protonvpn-ks-192-168-7-6';
const OLD_BLOCK_DESCR = 'pf-nordvpn-wg-ks-fallback-192-168-7-6';
const NEW_PASS_DESCR  = `pf-protonvpn-ks-${ALIAS_NAME}`;
const NEW_BLOCK_DESCR = `pf-protonvpn-ks-fallback-${ALIAS_NAME}`;

const c = {
  reset:  '\x1b[0m', bold: '\x1b[1m',
  green:  '\x1b[32m', cyan: '\x1b[36m', gray: '\x1b[90m', yellow: '\x1b[33m',
};

async function migrate() {
  const client = getPfSenseClient();

  // 1. Read existing rules
  process.stdout.write('Fetching existing firewall rules...');
  const resp     = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
  const rules    = resp.data.data || [];
  const oldPass  = rules.find(r => r.descr === OLD_PASS_DESCR);
  const oldBlock = rules.find(r => r.descr === OLD_BLOCK_DESCR);
  process.stdout.write(' done\n');

  if (!oldPass && !oldBlock) {
    console.log('No per-IP kill-switch rules found — nothing to migrate.');
    return;
  }

  const gwName = oldPass?.gateway;
  if (!gwName) throw new Error('Could not determine gateway from existing pass rule — is it set?');

  console.log(`  ${c.gray}${OLD_PASS_DESCR}${c.reset}  gateway=${c.cyan}${gwName}${c.reset}`);
  console.log(`  ${c.gray}${OLD_BLOCK_DESCR}${c.reset}`);

  // 2. Create alias
  console.log(`\nCreating alias ${c.cyan}${ALIAS_NAME}${c.reset} ← ${KS_IP}`);
  await createOrUpdateAlias({
    name:        ALIAS_NAME,
    type:        'host',
    description: 'Kill-switch hosts routed via NordVPN WireGuard',
    hosts:       [KS_IP],
    details:     ['pi-vpn'],
  });

  // 3. New pass rule referencing alias
  console.log(`\nPass rule  ${c.cyan}${NEW_PASS_DESCR}${c.reset}  source=${ALIAS_NAME} → gateway=${gwName}`);
  const existingNewPass = rules.find(r => r.descr === NEW_PASS_DESCR);
  const passPayload = {
    type:        'pass',
    interface:   [LAN_IFACE],
    ipprotocol:  'inet',
    protocol:    null,
    source:      ALIAS_NAME,
    destination: 'any',
    gateway:     gwName,
    tag:         'vpntraffic',
    floating:    false,
    disabled:    false,
    descr:       NEW_PASS_DESCR,
  };
  if (existingNewPass) {
    await client.patch('/api/v2/firewall/rule', { id: existingNewPass.id, ...passPayload });
    console.log(`  ${c.green}✓${c.reset} Updated (already existed)`);
  } else {
    await client.post('/api/v2/firewall/rule', passPayload);
    console.log(`  ${c.green}✓${c.reset} Created`);
  }

  // 4. New fallback block rule
  console.log(`\nBlock rule ${c.cyan}${NEW_BLOCK_DESCR}${c.reset}  source=${ALIAS_NAME}`);
  const existingNewBlock = rules.find(r => r.descr === NEW_BLOCK_DESCR);
  const blockPayload = {
    type:        'block',
    interface:   [LAN_IFACE],
    ipprotocol:  'inet',
    protocol:    null,
    source:      ALIAS_NAME,
    destination: 'any',
    floating:    false,
    disabled:    false,
    descr:       NEW_BLOCK_DESCR,
  };
  if (existingNewBlock) {
    await client.patch('/api/v2/firewall/rule', { id: existingNewBlock.id, ...blockPayload });
    console.log(`  ${c.green}✓${c.reset} Updated (already existed)`);
  } else {
    await client.post('/api/v2/firewall/rule', blockPayload);
    console.log(`  ${c.green}✓${c.reset} Created`);
  }

  // 5. Delete old per-IP rules
  console.log('\nRemoving old per-IP rules...');
  for (const rule of [oldPass, oldBlock].filter(Boolean)) {
    await client.delete('/api/v2/firewall/rule', { data: { id: rule.id } });
    console.log(`  ${c.green}✓${c.reset} Deleted: ${rule.descr}`);
  }

  // 6. Apply
  await client.post('/api/v2/firewall/apply');
  console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);

  console.log(`\n${c.bold}${c.green}Migration complete.${c.reset}`);
  console.log(`\n${c.yellow}Verify rule order in pfSense: Firewall > Rules > LAN${c.reset}`);
  console.log(`  "${NEW_PASS_DESCR}"  must sit above the VPNBalanced_GWGrp rule`);
  console.log(`  "${NEW_BLOCK_DESCR}"  immediately after\n`);
  console.log(`To add more hosts later:`);
  console.log(`  make fw-alias-add-host NAME=${ALIAS_NAME} HOST=<ip> DETAIL='<label>'\n`);
}

migrate().catch(e => { console.error('Error:', e.message); process.exit(1); });
