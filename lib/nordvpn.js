const https = require('https');
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
// NordVPN API helpers
// ---------------------------------------------------------------------------

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}: ${body}`));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchNordVPNCreds(accessToken) {
  const auth = Buffer.from(`token:${accessToken}`).toString('base64');
  const data = await get('https://api.nordvpn.com/v1/users/services/credentials', {
    Authorization: `Basic ${auth}`,
    'User-Agent':  'pfsense-cli/nordvpn',
  });
  return {
    nordlynxPrivateKey: data.nordlynx_private_key,
    username:           data.username,
    password:           data.password,
  };
}

async function fetchNordVPNServers({ countryId = 228, limit = 5 } = {}) {
  const url =
    `https://api.nordvpn.com/v1/servers/recommendations` +
    `?filters[servers_technologies][identifier]=wireguard_udp` +
    `&filters[country_id]=${countryId}` +
    `&limit=${limit}`;

  const servers = await get(url);

  return servers.map(s => {
    const wg = (s.technologies || []).find(t => t.identifier === 'wireguard_udp');
    const pubkey = wg?.metadata?.find(m => m.name === 'public_key')?.value || '';
    const station = s.station || (s.ips && s.ips[0] && s.ips[0].ip && s.ips[0].ip.ip) || '';
    return {
      name:   s.name,
      ip:     station,
      load:   s.load,
      pubkey,
    };
  });
}

// ---------------------------------------------------------------------------
// nordvpn:rotate-wg
//   Fetch the best available NordVPN WireGuard server and update the peer
//   endpoint in pfSense without a full teardown/re-provision.
// ---------------------------------------------------------------------------

async function rotateNordVPNWG({
  accessToken: _accessToken,
  countryId    = 228,
  tunnelDescr  = 'NordVPNWG01',
  gatewayName  = 'NORDVPNWG_GW',
  monitorIP:   _monitorIP,
  dryRun       = false,
  force        = false,
}) {
  const client = getPfSenseClient();

  console.log(`\n${c.bold}NordVPN WireGuard rotation${c.reset}`);
  console.log(c.gray + '─'.repeat(52) + c.reset);

  // 0. Check gateway status — skip rotation if tunnel is down (unless --force)
  const gwResp = await client.get('/api/v2/status/gateways', { params: { limit: 0 } });
  const gw     = (gwResp.data.data || []).find(g => g.name === gatewayName);
  if (!gw) {
    if (!force) { console.log(`  ${c.yellow}Gateway ${gatewayName} not found — skipping rotation${c.reset}\n`); return; }
    console.log(`  ${c.yellow}Gateway ${gatewayName} not found — proceeding anyway (--force)${c.reset}`);
  } else if (gw.status !== 'online') {
    if (!force) { console.log(`  ${c.yellow}Gateway ${gatewayName} is ${gw.status} — skipping rotation${c.reset}\n`); return; }
    console.log(`  ${c.yellow}Gateway ${gatewayName} is ${gw.status} — proceeding anyway (--force)${c.reset}`);
  } else {
    console.log(`  Gateway ${c.green}${gatewayName}${c.reset} is online`);
  }

  // 1. Fetch best server
  process.stdout.write(`  Fetching server recommendations...`);
  const servers = await fetchNordVPNServers({ countryId });
  if (!servers.length) throw new Error('No NordVPN WireGuard servers returned');
  const best = servers.reduce((a, b) => (a.load <= b.load ? a : b));
  process.stdout.write(` done\n`);
  console.log(`  ${c.cyan}${best.name}${c.reset}  ${best.ip}  load ${best.load}%`);

  if (!best.ip)     throw new Error(`No IP for server ${best.name}`);
  if (!best.pubkey) throw new Error(`No public key for server ${best.name}`);

  const newEndpoint = best.ip;
  const newPort     = 51820;
  const newPubkey   = best.pubkey;

  if (dryRun) {
    console.log(`\n  ${c.yellow}Dry-run -- would update peer endpoint to ${newEndpoint}:${newPort}${c.reset}\n`);
    return;
  }

  // 2. Find tunnel
  const tunnelResp = await client.get('/api/v2/vpn/wireguard/tunnels', { params: { limit: 0 } });
  const tunnel = (tunnelResp.data.data || []).find(t => t.descr === tunnelDescr);
  if (!tunnel) throw new Error(`WireGuard tunnel not found: ${tunnelDescr}`);
  const tunnelIfName = tunnel.name;

  // 3. Find peer
  const peerResp = await client.get('/api/v2/vpn/wireguard/peers', { params: { limit: 0 } });
  const peer = (peerResp.data.data || []).find(p => p.tun === tunnelIfName);
  if (!peer) throw new Error(`No peer found on tunnel ${tunnelIfName}`);

  const oldEndpoint = `${peer.endpoint}:${peer.port}`;
  if (peer.endpoint === newEndpoint && String(peer.port) === String(newPort) && peer.publickey === newPubkey) {
    console.log(`\n  ${c.green}Already on best server${c.reset} (${newEndpoint}:${newPort})\n`);
    return;
  }

  // 4. Patch peer in pfSense DB + apply
  process.stdout.write(`  ${oldEndpoint} → ${newEndpoint}:${newPort} ...`);
  const oldPubkey = peer.publickey;
  await client.patch('/api/v2/vpn/wireguard/peer', {
    id:        peer.id,
    publickey: newPubkey,
    endpoint:  newEndpoint,
    port:      String(newPort),
  });
  await client.post('/api/v2/vpn/wireguard/apply');
  process.stdout.write(` done\n`);

  // 5. Update the running WireGuard kernel directly — pfSense apply does not
  //    always propagate to the live wg daemon when the tunnel is in a bad state.
  try {
    const removeOld = oldPubkey && oldPubkey !== newPubkey
      ? `wg set ${tunnelIfName} peer ${oldPubkey} remove; `
      : '';
    const wgCmd = `${removeOld}wg set ${tunnelIfName} peer ${newPubkey} endpoint ${newEndpoint}:${newPort} allowed-ips 0.0.0.0/0,::/0 persistent-keepalive 25`;
    await client.post('/api/v2/diagnostics/command_prompt', { command: wgCmd });
    console.log(`  ${c.gray}WireGuard kernel peer updated directly${c.reset}`);
  } catch (e) {
    console.log(`  ${c.yellow}Warning: direct wg set failed: ${e.message}${c.reset}`);
  }

  // 6. Update watchdog peer conf so the watchdog uses the new endpoint on next reset
  const peerConfPath = '/var/db/nordvpn-wg-peer.conf';
  const peerConfContent = `PEER_PK=${newPubkey}\\nENDPOINT=${newEndpoint}:${newPort}\\nALLOWED_IPS=0.0.0.0/0,::/0\\n`;
  try {
    await client.post('/api/v2/diagnostics/command_prompt', {
      command: `printf '${peerConfContent}' > ${peerConfPath} && chmod 600 ${peerConfPath}`,
    });
    console.log(`  ${c.gray}Watchdog peer conf updated (${peerConfPath})${c.reset}`);
  } catch (e) {
    console.log(`  ${c.yellow}Warning: could not update watchdog peer conf: ${e.message}${c.reset}`);
  }

  console.log(`\n${c.green}${c.bold}Rotation complete.${c.reset}  ${oldEndpoint} → ${newEndpoint}:${newPort}\n`);
}

// ---------------------------------------------------------------------------
// nordvpn:creds
//   Print the NordVPN WireGuard credentials (nordlynx_private_key, username,
//   password) from the API. Useful when setting up a new device.
// ---------------------------------------------------------------------------

async function printNordVPNCreds(accessToken) {
  if (!accessToken) {
    throw new Error('NordVPN access token required (NORDVPN_TOKEN env var or --token)');
  }
  const creds = await fetchNordVPNCreds(accessToken);
  console.log(`\n${c.bold}NordVPN WireGuard credentials${c.reset}`);
  console.log(c.gray + '─'.repeat(52) + c.reset);
  console.log(`  ${c.cyan}nordlynx_private_key${c.reset}: ${creds.nordlynxPrivateKey}`);
  console.log(`  ${c.cyan}username${c.reset}:             ${creds.username}`);
  console.log(`  ${c.cyan}password${c.reset}:             ${creds.password}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// nordvpn:servers
//   List recommended NordVPN WireGuard servers for a country.
// ---------------------------------------------------------------------------

async function listNordVPNServers({ countryId = 228, limit = 10 } = {}) {
  const servers = await fetchNordVPNServers({ countryId, limit });
  console.log(`\n${c.bold}NordVPN WireGuard servers (country_id=${countryId})${c.reset}`);
  console.log(c.gray + '─'.repeat(60) + c.reset);
  for (const s of servers) {
    const loadColor = s.load < 40 ? c.green : s.load < 75 ? c.yellow : c.red;
    console.log(`  ${c.cyan}${s.name.padEnd(30)}${c.reset}  ${s.ip.padEnd(17)}  load ${loadColor}${String(s.load).padStart(3)}%${c.reset}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// nordvpn:teardown-wg
//   Remove all NordVPN WireGuard kill-switch rules, gateway, NAT mapping,
//   interface, and (optionally) the WireGuard tunnel + peer.
// ---------------------------------------------------------------------------

async function teardownNordVPNWG({
  tunnelDescr = 'NordVPNWG01',
  ifaceName   = 'NORDVPNWG',
  gatewayName,
  deleteTunnel = false,
}) {
  const client  = getPfSenseClient();
  const gwName  = gatewayName || `${ifaceName}_GW`.toUpperCase();
  const rulePrefix = 'pf-nordvpn-wg-';
  const natDescr   = 'pf-nordvpn-wg-nat';

  console.log(`\n${c.bold}Tearing down ${tunnelDescr} / ${ifaceName}...${c.reset}\n`);

  // Firewall rules
  try {
    const resp  = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const match = (resp.data.data || []).filter(r => r.descr && r.descr.startsWith(rulePrefix));
    for (const r of match) {
      await client.delete('/api/v2/firewall/rule', { data: { id: r.id } });
      console.log(`  ${c.green}✓${c.reset} Removed rule: ${r.descr}`);
    }
    if (match.length > 0) {
      await client.post('/api/v2/firewall/apply');
      console.log(`  ${c.gray}✓ Firewall applied${c.reset}`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove firewall rules: ${e.message}`);
  }

  // Outbound NAT mapping
  try {
    const resp  = await client.get('/api/v2/firewall/nat/outbound/mappings', { params: { limit: 0 } });
    const match = (resp.data.data || []).filter(m => m.descr === natDescr);
    for (const m of match) {
      await client.delete('/api/v2/firewall/nat/outbound/mapping', { data: { id: m.id } });
      console.log(`  ${c.green}✓${c.reset} Removed NAT mapping: ${m.descr}`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove NAT mapping: ${e.message}`);
  }

  // Gateway
  try {
    const resp = await client.get('/api/v2/routing/gateways', { params: { limit: 0 } });
    const gw   = (resp.data.data || []).find(g => g.name === gwName);
    if (gw) {
      await client.delete('/api/v2/routing/gateway', { data: { id: gw.id } });
      console.log(`  ${c.green}✓${c.reset} Removed gateway: ${gwName}`);
      await client.post('/api/v2/routing/apply');
      console.log(`  ${c.gray}✓ Routing applied${c.reset}`);
    } else {
      console.log(`  ${c.blue}ℹ${c.reset} Gateway ${gwName} not found — skipped`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove gateway: ${e.message}`);
  }

  // Interface (disable + unassign)
  try {
    const resp  = await client.get('/api/v2/interfaces', { params: { limit: 0 } });
    const iface = (resp.data.data || []).find(i => i.descr === ifaceName);
    if (iface) {
      await client.patch('/api/v2/interface', { id: iface.id, enable: false });
      console.log(`  ${c.green}✓${c.reset} Disabled interface: ${ifaceName} (${iface.id})`);
      await client.post('/api/v2/interface/apply');
      console.log(`  ${c.gray}✓ Interfaces applied${c.reset}`);
    } else {
      console.log(`  ${c.blue}ℹ${c.reset} Interface ${ifaceName} not found — skipped`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not disable interface: ${e.message}`);
  }

  // WireGuard peer (always remove)
  try {
    const tResp  = await client.get('/api/v2/vpn/wireguard/tunnels', { params: { limit: 0 } });
    const tunnel = (tResp.data.data || []).find(t => t.descr === tunnelDescr);
    if (tunnel) {
      const pResp = await client.get('/api/v2/vpn/wireguard/peers', { params: { limit: 0 } });
      const peers = (pResp.data.data || []).filter(p => p.tun === tunnel.name);
      for (const p of peers) {
        await client.delete('/api/v2/vpn/wireguard/peer', { data: { id: p.id } });
        console.log(`  ${c.green}✓${c.reset} Removed peer: ${p.descr || p.publickey?.substring(0, 16)}`);
      }

      if (deleteTunnel) {
        await client.delete('/api/v2/vpn/wireguard/tunnel', { data: { id: tunnel.id } });
        console.log(`  ${c.green}✓${c.reset} Deleted tunnel: ${tunnelDescr} (${tunnel.name})`);
      }

      if (peers.length > 0 || deleteTunnel) {
        await client.post('/api/v2/vpn/wireguard/apply');
        console.log(`  ${c.gray}✓ WireGuard applied${c.reset}`);
      }
    } else {
      console.log(`  ${c.blue}ℹ${c.reset} Tunnel ${tunnelDescr} not found — skipped`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove WireGuard peer/tunnel: ${e.message}`);
  }

  console.log(`\n${c.green}${c.bold}Done.${c.reset}`);
  if (!deleteTunnel) {
    console.log(`${c.gray}  Tunnel ${tunnelDescr} left in place. Pass --delete-tunnel to remove it.${c.reset}\n`);
  }
}

module.exports = {
  fetchNordVPNCreds,
  fetchNordVPNServers,
  rotateNordVPNWG,
  printNordVPNCreds,
  listNordVPNServers,
  teardownNordVPNWG,
};
