'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockClient = {
  get:    jest.fn(),
  post:   jest.fn(),
  delete: jest.fn(),
};

jest.mock('../lib/pfsense', () => ({
  getPfSenseClient: jest.fn(() => mockClient),
}));

const cert = require('../lib/cert');

// Prevent process.exit from terminating the Jest worker
jest.spyOn(process, 'exit').mockImplementation(() => {});

const CERTS = [
  { refid: 'ref001', descr: 'wildcard.bub.lan',  type: 'server', valid_days_left: 120, valid_until: '2026-01-01T00:00:00Z', valid_from: '2025-01-01T00:00:00Z' },
  { refid: 'ref002', descr: 'infisical.bub.lan', type: 'server', valid_days_left: 20,  valid_until: '2025-09-01T00:00:00Z' },
  { refid: 'ref003', descr: 'expired.bub.lan',   type: 'server', valid_days_left: -5,  valid_until: '2025-01-01T00:00:00Z' },
];

let logSpy, errorSpy;

beforeEach(() => {
  logSpy   = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockClient.get.mockReset();
  mockClient.post.mockReset();
  mockClient.delete.mockReset();
  mockClient.post.mockResolvedValue({ data: { data: {} } });
  mockClient.delete.mockResolvedValue({ data: {} });
  process.exit.mockClear();
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// listCerts — filter and expiry threshold
// ---------------------------------------------------------------------------
describe('listCerts', () => {
  test('lists all certs sorted soonest-expiry first', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.listCerts();
    const calls = console.log.mock.calls.flat().join('\n');
    const idxExpired = calls.indexOf('expired.bub.lan');
    const idxInfi    = calls.indexOf('infisical.bub.lan');
    const idxWild    = calls.indexOf('wildcard.bub.lan');
    expect(idxExpired).toBeLessThan(idxInfi);
    expect(idxInfi).toBeLessThan(idxWild);
  });

  test('filter by name substring', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.listCerts({ filter: 'infisical' });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('infisical.bub.lan');
    expect(out).not.toContain('wildcard.bub.lan');
  });

  test('expiringDays threshold filters correctly', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.listCerts({ expiringDays: 30 });
    const out = console.log.mock.calls.flat().join('\n');
    // 20d and -5d are within 30d; 120d is not
    expect(out).toContain('infisical.bub.lan');
    expect(out).toContain('expired.bub.lan');
    expect(out).not.toContain('wildcard.bub.lan');
  });

  test('prints no-match message when nothing matches filter', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.listCerts({ filter: 'nonexistent' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No certificates match'));
  });

  test('prints no-certs message on empty list', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await cert.listCerts();
    expect(console.log).toHaveBeenCalledWith('No certificates found.');
  });
});

// ---------------------------------------------------------------------------
// checkCerts — Nagios-style exit
// ---------------------------------------------------------------------------
describe('checkCerts', () => {
  test('prints OK when all certs valid beyond threshold', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [CERTS[0]] } }); // 120d
    await cert.checkCerts({ expiringDays: 30 });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('OK'));
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('exits 1 when cert expires within threshold', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.checkCerts({ expiringDays: 30 });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('CRITICAL output mentions EXPIRED', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [CERTS[2]] } }); // -5d
    await cert.checkCerts({ expiringDays: 30 });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('EXPIRED');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// importCert
// ---------------------------------------------------------------------------
describe('importCert', () => {
  let certFile, keyFile;

  beforeEach(() => {
    certFile = path.join(os.tmpdir(), 'test.crt');
    keyFile  = path.join(os.tmpdir(), 'test.key');
    fs.writeFileSync(certFile, '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----');
    fs.writeFileSync(keyFile,  '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----');
  });

  test('POSTs base64-encoded PEM', async () => {
    mockClient.post.mockResolvedValue({ data: { data: { refid: 'abc123' } } });
    await cert.importCert({ name: 'my-cert', certFile, keyFile });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/system/certificate',
      expect.objectContaining({ descr: 'my-cert', type: 'server' })
    );
    const payload = mockClient.post.mock.calls[0][1];
    // crt and prv should be base64 (no raw PEM dashes)
    expect(payload.crt).not.toContain('-----');
    expect(payload.prv).not.toContain('-----');
  });

  test('throws when --name missing', async () => {
    await expect(cert.importCert({ certFile, keyFile })).rejects.toThrow('--name is required');
  });

  test('throws when cert file missing', async () => {
    await expect(cert.importCert({ name: 'x', certFile: '/nope.crt', keyFile }))
      .rejects.toThrow('Cert file not found');
  });
});

// ---------------------------------------------------------------------------
// deleteCert
// ---------------------------------------------------------------------------
describe('deleteCert', () => {
  test('deletes by refid directly when provided', async () => {
    await cert.deleteCert({ refid: 'ref001' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/system/certificate',
      { data: { id: 'ref001' } }
    );
  });

  test('looks up refid by name then deletes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.deleteCert({ name: 'wildcard.bub.lan' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/system/certificate',
      { data: { id: 'ref001' } }
    );
  });

  test('throws when neither name nor refid given', async () => {
    await expect(cert.deleteCert({})).rejects.toThrow('Either --name or --refid is required');
  });

  test('throws when name matches no cert', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await expect(cert.deleteCert({ name: 'missing' })).rejects.toThrow('Certificate not found');
  });

  test('throws when name matches multiple certs', async () => {
    const dupCerts = [
      { refid: 'r1', descr: 'dup' },
      { refid: 'r2', descr: 'dup' },
    ];
    mockClient.get.mockResolvedValue({ data: { data: dupCerts } });
    await expect(cert.deleteCert({ name: 'dup' })).rejects.toThrow('Multiple certificates match');
  });
});

// ---------------------------------------------------------------------------
// renewCert
// ---------------------------------------------------------------------------
describe('renewCert', () => {
  test('renews by refid directly', async () => {
    await cert.renewCert({ refid: 'ref001' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/system/certificate/renew',
      { id: 'ref001' }
    );
  });

  test('looks up refid by name then renews', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...CERTS] } });
    await cert.renewCert({ name: 'wildcard.bub.lan' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/system/certificate/renew',
      { id: 'ref001' }
    );
  });
});
