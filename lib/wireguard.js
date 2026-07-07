const { getPfSenseClient } = require('./pfsense');
const fs = require('fs');

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  yellow:  '\x1b[33m',
  gray:    '\x1b[90m',
};

// ---------------------------------------------------------------------------
// WireGuard .conf parser
// ---------------------------------------------------------------------------

function parseWireGuardConf(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  let section = '';
  const iface = {};
  const peer = {};

  for (const line of lines) {
    if (line === '[Interface]') { section = 'interface'; continue; }
    if (line === '[Peer]')      { section = 'peer';      continue; }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = line.substring(0, eqIdx).trim();
    const value = line.substring(eqIdx + 1).trim();

    if (section === 'interface') {
      if (key === 'Address')    iface.address    = value.split(',')[0].trim();
      if (key === 'PrivateKey') iface.privateKey = value;
      if (key === 'DNS')        iface.dns        = value.split(',')[0].trim();
    } else if (section === 'peer') {
      if (key === 'PublicKey') peer.publicKey = value;
      if (key === 'Endpoint') {
        const lastColon = value.lastIndexOf(':');
        peer.endpoint = value.substring(0, lastColon);
        peer.port     = parseInt(value.substring(lastColon + 1), 10);
      }
      if (key === 'AllowedIPs')   peer.allowedIPs   = value.split(',').map(s => s.trim());
      if (key === 'PresharedKey') peer.presharedKey = value;
    }
  }

  // WG_PRIVATE_KEY env var overrides (or substitutes for) the key in the file
  if (process.env.WG_PRIVATE_KEY) {
    iface.privateKey = process.env.WG_PRIVATE_KEY.trim();
  }

  if (!iface.privateKey) throw new Error('WireGuard private key not found. Set WG_PRIVATE_KEY env var or include PrivateKey in the conf file.');
  if (!peer.publicKey)   throw new Error('WireGuard conf missing PublicKey in [Peer]');
  if (!peer.endpoint)    throw new Error('WireGuard conf missing Endpoint in [Peer]');

  return { interface: iface, peer };
}

// ProtonVPN sets DNS = server-side tunnel IP, which is the correct gateway address.
function deriveGatewayIP(wgConfig) {
  if (wgConfig.interface.dns) return wgConfig.interface.dns;
  const parts = wgConfig.interface.address.split('/')[0].split('.');
  parts[3] = String(parseInt(parts[3], 10) - 1);
  return parts.join('.');
}

// ---------------------------------------------------------------------------
// pfSense API apply helpers
// ---------------------------------------------------------------------------

async function applyWireGuard(client) {
  await client.post('/api/v2/vpn/wireguard/apply');
  console.log(`  ${c.gray}✓ WireGuard applied${c.reset}`);
}

async function applyInterfaces(client) {
  await client.post('/api/v2/interface/apply');
  console.log(`  ${c.gray}✓ Interfaces applied${c.reset}`);
}

async function applyFirewall(client) {
  await client.post('/api/v2/firewall/apply');
  console.log(`  ${c.gray}✓ Firewall rules applied${c.reset}`);
}

async function applyRouting(client) {
  await client.post('/api/v2/routing/apply');
  console.log(`  ${c.gray}✓ Routing applied${c.reset}`);
}

// ---------------------------------------------------------------------------
// wg:status
// ---------------------------------------------------------------------------

async function listTunnels() {
  const client = getPfSenseClient();

  try {
    const response = await client.get('/api/v2/vpn/wireguard/tunnels', { params: { limit: 0 } });
    const tunnels = response.data.data || [];

    if (tunnels.length === 0) {
      console.log('No WireGuard tunnels configured.');
      return;
    }

    console.log(`\n${c.bold}WireGuard Tunnels:${c.reset}`);
    console.log(c.gray + '═'.repeat(80) + c.reset);

    for (const t of tunnels) {
      const status = t.enabled ? `${c.green}enabled${c.reset}` : `${c.red}disabled${c.reset}`;
      console.log(`\n  ${c.bold}${c.cyan}${t.name || t.tunnelif}${c.reset}  ${c.gray}(${t.descr || 'no description'})${c.reset}  ${status}`);
      console.log(`  ${c.gray}Listen port:${c.reset}  ${t.listenport || 'auto'}`);
      if (t.addresses && t.addresses.length > 0) {
        t.addresses.forEach(a => console.log(`  ${c.gray}Address:${c.reset}      ${a.address}/${a.mask}`));
      }
    }

    const peersResp = await client.get('/api/v2/vpn/wireguard/peers', { params: { limit: 0 } });
    const peers = peersResp.data.data || [];

    if (peers.length > 0) {
      console.log(`\n${c.bold}WireGuard Peers:${c.reset}`);
      for (const p of peers) {
        const status = p.enabled ? `${c.green}enabled${c.reset}` : `${c.red}disabled${c.reset}`;
        console.log(`\n  ${c.bold}${c.cyan}${p.descr || p.publickey?.substring(0, 16) + '...'}${c.reset}  ${status}`);
        console.log(`  ${c.gray}Tunnel:${c.reset}    ${p.tun || 'unknown'}`);
        console.log(`  ${c.gray}Endpoint:${c.reset}  ${p.endpoint}:${p.port}`);
        if (p.persistentkeepalive) {
          console.log(`  ${c.gray}Keepalive:${c.reset} ${p.persistentkeepalive}s`);
        }
      }
    }

    console.log('\n' + c.gray + '═'.repeat(80) + c.reset + '\n');
  } catch (error) {
    throw new Error(`Failed to list tunnels: ${error.response?.data?.message || error.message}`);
  }
}

// ---------------------------------------------------------------------------
// wg:provision  (full zero-touch ProtonVPN setup from a .conf file)
// ---------------------------------------------------------------------------

async function applyProtonVPN({
  confFile,
  tunnelDescr  = 'ProtonVPN01',
  ifaceName    = 'PROTONVPN',
  gatewayName,
  gwGroupName  = 'ProtonVPN_GWGrp',
  listenPort   = 51821,
  mtu          = 1420,
  monitorIP    = '1.1.1.1',
  lanSubnet    = '192.168.7.0/24',
  killSwitchHosts = [],
  lanIface     = 'lan',
  dryRun       = false,
}) {
  const wgConfig  = parseWireGuardConf(confFile);
  const tunnelIP  = wgConfig.interface.address.split('/')[0];
  const gatewayIP = deriveGatewayIP(wgConfig);
  const gwName    = gatewayName || `${ifaceName}_GW`.toUpperCase();

  console.log(`\n${c.bold}ProtonVPN WireGuard provisioning${c.reset}`);
  console.log(c.gray + '─'.repeat(64) + c.reset);
  console.log(`  Tunnel        : ${c.cyan}${tunnelDescr}${c.reset}  (listen port ${listenPort}, MTU ${mtu})`);
  console.log(`  Tunnel IP     : ${c.cyan}${tunnelIP}/32${c.reset}`);
  console.log(`  Gateway IP    : ${c.cyan}${gatewayIP}${c.reset}  (monitor ${monitorIP})`);
  console.log(`  Endpoint      : ${c.cyan}${wgConfig.peer.endpoint}:${wgConfig.peer.port}${c.reset}`);
  console.log(`  Interface     : ${c.cyan}${ifaceName}${c.reset}`);
  console.log(`  Gateway       : ${c.cyan}${gwName}${c.reset}  (group: ${c.cyan}${gwGroupName}${c.reset})`);
  console.log(`  LAN subnet    : ${c.cyan}${lanSubnet}${c.reset}  (outbound NAT)`);
  if (killSwitchHosts.length > 0) {
    console.log(`  Kill-switch   : ${c.cyan}${killSwitchHosts.join(', ')}${c.reset}`);
  }
  if (dryRun) {
    console.log(`\n  ${c.yellow}Dry-run -- no changes will be made.${c.reset}\n`);
    return;
  }
  console.log('');

  const client = getPfSenseClient();
  let tunnelIfName; // actual tun_wg* name assigned by pfSense

  // ── Step 1: WireGuard tunnel ──────────────────────────────────────────────
  console.log(`${c.blue}[1/8]${c.reset} WireGuard tunnel`);
  {
    const resp = await client.get('/api/v2/vpn/wireguard/tunnels', { params: { limit: 0 } });
    const tunnels = resp.data.data || [];
    const existing = tunnels.find(t => t.descr === tunnelDescr);

    if (existing) {
      tunnelIfName = existing.name;
      await client.patch('/api/v2/vpn/wireguard/tunnel', {
        id:         existing.id,
        privatekey: wgConfig.interface.privateKey,
        listenport: String(listenPort),
        mtu,
        enabled:    true,
      });
      console.log(`  ${c.green}✓${c.reset} Updated ${c.cyan}${tunnelIfName}${c.reset} (${tunnelDescr})`);
    } else {
      const cr = await client.post('/api/v2/vpn/wireguard/tunnel', {
        descr:      tunnelDescr,
        privatekey: wgConfig.interface.privateKey,
        listenport: String(listenPort),
        mtu,
        enabled:    true,
      });
      tunnelIfName = cr.data.data?.name || cr.data.data?.tunnelif;
      console.log(`  ${c.green}✓${c.reset} Created ${c.cyan}${tunnelIfName}${c.reset} (${tunnelDescr})`);
    }
  }

  // ── Step 2: WireGuard peer ───────────────────────────────────────────────
  console.log(`${c.blue}[2/8]${c.reset} WireGuard peer`);
  {
    const resp = await client.get('/api/v2/vpn/wireguard/peers', { params: { limit: 0 } });
    const peers = resp.data.data || [];
    const existing = peers.find(p => p.tun === tunnelIfName);

    const allowedips = (wgConfig.peer.allowedIPs || ['0.0.0.0/0']).map(cidr => {
      const [address, mask] = cidr.split('/');
      return { address, mask: parseInt(mask ?? '0', 10) };
    });

    const payload = {
      tun:                 tunnelIfName,
      descr:               `${tunnelDescr}-Server`,
      publickey:           wgConfig.peer.publicKey,
      endpoint:            wgConfig.peer.endpoint,
      port:                String(wgConfig.peer.port),
      allowedips,
      persistentkeepalive: 25,
      enabled:             true,
    };
    if (wgConfig.peer.presharedKey) payload.presharedkey = wgConfig.peer.presharedKey;

    if (existing) {
      await client.patch('/api/v2/vpn/wireguard/peer', { id: existing.id, ...payload });
      console.log(`  ${c.green}✓${c.reset} Updated peer → ${wgConfig.peer.endpoint}:${wgConfig.peer.port}`);
    } else {
      await client.post('/api/v2/vpn/wireguard/peer', payload);
      console.log(`  ${c.green}✓${c.reset} Created peer → ${wgConfig.peer.endpoint}:${wgConfig.peer.port}`);
    }
  }
  await applyWireGuard(client);

  // ── Step 3: Interface assignment ─────────────────────────────────────────
  console.log(`${c.blue}[3/8]${c.reset} Interface assignment (${ifaceName})`);
  let internalIfaceId;
  {
    const resp = await client.get('/api/v2/interfaces', { params: { limit: 0 } });
    const ifaces = resp.data.data || [];
    const existing = ifaces.find(i => i.if === tunnelIfName);

    if (existing) {
      internalIfaceId = existing.id;
      await client.patch('/api/v2/interface', {
        id:     existing.id,
        descr:  ifaceName,
        enable: true,
        typev4: 'static',
        ipaddr: tunnelIP,
        subnet: 32,
      });
      console.log(`  ${c.green}✓${c.reset} Updated → ${c.cyan}${internalIfaceId}${c.reset} / ${tunnelIP}/32`);
    } else {
      const cr = await client.post('/api/v2/interface', {
        if:     tunnelIfName,
        descr:  ifaceName,
        enable: true,
        typev4: 'static',
        ipaddr: tunnelIP,
        subnet: 32,
      });
      internalIfaceId = cr.data.data?.id;
      console.log(`  ${c.green}✓${c.reset} Assigned → ${c.cyan}${internalIfaceId}${c.reset} / ${tunnelIP}/32`);
    }
  }
  await applyInterfaces(client);

  // ── Step 4: Gateway ───────────────────────────────────────────────────────
  console.log(`${c.blue}[4/8]${c.reset} Gateway ${gwName} (monitor ${monitorIP})`);
  {
    const resp = await client.get('/api/v2/routing/gateways', { params: { limit: 0 } });
    const gws = resp.data.data || [];
    const existing = gws.find(g => g.name === gwName);

    const payload = {
      name:       gwName,
      descr:      `${tunnelDescr} WireGuard gateway`,
      interface:  internalIfaceId,
      ipprotocol: 'inet',
      gateway:    gatewayIP,
      monitor:    monitorIP,
      weight:     1,
      disabled:   false,
    };

    if (existing) {
      await client.patch('/api/v2/routing/gateway', { id: existing.id, ...payload });
      console.log(`  ${c.green}✓${c.reset} Updated gateway ${gwName} → ${gatewayIP}`);
    } else {
      await client.post('/api/v2/routing/gateway', payload);
      console.log(`  ${c.green}✓${c.reset} Created gateway ${gwName} → ${gatewayIP}`);
    }
  }
  await applyRouting(client);
  // Wait for pfSense to commit the new gateway to its routing database before
  // step 7 tries to reference it in a firewall rule (brief internal sync delay).
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await client.get('/api/v2/routing/gateways', { params: { limit: 0 } });
    if ((check.data.data || []).find(g => g.name === gwName)) break;
  }

  // ── Step 5: Outbound NAT ──────────────────────────────────────────────────
  console.log(`${c.blue}[5/8]${c.reset} Outbound NAT (${lanSubnet} → ${internalIfaceId}:ip)`);
  {
    const resp = await client.get('/api/v2/firewall/nat/outbound/mappings', { params: { limit: 0 } });
    const mappings = resp.data.data || [];
    const natDescr = `pf-protonvpn-nat-${ifaceName.toLowerCase()}`;
    const existing = mappings.find(m => m.descr === natDescr || (m.interface === internalIfaceId && m.source === lanSubnet));

    const payload = {
      interface:   internalIfaceId,
      source:      lanSubnet,
      destination: 'any',
      target:      `${internalIfaceId}:ip`,
      disabled:    false,
      descr:       natDescr,
    };

    if (existing) {
      await client.patch('/api/v2/firewall/nat/outbound/mapping', { id: existing.id, ...payload });
      console.log(`  ${c.green}✓${c.reset} Updated NAT mapping`);
    } else {
      await client.post('/api/v2/firewall/nat/outbound/mapping', payload);
      console.log(`  ${c.green}✓${c.reset} Created NAT mapping`);
    }
  }

  // ── Step 6: WAN rule – ensure listen port is allowed inbound ─────────────
  console.log(`${c.blue}[6/8]${c.reset} WAN inbound rule (UDP ${listenPort})`);
  {
    const resp = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const rules = resp.data.data || [];
    const wanRules = rules.filter(r => {
      const ifaces = Array.isArray(r.interface) ? r.interface : [r.interface];
      return ifaces.includes('wan') && !r.floating && r.type !== 'block';
    });

    // Check if any WAN pass rule already covers the listen port
    const covered = wanRules.some(r => {
      if (r.destination !== 'wan:ip' && r.destination !== 'wan:address') return false;
      const dp = r.destination_port;
      if (!dp) return false;
      if (dp === String(listenPort)) return true;
      if (dp.includes(':')) {
        const [lo, hi] = dp.split(':').map(Number);
        return listenPort >= lo && listenPort <= hi;
      }
      return false;
    });

    if (covered) {
      console.log(`  ${c.blue}ℹ${c.reset} Existing WAN rule already covers port ${listenPort}`);
    } else {
      const wanDescr = `pf-protonvpn-wan-udp-${listenPort}`;
      const existing = rules.find(r => r.descr === wanDescr);
      const payload = {
        type:             'pass',
        interface:        ['wan'],
        ipprotocol:       'inet',
        protocol:         'udp',
        source:           'any',
        destination:      'wan:ip',
        destination_port: String(listenPort),
        floating:         false,
        descr:            wanDescr,
      };

      if (existing) {
        await client.patch('/api/v2/firewall/rule', { id: existing.id, ...payload });
        console.log(`  ${c.green}✓${c.reset} Updated WAN rule for port ${listenPort}`);
      } else {
        await client.post('/api/v2/firewall/rule', payload);
        console.log(`  ${c.green}✓${c.reset} Created WAN rule for port ${listenPort}`);
      }
    }
  }

  // ── Step 7: Kill-switch LAN routing rules ─────────────────────────────────
  if (killSwitchHosts.length === 0) {
    console.log(`${c.blue}[7/8]${c.reset} ${c.gray}No kill-switch hosts specified -- skipping LAN routing rules${c.reset}`);
  } else {
    console.log(`${c.blue}[7/8]${c.reset} Kill-switch LAN routing rules`);
    const rulesResp = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const existingRules = rulesResp.data.data || [];

    for (const hostCidr of killSwitchHosts) {
      // Normalise: strip /32 for single-host source in pfSense rule format
      const [hostIP, maskBits] = hostCidr.split('/');
      const srcField = (!maskBits || maskBits === '32') ? hostIP : hostCidr;
      const ruleDescr = `pf-protonvpn-ks-${hostIP.replace(/\./g, '-')}`;
      const existing = existingRules.find(r => r.descr === ruleDescr);

      const payload = {
        type:       'pass',
        interface:  [lanIface],
        ipprotocol: 'inet',
        protocol:   null,
        source:     srcField,
        destination: 'any',
        gateway:    gwName,     // updated manually to gwGroupName once gateway group exists
        tag:        'vpntraffic',
        floating:   false,
        disabled:   false,
        descr:      ruleDescr,
      };

      if (existing) {
        await client.patch('/api/v2/firewall/rule', { id: existing.id, ...payload });
        console.log(`  ${c.green}✓${c.reset} Updated LAN routing rule for ${hostIP} → ${gwName}`);
      } else {
        await client.post('/api/v2/firewall/rule', payload);
        console.log(`  ${c.green}✓${c.reset} Created LAN routing rule for ${hostIP} → ${gwName}`);
        console.log(`  ${c.yellow}!${c.reset} Drag rule above VPNBalanced_GWGrp rule in Firewall > Rules > LAN`);
      }

      // Fallback block: pfSense skips rules whose gateway is offline without applying them,
      // so traffic is never tagged and the floating WAN block never fires. This block rule
      // immediately after the pass rule catches pi-vpn traffic when the VPN is down.
      const blockDescr = `pf-protonvpn-ks-fallback-${hostIP.replace(/\./g, '-')}`;
      const existingBlock = existingRules.find(r => r.descr === blockDescr);
      const blockPayload = {
        type:        'block',
        interface:   [lanIface],
        ipprotocol:  'inet',
        protocol:    null,
        source:      srcField,
        destination: 'any',
        floating:    false,
        disabled:    false,
        descr:       blockDescr,
      };
      if (existingBlock) {
        await client.patch('/api/v2/firewall/rule', { id: existingBlock.id, ...blockPayload });
        console.log(`  ${c.green}✓${c.reset} Updated fallback block rule for ${hostIP}`);
      } else {
        await client.post('/api/v2/firewall/rule', blockPayload);
        console.log(`  ${c.green}✓${c.reset} Created fallback block rule for ${hostIP}`);
        console.log(`  ${c.yellow}!${c.reset} Drag fallback block rule immediately after the pass rule above`);
      }
    }
  }

  // ── Step 8: Apply firewall + routing ─────────────────────────────────────
  console.log(`${c.blue}[8/8]${c.reset} Applying changes`);
  await applyFirewall(client);
  await applyRouting(client);

  // ── Done ──────────────────────────────────────────────────────────────────
  const sep = c.gray + '─'.repeat(64) + c.reset;
  console.log(`\n${c.green}${c.bold}Provisioning complete.${c.reset}\n`);

  console.log(`${c.bold}${c.yellow}Manual steps required (API does not support these):${c.reset}`);
  console.log(sep);

  console.log(`\n${c.bold}1. Gateway group${c.reset}  (System > Routing > Gateway Groups > Add)`);
  console.log(`   Name        : ${c.cyan}${gwGroupName}${c.reset}`);
  console.log(`   Trigger     : Packet Loss or High Latency`);
  console.log(`   Member      : ${c.cyan}${gwName}${c.reset}  Tier 1`);
  console.log(`   (When you provision a second tunnel, add its gateway as Tier 1 here too)`);

  console.log(`\n${c.bold}2. Update LAN routing rules${c.reset} to use the group instead of the single gateway:`);
  killSwitchHosts.forEach(h => {
    const hostIP = h.split('/')[0];
    console.log(`   rule "pf-protonvpn-ks-${hostIP.replace(/\./g, '-')}"  gateway: ${c.cyan}${gwGroupName}${c.reset}`);
  });

  console.log(`\n${c.bold}3. earlyshellcmd${c.reset}  (Services > Shellcmd > Add)`);
  console.log(`   Type    : earlyshellcmd`);
  console.log(`   Command : ${c.cyan}route add -host ${monitorIP} ${gatewayIP}${c.reset}`);
  console.log(`   (Ensures dpinger can reach the monitor IP after reboot before WireGuard comes up)`);

  const wgIface = tunnelIfName;
  const peerPK  = wgConfig.peer.publicKey;
  const peerEP  = `${wgConfig.peer.endpoint}:${wgConfig.peer.port}`;

  console.log(`\n${c.bold}4. Watchdog${c.reset}  (SSH to pfSense, run as root)`);
  console.log(`   Prevents the WireGuard 120s REKEY_AFTER_TIME deadlock by proactively`);
  console.log(`   resetting the peer every 85s. Uses 5-minute backoff if GW goes down.`);
  console.log(`\n   ${c.cyan}# Save peer info for recovery after peer removal`);
  console.log(`   cat > /var/db/protonvpn-wg-peer.conf << 'PEER_EOF'`);
  console.log(`   PEER_PK=${peerPK}`);
  console.log(`   ENDPOINT=${peerEP}`);
  console.log(`   ALLOWED_IPS=0.0.0.0/0,::/0`);
  console.log(`   PEER_EOF`);
  console.log(`   chmod 600 /var/db/protonvpn-wg-peer.conf`);
  console.log(``);
  console.log(`   # Seed reset timestamp so watchdog doesn't fire immediately`);
  console.log(`   date +%s > /var/db/protonvpn-wg-last-reset`);
  console.log(`   rm -f /var/db/protonvpn-wg-down-since${c.reset}`);
  console.log(``);
  console.log(`   Copy /usr/local/bin/protonvpn-wg-watchdog.sh from the repo.`);
  console.log(`   Then:`);
  console.log(`   ${c.cyan}chmod +x /usr/local/bin/protonvpn-wg-watchdog.sh`);
  console.log(`   echo '*/1 * * * * root /usr/local/bin/protonvpn-wg-watchdog.sh' \\`);
  console.log(`     > /etc/cron.d/protonvpn-wg-watchdog${c.reset}`);
  console.log(`   (Update WG_IFACE=${wgIface} in watchdog script if different from default)`);

  console.log(`\n${sep}\n`);
  console.log(`${c.gray}Verify: wg show on pfSense should show latest-handshake within 25s`);
  console.log(`        curl ifconfig.io from a kill-switch host should show ProtonVPN IP${c.reset}\n`);
}

// ---------------------------------------------------------------------------
// wg:teardown
// ---------------------------------------------------------------------------

async function teardownProtonVPN({ tunnelDescr, ifaceName, gatewayName }) {
  const client = getPfSenseClient();
  const gwName = gatewayName || `${ifaceName}_GW`.toUpperCase();

  console.log(`\n${c.bold}Tearing down ${tunnelDescr} / ${ifaceName}...${c.reset}\n`);

  // Remove firewall rules tagged pf-protonvpn-*
  try {
    const rulesResp = await client.get('/api/v2/firewall/rules', { params: { limit: 0 } });
    const rules = rulesResp.data.data || [];
    const pvpnRules = rules.filter(r => r.descr && r.descr.startsWith('pf-protonvpn-'));

    for (const rule of pvpnRules) {
      await client.delete('/api/v2/firewall/rule', { data: { id: rule.id } });
      console.log(`  ${c.green}✓${c.reset} Removed rule: ${rule.descr}`);
    }
    if (pvpnRules.length > 0) await applyFirewall(client);
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove firewall rules: ${e.message}`);
  }

  // Remove outbound NAT mappings tagged pf-protonvpn-nat-*
  try {
    const natResp = await client.get('/api/v2/firewall/nat/outbound/mappings', { params: { limit: 0 } });
    const mappings = natResp.data.data || [];
    const pvpnNat = mappings.filter(m => m.descr && m.descr.startsWith('pf-protonvpn-nat-'));
    for (const m of pvpnNat) {
      await client.delete('/api/v2/firewall/nat/outbound/mapping', { data: { id: m.id } });
      console.log(`  ${c.green}✓${c.reset} Removed NAT mapping: ${m.descr}`);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove NAT mappings: ${e.message}`);
  }

  // Remove gateway
  try {
    const gwResp = await client.get('/api/v2/routing/gateways', { params: { limit: 0 } });
    const gws = gwResp.data.data || [];
    const gw = gws.find(g => g.name === gwName);
    if (gw) {
      await client.delete('/api/v2/routing/gateway', { data: { id: gw.id } });
      console.log(`  ${c.green}✓${c.reset} Removed gateway: ${gwName}`);
      await applyRouting(client);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove gateway: ${e.message}`);
  }

  // Disable/unassign interface
  try {
    const ifacesResp = await client.get('/api/v2/interfaces', { params: { limit: 0 } });
    const ifaces = ifacesResp.data.data || [];
    const iface = ifaces.find(i => i.descr === ifaceName);
    if (iface) {
      await client.patch('/api/v2/interface', { id: iface.id, enable: false });
      console.log(`  ${c.green}✓${c.reset} Disabled interface: ${ifaceName} (${iface.id})`);
      await applyInterfaces(client);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not disable interface: ${e.message}`);
  }

  // Remove WireGuard peers for the tunnel
  try {
    const tunnelsResp = await client.get('/api/v2/vpn/wireguard/tunnels', { params: { limit: 0 } });
    const tunnels = tunnelsResp.data.data || [];
    const tunnel = tunnels.find(t => t.descr === tunnelDescr);

    if (tunnel) {
      const peersResp = await client.get('/api/v2/vpn/wireguard/peers', { params: { limit: 0 } });
      const peers = peersResp.data.data || [];
      const mine = peers.filter(p => p.tun === tunnel.name);

      for (const peer of mine) {
        await client.delete('/api/v2/vpn/wireguard/peer', { data: { id: peer.id } });
        console.log(`  ${c.green}✓${c.reset} Removed peer: ${peer.descr || peer.publickey?.substring(0, 16)}`);
      }
      if (mine.length > 0) await applyWireGuard(client);
    }
  } catch (e) {
    console.warn(`  ${c.yellow}warn${c.reset} Could not remove peers: ${e.message}`);
  }

  console.log(`\n${c.green}${c.bold}Done.${c.reset}\n`);
}

module.exports = {
  parseWireGuardConf,
  listTunnels,
  applyProtonVPN,
  teardownProtonVPN,
};
