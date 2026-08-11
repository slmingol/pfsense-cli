const { getPfSenseClient } = require('./pfsense');
const fs = require('fs');
const path = require('path');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
};

async function runCmd(client, command) {
  const resp = await client.post('/api/v2/diagnostics/command_prompt', { command });
  return (resp.data.data?.output || '').trim();
}

// Write arbitrary text content to a remote file via chunked printf calls.
// Stays well under the 1024-char command_prompt limit per call.
async function writeFileToUsb(client, content, dest) {
  const MAX_CMD = 900;
  await runCmd(client, `rm -f '${dest}'`);

  const lines = content.split('\n');
  let batch = [], batchLen = 0;

  const flush = async () => {
    if (!batch.length) return;
    await runCmd(client, batch.join('; '));
    batch = []; batchLen = 0;
  };

  for (const line of lines) {
    const esc  = line.replace(/'/g, "'\\''");
    const part = `printf '%s\\n' '${esc}' >> '${dest}'`;
    if (batchLen > 0 && batchLen + 2 + part.length > MAX_CMD) await flush();
    batch.push(part);
    batchLen += (batchLen > 0 ? 2 : 0) + part.length;
  }
  await flush();
}

// Build the RECOVERY.md content (templated with live install params)
function buildRecoveryReadme({ dev, keep, cronSched }) {
  return `# pfsense-rtr1 — USB Recovery Guide

This drive contains automated pfSense config backups and recovery tools.

## Backup architecture

Three mechanisms run on pfSense. All are in config.xml <cron> and
return automatically after a config restore.

Config backups:

  What               How              Where                          Freq        Retention
  Full /cf/conf/     rsync (cron)     This USB: conf/                30 min      1 copy, overwrites
  Full /cf/conf/     rsync (cron)     NAS: ghost-files/pfsense/      30 min      1 copy, overwrites
  config.xml only    backup.sh        This USB: pfsense-backups/     ${cronSched}    ${keep} timestamped copies

What survives a reinstall:

  Thing                               Survives?   How restored
  Config (HAProxy/WG/DNS/FW/cron)     YES         Restore conf/config.xml (step 1 below)
  RESTAPI package                     NO          install-api.sh on this USB
  rsync binary                        NO          pkg install -y rsync
  All other packages                  NO          System > Package Manager
  Outbound SSH key to NAS             NO          earlyshellcmd reads /cf/conf/ssh_outbound_id_ed25519
  Timestamped backup cron             NO          make backup-usb-install (pfsense-cli repo)

## What is on this drive

  RECOVERY.md          This file
  backup.sh            Timestamped config.xml backup script
  install-api.sh       pfSense RESTAPI package installer (checks pkgs/ first)
  conf/                Full /cf/conf/ rsync mirror (updated every 30 min)
  pfsense-backups/     Timestamped config.xml snapshots (${keep} retained)
  pkgs/                Offline package cache (RESTAPI pkg + rsync + deps)
  unifi/               UniFi backups (written by UniFi host, not pfSense)

Refresh offline package cache (run while internet is up):
  make backup-usb-cache-pkgs   (from pfsense-cli on management host)

## How backups work

Three mechanisms run on pfSense. All are stored in config.xml <cron>
so they survive config restores automatically.

1. Full conf rsync to USB (every 30 min at :01 and :31)
   rsync --delete -avz /cf/conf /mnt/usb_backup/.
   -> This drive: conf/
   Includes config.xml, ACME certs, pkg logs. Overwrites in place.

2. Full conf rsync to NAS (every 30 min at :01 and :31)
   rsync --delete -avz /cf/conf slm@ghost-files:/volume2/data/backups/pfsense/.
   Offsite copy. Requires SSH key auth from pfSense to ghost-files.

3. Timestamped config.xml rotation (${cronSched})
   USB_DEV=${dev} KEEP_LAST=${keep} sh /mnt/usb_backup/backup.sh
   -> This drive: pfsense-backups/config-<timestamp>.xml
   Managed via /etc/cron.d/pfsense-usb-backup (re-deploy after reinstall).

NOTE: UniFi backup jobs also in crontab but UniFi no longer runs on
pfSense. Those cron entries are stale and log errors nightly. Remove
them via System > Cron after reinstall.

## After a fresh pfSense reinstall

### Fastest path: restore config.xml first

Restoring config.xml brings back ALL cron jobs (mechanisms 1 and 2
above), WireGuard, HAProxy, DNS, firewall rules, and all package
settings. Do this before anything else.

Step 1 — SSH to pfSense, mount this USB, restore config:

  mount_msdosfs /dev/${dev} /mnt/usb_backup
  # Use the full conf rsync copy (most recent):
  cp /mnt/usb_backup/conf/config.xml /cf/conf/config.xml
  /etc/rc.reload_all
  # OR use a timestamped snapshot for a specific point in time:
  ls -lt /mnt/usb_backup/pfsense-backups/*.xml | head -5
  cp /mnt/usb_backup/pfsense-backups/config-<ts>.xml /cf/conf/config.xml
  /etc/rc.reload_all

  Alternatively use the GUI: Diagnostics > Backup & Restore > Restore Backup

Step 2 — Reinstall 3rd-party packages (not included in config restore)

  The following packages must be reinstalled manually after every fresh
  install. The config restore re-applies their settings automatically
  once the package binaries are present.

  Via System > Package Manager > Available Packages:
    pfSense-pkg-haproxy
    pfSense-pkg-acme
    pfSense-pkg-WireGuard
    pfSense-pkg-Shellcmd
    pfSense-pkg-Telegraf
    pfSense-pkg-apcupsd
    pfSense-pkg-nut
    pfSense-pkg-sudo
    pfSense-pkg-System_Patches
    pfSense-pkg-ntopng
    pfSense-pkg-suricata
    pfSense-pkg-LCDproc
    pfSense-pkg-Service_Watchdog
    openvpn-client-export

  Via pkg install (NOT in pfSense package manager):
    pkg install -y rsync

  Via pkg install (NOT in pfSense package manager):
    pkg install --no-repo-update /mnt/usb_backup/pkgs/All/rsync-*.pkg
    (offline) OR: pkg install -y rsync  (requires internet)

  Via install-api.sh on this USB (3rd party, not in pkg manager):
    pfSense-pkg-RESTAPI      (see Step 3 below — installs from pkgs/ if cached)

Step 3 — Reinstall the pfSense RESTAPI package (3rd party, not in pkg manager)

  Option A — script on this USB:
    mount_msdosfs /dev/${dev} /mnt/usb_backup
    sh /mnt/usb_backup/install-api.sh

  Option B — manual:
    VER=$(cat /etc/version | cut -d. -f1-2)
    fetch -o /tmp/restapi.pkg \\
      https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/latest/download/pfSense-\${VER}-pkg-RESTAPI.pkg
    pkg install -y /tmp/restapi.pkg
    /etc/rc.restart_webgui

Step 4 — Configure RESTAPI

  1. System > API — enable API
  2. Access Control — enable diagnostics/command_prompt
  3. Create API credentials (key + secret)
  4. Update .env in pfsense-cli repo on management host:
       PFSENSE_HOST=https://<pfsense-ip>
       PFSENSE_API_KEY=<key>
       PFSENSE_API_SECRET=<secret>
  5. make test-api

Step 5 — Restore timestamped backup cron (/etc/cron.d/ entry)

  The conf rsync crons (mechanisms 1 and 2) come back automatically
  with config restore. The /etc/cron.d/ entry for pfsense-backups/
  does not — restore it with:

    make backup-usb-install USB_DEV=${dev} KEEP_LAST=${keep}

Step 6 — Verify NAS rsync SSH key

  The NAS rsync (ghost-files) requires pfSense to have an SSH key
  trusted by ghost-files. After reinstall, test:
    ssh slm@ghost-files echo ok
  If it fails, copy the pfSense SSH public key to ghost-files
  authorized_keys.

Step 7 — Remove stale UniFi cron entries

  UniFi no longer runs on pfSense. These entries were removed Aug 2026.
  If they reappear after a config restore, remove via PHP shell:

    php -r "require_once('config.inc');require_once('cron.inc');
    global \$config;
    \$config['cron']['item']=array_values(array_filter(
      \$config['cron']['item'],
      function(\$i){return strpos(\$i['command'],'UniFi')===false;}));
    write_config('Remove stale UniFi cron entries');
    configure_cron();echo 'done\n';"

---

## Recovery order (quick reference)

  1. Restore conf/config.xml via GUI or:
       cp /mnt/usb_backup/conf/config.xml /cf/conf/config.xml && /etc/rc.reload_all
     (restores HAProxy, WireGuard, DNS, firewall, cron jobs)

  2. pkg install -y rsync
     (not in pfSense package manager; required for NAS sync cron)

  3. sh /mnt/usb_backup/install-api.sh
     (pfSense RESTAPI — 3rd party, not in package manager)

  4. System > Package Manager — reinstall all packages:
       haproxy, acme, WireGuard, Shellcmd, Telegraf, apcupsd, nut,
       sudo, System_Patches, ntopng, suricata, LCDproc,
       Service_Watchdog, openvpn-client-export

  5. make backup-usb-install USB_DEV=${dev} KEEP_LAST=${keep}
     (restores /etc/cron.d/ timestamped backup cron)

  6. Verify NAS SSH: ssh slm@ghost-files echo ok
     (key auto-restored via earlyshellcmd from /cf/conf/ssh_outbound_id_ed25519)

---

## pfsense-cli repo

  Location : ~/dev/projects/pfsense-cli  (management host)
  Targets  : make help
  Backup   : make backup-usb-status
`;
}

// ---------------------------------------------------------------------------
// Detect USB device and check mount state
// ---------------------------------------------------------------------------

async function backupStatus({ usbDev } = {}) {
  const client = getPfSenseClient();
  const dev = usbDev || process.env.USB_DEV || 'da0s1';
  const mountPoint = '/mnt/usb_backup';
  const backupDir  = `${mountPoint}/pfsense-backups`;

  console.log(`\n${c.bold}USB Backup Status${c.reset}`);
  console.log(c.gray + '─'.repeat(60) + c.reset);

  // Device presence
  const devCheck = await runCmd(client, `ls /dev/da* /dev/mmcsd* 2>/dev/null || echo NONE`);
  console.log(`\n  ${c.bold}USB devices${c.reset}: ${c.gray}${devCheck || 'none'}${c.reset}`);

  const devExists = await runCmd(client, `test -e /dev/${dev} && echo yes || echo no`);
  const devColor  = devExists === 'yes' ? c.green : c.red;
  console.log(`  ${c.bold}/dev/${dev}${c.reset}: ${devColor}${devExists}${c.reset}`);

  // Mount state
  const mountCheck = await runCmd(client, `mount | grep '/dev/${dev}' || echo '(not mounted)'`);
  console.log(`  ${c.bold}Mount${c.reset}: ${c.gray}${mountCheck}${c.reset}`);

  // Disk usage (only if mounted)
  if (mountCheck !== '(not mounted)') {
    const df = await runCmd(client, `df -h ${mountPoint} 2>/dev/null || echo '(df failed)'`);
    console.log(`  ${c.bold}Disk${c.reset}:\n${c.gray}${df}${c.reset}`);

    // Backup file listing
    const files = await runCmd(client, `ls -lt ${backupDir}/config-*.xml 2>/dev/null | head -10 || echo '(no backups found)'`);
    console.log(`\n  ${c.bold}Recent backups${c.reset} (${backupDir}):\n${c.gray}${files}${c.reset}`);

    const count = await runCmd(client, `ls ${backupDir}/config-*.xml 2>/dev/null | wc -l | tr -d ' '`);
    console.log(`\n  ${c.bold}Total backups${c.reset}: ${c.cyan}${count}${c.reset}`);
  }

  // Cron entry check
  const cronCheck = await runCmd(client, `crontab -l -u root 2>/dev/null | grep backup-config || echo '(no cron entry found)'`);
  console.log(`\n  ${c.bold}Cron${c.reset}: ${c.gray}${cronCheck}${c.reset}`);

  console.log('');
}

// ---------------------------------------------------------------------------
// Run backup now via command_prompt
// ---------------------------------------------------------------------------

async function backupNow({ usbDev, keepLast } = {}) {
  const client    = getPfSenseClient();
  const dev       = usbDev   || process.env.USB_DEV  || 'da0s1';
  const keep      = keepLast || process.env.KEEP_LAST || '30';
  const mountPoint = '/mnt/usb_backup';
  const scriptDest = `${mountPoint}/backup.sh`;

  // Prefer the script already on the USB (put there by backup-usb-install)
  const scriptExists = await runCmd(client, `test -f '${scriptDest}' && echo yes || echo no`);
  if (scriptExists !== 'yes') {
    console.error(`${c.red}Backup script not found at ${scriptDest}.${c.reset}`);
    console.error(`Run: make backup-usb-install USB_DEV=${dev}`);
    process.exit(1);
  }

  console.log(`Running backup to /dev/${dev}...`);
  const output = await runCmd(client, `USB_DEV=${dev} KEEP_LAST=${keep} sh '${scriptDest}'`);
  if (!output) {
    console.error(`${c.red}No output — check USB is mounted and script is executable.${c.reset}`);
    process.exit(1);
  }
  const ok = output.toLowerCase().includes('ok:');
  console.log(ok ? `${c.green}${output}${c.reset}` : `${c.red}${output}${c.reset}`);
  if (!ok) process.exit(1);
}

// ---------------------------------------------------------------------------
// Install: write script to USB, add cron entry via pfSense cron API
// ---------------------------------------------------------------------------

async function backupInstall({ usbDev, keepLast, schedule } = {}) {
  const client = getPfSenseClient();
  const dev       = usbDev   || process.env.USB_DEV        || 'da0s1';
  const keep      = keepLast || process.env.KEEP_LAST       || '30';
  const cronSched = schedule || process.env.BACKUP_SCHEDULE || '0 * * * *';

  const mountPoint = '/mnt/usb_backup';
  const scriptDest = `${mountPoint}/backup.sh`;

  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup-config-to-usb.sh');
  const script     = fs.readFileSync(scriptPath, 'utf8');

  // Step 1: mount USB if needed
  console.log(`\n${c.bold}1. Mounting /dev/${dev}...${c.reset}`);
  const mountCheck = await runCmd(client, `mount | grep -qF '/dev/${dev}' && echo mounted || echo not-mounted`);
  if (mountCheck === 'not-mounted') {
    const mountOut = await runCmd(client,
      `mkdir -p ${mountPoint} && (mount_msdosfs /dev/${dev} ${mountPoint} 2>/dev/null || mount /dev/${dev} ${mountPoint}) && echo OK || echo FAIL`
    );
    if (mountOut === 'FAIL') {
      console.error(`${c.red}Mount failed for /dev/${dev}. Check device name with: make backup-usb-status${c.reset}`);
      process.exit(1);
    }
    console.log(`  ${c.green}Mounted${c.reset}`);
  } else {
    console.log(`  ${c.gray}Already mounted${c.reset}`);
  }

  // Step 2: write backup script to USB
  console.log(`\n${c.bold}2. Writing backup script to ${scriptDest}...${c.reset}`);
  await writeFileToUsb(client, script, scriptDest);
  const chmodOut = await runCmd(client, `chmod 755 '${scriptDest}' && echo OK || echo FAIL`);
  if (chmodOut !== 'OK') {
    console.error(`${c.red}chmod failed: ${chmodOut}${c.reset}`);
    process.exit(1);
  }
  console.log(`  ${c.green}Written (${script.split('\n').length} lines)${c.reset}`);

  // Step 3: add cron entry via pfSense RESTAPI v2 cron endpoint
  // Schedule format: "min hour mday month wday"
  const [minute, hour, mday, month, wday] = cronSched.split(' ');
  console.log(`\n${c.bold}3. Installing cron job (${cronSched})...${c.reset}`);

  const cronCmd = `USB_DEV=${dev} KEEP_LAST=${keep} sh ${scriptDest} >> /tmp/pfsense-usb-backup.log 2>&1`;

  let cronInstalled = false;

  // Try pfSense RESTAPI v2 cron endpoint first (persists in config.xml)
  try {
    // Remove any existing entry first
    const listResp = await client.get('/api/v2/system/crons', { params: { limit: 0 } });
    const existing = (listResp.data.data || []).find(j => j.command && j.command.includes('backup.sh'));
    if (existing) {
      await client.delete('/api/v2/system/cron', { data: { id: existing.id } });
      console.log(`  ${c.gray}Removed old cron entry (id ${existing.id})${c.reset}`);
    }

    await client.post('/api/v2/system/cron', {
      minute, hour, mday, month, wday,
      who:     'root',
      command: cronCmd,
    });
    cronInstalled = true;
    console.log(`  ${c.green}Added via pfSense cron API (persists in config.xml)${c.reset}`);
  } catch (e) {
    // Fallback: write to /etc/cron.d/ via command_prompt
    const cronLine = `${cronSched} root ${cronCmd}`;
    const writeResp = await runCmd(client,
      `echo '${cronLine.replace(/'/g, "'\\''")}' > /etc/cron.d/pfsense-usb-backup && echo OK || echo FAIL`
    );
    if (writeResp === 'OK') {
      cronInstalled = true;
      console.log(`  ${c.yellow}Added via /etc/cron.d/ (may not survive config reload)${c.reset}`);
    } else {
      console.error(`  ${c.red}Failed to install cron: ${writeResp}${c.reset}`);
    }
  }

  if (!cronInstalled) {
    console.error(`${c.red}Cron installation failed. Add manually via Services > Shellcmd.${c.reset}`);
    process.exit(1);
  }

  // Step 4: run once to verify
  console.log(`\n${c.bold}4. Running initial backup...${c.reset}`);
  const runOut = await runCmd(client,
    `USB_DEV=${dev} KEEP_LAST=${keep} sh ${scriptDest}`
  );
  const ok = runOut.toLowerCase().includes('ok:');
  console.log(ok ? `  ${c.green}${runOut}${c.reset}` : `  ${c.red}${runOut}${c.reset}`);

  // Step 5: write RECOVERY.md and install-api.sh to USB root
  console.log(`\n${c.bold}5. Writing recovery files to USB...${c.reset}`);
  const readmeDest   = `${mountPoint}/RECOVERY.md`;
  const installDest  = `${mountPoint}/install-api.sh`;
  const readmeContent  = buildRecoveryReadme({ dev, keep, cronSched });
  const installScript  = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'install-api.sh'), 'utf8'
  );

  await writeFileToUsb(client, readmeContent, readmeDest);
  console.log(`  ${c.green}RECOVERY.md written${c.reset}`);

  await writeFileToUsb(client, installScript, installDest);
  await runCmd(client, `chmod 755 '${installDest}'`);
  console.log(`  ${c.green}install-api.sh written${c.reset}`);

  console.log(`\n${c.bold}${c.green}Backup installed.${c.reset}`);
  console.log(`  Schedule : ${cronSched}`);
  console.log(`  Device   : /dev/${dev}`);
  console.log(`  Script   : ${scriptDest}`);
  console.log(`  Log      : /tmp/pfsense-usb-backup.log`);
  console.log(`  Retain   : ${keep} backups`);
  console.log(`  Recovery : ${readmeDest}\n`);
}

// Write/refresh RECOVERY.md and install-api.sh on the USB without full reinstall
async function writeUsbRecovery({ usbDev, keepLast, schedule } = {}) {
  const client    = getPfSenseClient();
  const dev       = usbDev   || process.env.USB_DEV        || 'da0s1';
  const keep      = keepLast || process.env.KEEP_LAST       || '30';
  const cronSched = schedule || process.env.BACKUP_SCHEDULE || '0 * * * *';
  const mountPoint = '/mnt/usb_backup';

  const mountCheck = await runCmd(client, `mount | grep -qF '/dev/${dev}' && echo mounted || echo not-mounted`);
  if (mountCheck === 'not-mounted') {
    console.error(`${c.red}USB /dev/${dev} not mounted. Run: make backup-usb-install${c.reset}`);
    process.exit(1);
  }

  console.log(`\nWriting recovery files to ${mountPoint}...`);

  const readmeContent = buildRecoveryReadme({ dev, keep, cronSched });
  await writeFileToUsb(client, readmeContent, `${mountPoint}/RECOVERY.md`);
  console.log(`  ${c.green}RECOVERY.md${c.reset}`);

  const installScript = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'install-api.sh'), 'utf8'
  );
  await writeFileToUsb(client, installScript, `${mountPoint}/install-api.sh`);
  await runCmd(client, `chmod 755 '${mountPoint}/install-api.sh'`);
  console.log(`  ${c.green}install-api.sh${c.reset}`);

  console.log(`\nDone. Files on USB root:\n`);
  const listing = await runCmd(client, `ls -lh '${mountPoint}'`);
  console.log(c.gray + listing + c.reset + '\n');
}

// ---------------------------------------------------------------------------
// Cache packages on USB for offline recovery
// ---------------------------------------------------------------------------

async function backupCachePkgs({ usbDev } = {}) {
  const client     = getPfSenseClient();
  const dev        = usbDev || process.env.USB_DEV || 'da0s1';
  const mountPoint = '/mnt/usb_backup';
  const pkgsDir    = `${mountPoint}/pkgs`;

  const mountCheck = await runCmd(client, `mount | grep -qF '/dev/${dev}' && echo mounted || echo not-mounted`);
  if (mountCheck === 'not-mounted') {
    console.error(`${c.red}USB /dev/${dev} not mounted. Run: make backup-usb-install${c.reset}`);
    process.exit(1);
  }

  await runCmd(client, `mkdir -p '${pkgsDir}'`);

  // Detect pfSense major version
  const ver = await runCmd(client, `cat /etc/version | cut -d. -f1-2`);
  if (!ver) {
    console.error(`${c.red}Could not detect pfSense version${c.reset}`);
    process.exit(1);
  }
  console.log(`\npfSense version: ${ver}`);

  // --- RESTAPI package ---
  const pkgFile  = `pfSense-${ver}-pkg-RESTAPI.pkg`;
  const destPath = `${pkgsDir}/${pkgFile}`;
  const versions = ['v2.7.3', 'v2.7.2', 'v2.7.1', 'v2.7.0'];

  console.log(`\n${c.bold}1. Caching RESTAPI package (${pkgFile})...${c.reset}`);

  // Check internet
  const netOk = await runCmd(client, `ping -c 1 -t 5 github.com > /dev/null 2>&1 && echo yes || echo no`);
  if (netOk !== 'yes') {
    console.error(`${c.red}No internet — cannot fetch packages. Run when WAN is up.${c.reset}`);
    process.exit(1);
  }

  let apiCached = false;
  for (const v of versions) {
    const url = `https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/download/${v}/${pkgFile}`;
    console.log(`  Trying ${v}...`);
    const out = await runCmd(client, `fetch -o '${destPath}' '${url}' 2>/dev/null && echo OK || echo FAIL`);
    if (out === 'OK') {
      const size = await runCmd(client, `ls -lh '${destPath}' | awk '{print $5}'`);
      console.log(`  ${c.green}Cached ${v} (${size})${c.reset}`);
      apiCached = true;
      break;
    }
  }
  if (!apiCached) {
    console.error(`  ${c.red}Failed to cache RESTAPI package${c.reset}`);
  }

  // --- rsync package + deps ---
  console.log(`\n${c.bold}2. Caching rsync + dependencies...${c.reset}`);
  const rsyncOut = await runCmd(client,
    `pkg fetch -d -y -o '${pkgsDir}' rsync 2>&1 | tail -3`
  );
  console.log(`  ${c.gray}${rsyncOut}${c.reset}`);

  // List what's cached
  console.log(`\n${c.bold}Cached packages:${c.reset}`);
  const listing = await runCmd(client, `ls -lh '${pkgsDir}'`);
  console.log(c.gray + listing + c.reset);

  console.log(`\n${c.green}Done. Packages cached to ${pkgsDir}${c.reset}`);
  console.log(`${c.gray}Run: make backup-usb-readme to update RECOVERY.md${c.reset}\n`);
}

module.exports = { backupStatus, backupNow, backupInstall, writeUsbRecovery, backupCachePkgs };
