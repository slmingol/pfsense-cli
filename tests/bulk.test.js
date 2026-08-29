'use strict';

const fs   = require('fs');
const path = require('path');

jest.mock('../lib/pfsense', () => ({ getPfSenseClient: jest.fn() }));
jest.mock('../lib/dns',     () => ({ addEntry: jest.fn(), addAlias: jest.fn() }));
jest.mock('../lib/haproxy', () => ({ addBackend: jest.fn(), addFrontendRoute: jest.fn() }));

const { addEntry, addAlias }              = require('../lib/dns');
const { addBackend, addFrontendRoute }    = require('../lib/haproxy');

// Require after mocks so the module picks them up
const { bulkImport } = require('../lib/bulk');

// internal pure functions are not exported; test via bulkImport with temp files
const TMPDIR = require('os').tmpdir();

function tmpFile(name, content) {
  const p = path.join(TMPDIR, name);
  fs.writeFileSync(p, content);
  return p;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  addEntry.mockResolvedValue(undefined);
  addAlias.mockResolvedValue(undefined);
  addBackend.mockResolvedValue(undefined);
  addFrontendRoute.mockResolvedValue(undefined);
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

// ---------------------------------------------------------------------------
// parseJSON — tested via bulkImport
// ---------------------------------------------------------------------------
describe('parseJSON (via bulkImport)', () => {
  test('bare array treated as services', async () => {
    const f = tmpFile('bare-array.json', JSON.stringify([
      { alias: 'svc1', port: '8080', description: 'test svc' }
    ]));
    await bulkImport({ file: f, dryRun: true });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('svc1');
  });

  test('object with dns key parsed correctly', async () => {
    const f = tmpFile('dns-obj.json', JSON.stringify({
      dns: [{ host: 'web', domain: 'bub.lan', ip: '10.0.0.1' }]
    }));
    await bulkImport({ file: f, dryRun: true });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('web.bub.lan');
  });

  test('throws on malformed JSON', async () => {
    const f = tmpFile('bad.json', '{ not json }');
    await expect(bulkImport({ file: f })).rejects.toThrow('Invalid JSON');
  });
});

// ---------------------------------------------------------------------------
// parseCSV — tested via bulkImport
// ---------------------------------------------------------------------------
describe('parseCSV (via bulkImport)', () => {
  test('infers services from alias+port headers', async () => {
    const f = tmpFile('svcs.csv', [
      'alias,port,description',
      'svc1,8080,my service',
    ].join('\n'));
    await bulkImport({ file: f, dryRun: true });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('svc1');
  });

  test('infers dns from host+domain+ip headers', async () => {
    const f = tmpFile('dns.csv', [
      'host,domain,ip',
      'web,bub.lan,10.0.0.1',
    ].join('\n'));
    await bulkImport({ file: f, dryRun: true });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('web.bub.lan');
  });

  test('throws on unrecognised headers', async () => {
    const f = tmpFile('unknown.csv', 'foo,bar\n1,2');
    await expect(bulkImport({ file: f })).rejects.toThrow('Cannot infer record type');
  });

  test('skips comment lines and blank lines', async () => {
    const f = tmpFile('comments.csv', [
      '# top comment',
      'host,domain,ip',
      '',
      '# skip me',
      'web,bub.lan,10.0.0.1',
    ].join('\n'));
    await bulkImport({ file: f, dryRun: true });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('web.bub.lan');
  });
});

// ---------------------------------------------------------------------------
// validate — tested via bulkImport (throws on validation errors)
// ---------------------------------------------------------------------------
describe('validate (via bulkImport)', () => {
  test('rejects service missing alias', async () => {
    const f = tmpFile('no-alias.json', JSON.stringify({
      services: [{ port: '8080', description: 'x' }]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });

  test('rejects service with non-numeric port', async () => {
    const f = tmpFile('bad-port.json', JSON.stringify({
      services: [{ alias: 'svc', port: 'abc', description: 'x' }]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });

  test('rejects duplicate service aliases', async () => {
    const f = tmpFile('dup-alias.json', JSON.stringify({
      services: [
        { alias: 'svc', port: '80', description: 'a' },
        { alias: 'svc', port: '81', description: 'b' },
      ]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });

  test('rejects dns entry with bad IP', async () => {
    const f = tmpFile('bad-ip.json', JSON.stringify({
      dns: [{ host: 'web', domain: 'bub.lan', ip: 'not-an-ip' }]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });

  test('rejects dns entry missing host', async () => {
    const f = tmpFile('no-host.json', JSON.stringify({
      dns: [{ domain: 'bub.lan', ip: '10.0.0.1' }]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });

  test('rejects haproxy entry missing server', async () => {
    const f = tmpFile('no-server.json', JSON.stringify({
      haproxy: [{ name: 'be', port: '80' }]
    }));
    await expect(bulkImport({ file: f })).rejects.toThrow('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// bulkImport dry-run vs apply
// ---------------------------------------------------------------------------
describe('bulkImport', () => {
  test('dry-run: does not call addEntry or addBackend', async () => {
    const f = tmpFile('dry.json', JSON.stringify({
      dns: [{ host: 'web', domain: 'bub.lan', ip: '10.0.0.1' }]
    }));
    await bulkImport({ file: f, dryRun: true });
    expect(addEntry).not.toHaveBeenCalled();
  });

  test('apply: calls addEntry for dns records', async () => {
    const f = tmpFile('apply-dns.json', JSON.stringify({
      dns: [{ host: 'web', domain: 'bub.lan', ip: '10.0.0.1', description: 'x' }]
    }));
    await bulkImport({ file: f, dryRun: false });
    expect(addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'web', domain: 'bub.lan', ip: '10.0.0.1' })
    );
  });

  test('apply: calls addBackend for haproxy records', async () => {
    const f = tmpFile('apply-ha.json', JSON.stringify({
      haproxy: [{ name: 'be_svc', server: 'svc.bub.lan', port: '443', ssl: 'true' }]
    }));
    await bulkImport({ file: f, dryRun: false });
    expect(addBackend).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'be_svc', serverPort: 443, ssl: true })
    );
  });

  test('apply: calls addAlias + addBackend + addFrontendRoute for services', async () => {
    const f = tmpFile('apply-svc.json', JSON.stringify({
      services: [{ alias: 'myapp', port: '4000', description: 'My App' }]
    }));
    await bulkImport({ file: f, dryRun: false });
    expect(addAlias).toHaveBeenCalled();
    expect(addBackend).toHaveBeenCalled();
    expect(addFrontendRoute).toHaveBeenCalled();
  });

  test('throws on missing file', async () => {
    await expect(bulkImport({ file: '/nonexistent/file.json' }))
      .rejects.toThrow('File not found');
  });

  test('throws on unsupported extension', async () => {
    const f = tmpFile('data.txt', 'hello');
    await expect(bulkImport({ file: f })).rejects.toThrow('Unsupported file type');
  });
});
