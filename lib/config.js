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

function fmtSize(bytes) {
  if (bytes === null || bytes === undefined) return '?';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'M';
  if (bytes >= 1024)        return (bytes / 1024).toFixed(1) + 'K';
  return bytes + 'B';
}

function fmtAge(unixTs) {
  const sec = Math.floor(Date.now() / 1000) - unixTs;
  if (sec < 60)       return `${sec}s ago`;
  if (sec < 3600)     return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)    return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// List config history revisions
// ---------------------------------------------------------------------------

async function listConfigHistory({ limit } = {}) {
  const client = getPfSenseClient();
  const resp   = await client.get('/api/v2/diagnostics/config_history/revisions', { params: { limit: 0 } });
  let   revs   = resp.data.data || [];

  // Sort newest first
  revs.sort((a, b) => (b.time || 0) - (a.time || 0));

  if (limit && limit > 0) revs = revs.slice(0, limit);

  if (revs.length === 0) {
    console.log('No config history revisions found.');
    return revs;
  }

  console.log(`\n${c.bold}Config History (${revs.length} revision${revs.length !== 1 ? 's' : ''}):${c.reset}`);
  console.log(c.gray + '─'.repeat(80) + c.reset);

  for (const r of revs) {
    const ts  = r.time ? new Date(r.time * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') : '?';
    const age = r.time ? ` ${c.gray}(${fmtAge(r.time)})${c.reset}` : '';
    console.log(`\n  ${c.cyan}${ts}${c.reset}${age}`);
    if (r.description) console.log(`    ${c.gray}${r.description}${c.reset}`);
    const meta = [
      r.version  ? `v${r.version}`         : null,
      r.filesize ? fmtSize(r.filesize)      : null,
    ].filter(Boolean).join('  ');
    if (meta) console.log(`    ${c.gray}${meta}${c.reset}`);
    if (r.time) console.log(`    ${c.gray}time=${r.time}${c.reset}`);
  }
  console.log('');
  return revs;
}

// ---------------------------------------------------------------------------
// Prune config history
// ---------------------------------------------------------------------------

async function pruneConfigHistory({ olderThanDays, keepLast }) {
  if ((olderThanDays === null || olderThanDays === undefined) && (keepLast === null || keepLast === undefined)) {
    throw new Error('Either --older-than or --keep-last is required');
  }

  const client = getPfSenseClient();
  const resp   = await client.get('/api/v2/diagnostics/config_history/revisions', { params: { limit: 0 } });
  const revs   = resp.data.data || [];

  if (revs.length === 0) {
    console.log('No config history revisions to prune.');
    return;
  }

  revs.sort((a, b) => (b.time || 0) - (a.time || 0)); // newest first

  let toDelete;
  if (keepLast !== null && keepLast !== undefined) {
    toDelete = revs.slice(keepLast);
  } else {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
    toDelete = revs.filter(r => r.time && r.time < cutoff);
  }

  if (toDelete.length === 0) {
    console.log('No revisions matched the prune criteria — nothing deleted.');
    return;
  }

  console.log(`\nPruning ${toDelete.length} revision${toDelete.length !== 1 ? 's' : ''}...`);
  let ok = 0, fail = 0;

  for (const r of toDelete) {
    try {
      await client.delete('/api/v2/diagnostics/config_history/revision', { data: { time: r.time } });
      const ts = r.time ? new Date(r.time * 1000).toISOString().split('T')[0] : r.time;
      console.log(`  ${c.green}✓${c.reset} Deleted revision ${c.gray}${ts} — ${r.description || '(no description)'}${c.reset}`);
      ok++;
    } catch (e) {
      console.log(`  ${c.red}✗${c.reset} Failed to delete time=${r.time}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n  Pruned ${c.green}${ok}${c.reset}${fail ? `  failed ${c.red}${fail}${c.reset}` : ''}\n`);
}

module.exports = { listConfigHistory, pruneConfigHistory };
