const { getPfSenseClient } = require('./pfsense');

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
// Run a shell command via the pfSense diagnostics API
// ---------------------------------------------------------------------------

async function runCommand(client, command) {
  const resp = await client.post('/api/v2/diagnostics/command_prompt', { command });
  return (resp.data.data?.output || '').trim();
}

// Known SFP+ driver prefixes on FreeBSD
const SFP_DRIVERS = ['ix', 'ixl', 'cxgbe', 'sfxge', 'oce', 'bxe'];

// ---------------------------------------------------------------------------
// Detect likely SFP+ interfaces from interface status list
// ---------------------------------------------------------------------------

async function detectSfpInterfaces(client) {
  const resp   = await client.get('/api/v2/status/interfaces', { params: { limit: 0 } });
  const ifaces = resp.data.data || [];
  return ifaces
    .filter(i => {
      const hw = (i.hwif || i.name || '').toLowerCase();
      // Match by known SFP+ driver prefix or by media string
      return SFP_DRIVERS.some(d => hw.startsWith(d)) ||
             /10G|SFP|fiber|optic/i.test(i.media || '');
    })
    .map(i => i.hwif || i.name);
}

// ---------------------------------------------------------------------------
// Parse DDM fields out of ifconfig -v output
// Handles ix/ixl format:
//   plugged: SFP/SFP+/SFP28 10G Base-SR (LC)
//   vendor: FS PN: SFP-10GSR-85 SN: C2304174892 DATE: 2023-04-15
//   module temperature: 55.26 C voltage: 3.28 Volts
//   lane 1: RX power: 0.00 mW (-40.00 dBm) TX bias: 6.69 mA
//   lane 1: TX power: 0.00 mW (-40.00 dBm)
// ---------------------------------------------------------------------------

function parseDDM(raw) {
  const fields = {};

  // plugged line: "plugged: SFP/SFP+/SFP28 10G Base-SR (LC)"
  const plugged = raw.match(/plugged:\s*(.+)/i);
  if (plugged) fields.plugged = plugged[1].trim();

  // vendor line: "vendor: FS PN: SFP-10GSR-85 SN: C2304174892 DATE: 2023-04-15"
  const vendor = raw.match(/vendor:\s*(.+)/i);
  if (vendor) fields.vendor = vendor[1].trim();

  // module temperature + voltage on same line
  const modLine = raw.match(/module\s+temperature:\s*([\d.]+\s*C).*?voltage:\s*([\d.]+\s*Volts?)/i);
  if (modLine) {
    fields.temperature = modLine[1].trim();
    fields.voltage     = modLine[2].trim();
  } else {
    // Fallback: separate lines
    const temp = raw.match(/temp(?:erature)?\s*[=:]\s*([-\d.]+\s*[CF°]*)/i);
    const volt = raw.match(/volt(?:age)?\s*[=:]\s*([\d.]+\s*V(?:olts?)?)/i);
    if (temp) fields.temperature = temp[1].trim();
    if (volt) fields.voltage     = volt[1].trim();
  }

  // Lane lines: "lane N: RX power: X.XX mW (Y.YY dBm) TX bias: Z.ZZ mA"
  //             "lane N: TX power: X.XX mW (Y.YY dBm)"
  // Accumulate across all lanes (typically just lane 1 for SFP+)
  const rxPowers = [], txPowers = [], biases = [];
  for (const line of raw.split('\n')) {
    const rxM = line.match(/RX power:\s*[\d.]+\s*mW\s*\(([-\d.]+)\s*dBm\)/i);
    if (rxM) rxPowers.push(parseFloat(rxM[1]));

    const txM = line.match(/TX power:\s*[\d.]+\s*mW\s*\(([-\d.]+)\s*dBm\)/i);
    if (txM) txPowers.push(parseFloat(txM[1]));

    const biasM = line.match(/TX bias:\s*([\d.]+\s*mA)/i);
    if (biasM) biases.push(biasM[1]);
  }

  if (rxPowers.length) fields.rx_dbm = Math.min(...rxPowers); // worst lane
  if (txPowers.length) fields.tx_dbm = Math.min(...txPowers);
  if (biases.length)   fields.bias   = biases.join(', ');

  // Generic fallbacks for other drivers
  if (!fields.rx_dbm) {
    const rx = raw.match(/rx\s+power\s*[=:]\s*([-\d.]+)\s*dBm/i);
    if (rx) fields.rx_dbm = parseFloat(rx[1]);
  }
  if (!fields.tx_dbm) {
    const tx = raw.match(/tx\s+power\s*[=:]\s*([-\d.]+)\s*dBm/i);
    if (tx) fields.tx_dbm = parseFloat(tx[1]);
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Color-code dBm power values
// ---------------------------------------------------------------------------

function colorDbm(dbm) {
  const s = `${dbm.toFixed(2)} dBm`;
  if (dbm <= -40)  return c.red    + s + ` ${c.gray}(no signal)` + c.reset;
  if (dbm < -25)   return c.red    + s + c.reset;
  if (dbm < -10)   return c.yellow + s + c.reset;
  return c.green + s + c.reset;
}

// ---------------------------------------------------------------------------
// Show optics for one interface
// ---------------------------------------------------------------------------

async function showIfaceOptics(client, iface) {
  const raw = await runCommand(client, `ifconfig -v ${iface}`);

  if (!raw) {
    console.log(`  ${c.gray}(no output for ${iface})${c.reset}`);
    return;
  }

  const mediaLine  = raw.match(/media:\s*(.+)/i);
  const statusLine = raw.match(/status:\s*(.+)/i);
  const descLine   = raw.match(/description:\s*(.+)/i);

  const ddm    = parseDDM(raw);
  const hasDDM = ddm.plugged || ddm.vendor || ddm.rx_dbm != null || ddm.temperature;

  const st      = statusLine ? statusLine[1].trim() : '?';
  const stColor = st === 'active' ? c.green : c.red;

  console.log(`\n  ${c.bold}${c.cyan}${iface}${c.reset}${descLine ? `  ${c.gray}(${descLine[1].trim()})${c.reset}` : ''}`);
  if (mediaLine)  console.log(`    media  : ${c.gray}${mediaLine[1].trim()}${c.reset}`);
  console.log(`    status : ${stColor}${st}${c.reset}`);

  if (hasDDM) {
    if (ddm.plugged)      console.log(`    module : ${c.gray}${ddm.plugged}${c.reset}`);
    if (ddm.vendor)       console.log(`    vendor : ${c.gray}${ddm.vendor}${c.reset}`);
    if (ddm.tx_dbm != null) console.log(`    TX pwr : ${colorDbm(ddm.tx_dbm)}`);
    if (ddm.rx_dbm != null) console.log(`    RX pwr : ${colorDbm(ddm.rx_dbm)}`);
    if (ddm.temperature)  console.log(`    temp   : ${c.gray}${ddm.temperature}${c.reset}`);
    if (ddm.voltage)      console.log(`    voltage: ${c.gray}${ddm.voltage}${c.reset}`);
    if (ddm.bias)         console.log(`    bias   : ${c.gray}${ddm.bias}${c.reset}`);
  } else {
    // Fallback: print any optics-related raw lines
    const relevant = raw.split('\n')
      .filter(l => /optic|sfp|ddm|power|temp|volt|bias|vendor|plug|transceiv/i.test(l))
      .map(l => `    ${c.gray}${l.trim()}${c.reset}`);
    if (relevant.length) {
      console.log(`    ${c.yellow}(raw DDM output)${c.reset}`);
      relevant.forEach(l => console.log(l));
    } else {
      console.log(`    ${c.gray}(no DDM data — interface may not be SFP+ or module not inserted)${c.reset}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function showOptics({ iface } = {}) {
  const client = getPfSenseClient();

  let ifaces = iface ? [iface] : [];

  if (ifaces.length === 0) {
    ifaces = await detectSfpInterfaces(client);
    if (ifaces.length === 0) {
      console.log(`${c.yellow}No SFP+ interfaces auto-detected.${c.reset} Specify one with --interface (e.g. igb0, ix0, ixl0).`);
      return;
    }
    console.log(`${c.gray}Auto-detected SFP+ interfaces: ${ifaces.join(', ')}${c.reset}`);
  }

  console.log(`\n${c.bold}SFP+ Optics:${c.reset}`);
  console.log(c.gray + '─'.repeat(60) + c.reset);

  for (const i of ifaces) {
    await showIfaceOptics(client, i);
  }
  console.log('');
}

module.exports = { showOptics };
