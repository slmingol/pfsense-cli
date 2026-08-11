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
  const client = getPfSenseClient();
  const dev   = usbDev   || process.env.USB_DEV   || 'da0s1';
  const keep  = keepLast || process.env.KEEP_LAST  || '30';

  // Read the script content and run it inline on pfSense
  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup-config-to-usb.sh');
  const script     = fs.readFileSync(scriptPath, 'utf8');

  // Escape single quotes for shell injection
  const escaped = script.replace(/'/g, "'\\''");
  const command = `USB_DEV=${dev} KEEP_LAST=${keep} sh -c '${escaped}'`;

  console.log(`Running backup to /dev/${dev}...`);
  const output = await runCmd(client, command);
  if (!output) {
    console.error(`${c.red}No output from backup — check USB device and mount.${c.reset}`);
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

  // Step 2: write script to USB
  console.log(`\n${c.bold}2. Writing backup script to ${scriptDest}...${c.reset}`);
  // Write via here-doc approach using printf (avoids quoting issues with complex scripts)
  const b64 = Buffer.from(script).toString('base64');
  const writeOut = await runCmd(client,
    `printf '%s' '${b64}' | b64decode -r > ${scriptDest} && chmod 755 ${scriptDest} && echo OK || echo FAIL`
  );
  if (writeOut !== 'OK') {
    console.error(`${c.red}Failed to write script: ${writeOut}${c.reset}`);
    process.exit(1);
  }
  console.log(`  ${c.green}Written${c.reset}`);

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

  console.log(`\n${c.bold}${c.green}Backup installed.${c.reset}`);
  console.log(`  Schedule : ${cronSched}`);
  console.log(`  Device   : /dev/${dev}`);
  console.log(`  Script   : ${scriptDest}`);
  console.log(`  Log      : /tmp/pfsense-usb-backup.log`);
  console.log(`  Retain   : ${keep} backups\n`);
}

module.exports = { backupStatus, backupNow, backupInstall };
