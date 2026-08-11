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

## What is on this drive

| Path | Description |
|------|-------------|
| RECOVERY.md | This file |
| backup.sh | Hourly backup script (runs on pfSense via cron) |
| install-api.sh | pfSense RESTAPI package installer |
| pfsense-backups/ | Config snapshots (config-<timestamp>.xml) |

## After a fresh pfSense reinstall

### Option A — Restore from config backup (fastest)

1. SSH into pfSense or use the console shell
2. Mount this USB:
   mount_msdosfs /dev/${dev} /mnt/usb
3. Find the most recent backup:
   ls -lt /mnt/usb/pfsense-backups/*.xml | head -5
4. Go to pfSense GUI: Diagnostics > Backup & Restore > Restore Backup
5. Upload the .xml file — pfSense restores all settings and reboots

After config restore, jump to Step 3 below (reinstall RESTAPI package).

### Step 1 — Base pfSense install

Install pfSense CE from the base image. Configure WAN/LAN interfaces
at the console. Skip all else — you will restore config in later steps.

### Step 2 — Reinstall the pfSense RESTAPI package

The RESTAPI package (github.com/pfrest/pfSense-pkg-RESTAPI) is a
3rd-party package not included in the base image. It must be reinstalled
after every fresh install.

Option A — using the script on this USB (SSH to pfSense):

  mount_msdosfs /dev/${dev} /mnt/usb
  sh /mnt/usb/install-api.sh

Option B — manual one-liner (SSH to pfSense):

  VER=$(cat /etc/version | cut -d. -f1-2)
  fetch -o /tmp/restapi.pkg \\
    https://github.com/pfrest/pfSense-pkg-RESTAPI/releases/latest/download/pfSense-\${VER}-pkg-RESTAPI.pkg
  pkg install -y /tmp/restapi.pkg
  /etc/rc.restart_webgui

### Step 3 — Configure the RESTAPI

1. Go to System > API in pfSense GUI
2. Enable the API
3. Under Access Control, enable diagnostics/command_prompt
   (required by backup script, optics, and WireGuard watchdogs)
4. Create API credentials (key + secret)
5. Update .env in the pfsense-cli repo on the management host:

   PFSENSE_HOST=https://<pfsense-ip>
   PFSENSE_API_KEY=<new-key>
   PFSENSE_API_SECRET=<new-secret>

6. Test from management host:
   make test-api

### Step 4 — Restore USB backup cron

From the management host (pfsense-cli repo):

  make backup-usb-install USB_DEV=${dev} KEEP_LAST=${keep}

This re-deploys backup.sh (already on this USB) and reinstalls
the cron job. The initial backup runs immediately to confirm.

---

## Manual config restore via SSH (no GUI)

  mount_msdosfs /dev/${dev} /mnt/usb
  LATEST=$(ls -t /mnt/usb/pfsense-backups/*.xml | head -1)
  echo "Restoring: $LATEST"
  cp "$LATEST" /cf/conf/config.xml
  /etc/rc.reload_all

---

## Backup parameters (current install)

  Device   : /dev/${dev}
  Schedule : ${cronSched}
  Retain   : ${keep} most recent backups
  Log      : /tmp/pfsense-usb-backup.log (on pfSense)

## pfsense-cli repo

  Location : ~/dev/projects/pfsense-cli  (management host)
  Targets  : make help
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

module.exports = { backupStatus, backupNow, backupInstall, writeUsbRecovery };
