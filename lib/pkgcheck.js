const { getPfSenseClient } = require('./pfsense');
const fs   = require('fs');
const path = require('path');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
};

async function runCmd(client, command) {
  const resp = await client.post('/api/v2/diagnostics/command_prompt', { command });
  return (resp.data.data?.output || '').trim();
}

async function writeFileRemote(client, content, dest) {
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

async function pkgcheckInstall({ schedule } = {}) {
  const client   = getPfSenseClient();
  const cronSched = schedule || '30 7 * * *';
  const scriptDest = '/usr/local/sbin/pkg_check.php';
  const cronCmd    = `/usr/bin/nice -n20 /usr/local/bin/php -q ${scriptDest}`;

  const scriptPath = path.join(__dirname, '..', 'scripts', 'pkg_check.php');
  const script     = fs.readFileSync(scriptPath, 'utf8');

  // Step 1: deploy script
  console.log(`\n${c.bold}1. Writing ${scriptDest} to router...${c.reset}`);
  await writeFileRemote(client, script, scriptDest);
  const chmodOut = await runCmd(client, `chmod 755 '${scriptDest}' && echo OK || echo FAIL`);
  if (chmodOut !== 'OK') {
    console.error(`${c.red}chmod failed: ${chmodOut}${c.reset}`);
    process.exit(1);
  }
  console.log(`  ${c.green}Written (${script.split('\n').length} lines)${c.reset}`);

  // Step 2: add cron entry via pfSense RESTAPI v2
  const [minute, hour, mday, month, wday] = cronSched.split(' ');
  console.log(`\n${c.bold}2. Installing cron job (${cronSched})...${c.reset}`);

  let cronInstalled = false;

  // Try RESTAPI v2 first
  try {
    const listResp = await client.get('/api/v2/system/crons', { params: { limit: 0 } });
    const existing = (listResp.data.data || []).find(j => j.command && j.command.includes('pkg_check.php'));
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
  } catch {
    // Fallback: write a temp PHP file then execute it (avoids quoting issues with command_prompt)
    console.log(`  ${c.yellow}RESTAPI cron endpoint unavailable, falling back to PHP cron.inc...${c.reset}`);
    const tmpScript = `/tmp/add_pkgcheck_cron.php`;
    const phpContent = [
      `<?php`,
      `require_once('config.inc');`,
      `require_once('cron.inc');`,
      `global $config;`,
      `$config['cron']['item'] = array_values(array_filter((array)$config['cron']['item'], function($i) {`,
      `  return strpos($i['command'], 'pkg_check.php') === false;`,
      `}));`,
      `$config['cron']['item'][] = [`,
      `  'minute'  => '${minute}',`,
      `  'hour'    => '${hour}',`,
      `  'mday'    => '${mday}',`,
      `  'month'   => '${month}',`,
      `  'wday'    => '${wday}',`,
      `  'who'     => 'root',`,
      `  'command' => '${cronCmd}',`,
      `];`,
      `write_config('Add pkg_check.php update check cron');`,
      `configure_cron();`,
      `echo 'done';`,
    ].join('\n');

    await writeFileRemote(client, phpContent, tmpScript);
    const out = await runCmd(client, `php ${tmpScript}; rm -f ${tmpScript}`);
    if (out.includes('done')) {
      cronInstalled = true;
      console.log(`  ${c.green}Added via config.xml / cron.inc (persists in config.xml)${c.reset}`);
    } else {
      console.error(`  ${c.red}PHP fallback failed: ${out}${c.reset}`);
    }
  }

  if (!cronInstalled) {
    console.error(`${c.red}Cron installation failed. Add manually via Services > Cron.${c.reset}`);
    process.exit(1);
  }

  console.log(`\n${c.green}${c.bold}Done. ${scriptDest} will run daily at 07:30.${c.reset}`);
}

module.exports = { pkgcheckInstall };
