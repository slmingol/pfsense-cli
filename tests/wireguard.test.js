'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

jest.mock('../lib/pfsense', () => ({ getPfSenseClient: jest.fn() }));
jest.mock('../lib/firewall', () => ({
  createOrUpdateAlias: jest.fn(),
  deleteAlias:         jest.fn(),
}));

const wg = require('../lib/wireguard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function writeTmp(name, content) {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, content);
  return p;
}

const VALID_CONF = `
[Interface]
Address = 10.2.0.2/32
PrivateKey = FAKE_PRIVATE_KEY_BASE64==
DNS = 10.2.0.1

[Peer]
PublicKey = FAKE_PUBLIC_KEY_BASE64==
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0
PresharedKey = FAKE_PSK==
`;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WG_PRIVATE_KEY;
});

// ---------------------------------------------------------------------------
// parseWireGuardConf
// ---------------------------------------------------------------------------
describe('parseWireGuardConf', () => {
  test('parses address, privateKey, DNS from [Interface]', () => {
    const f = writeTmp('valid.conf', VALID_CONF);
    const result = wg.parseWireGuardConf(f);
    expect(result.interface.address).toBe('10.2.0.2/32');
    expect(result.interface.privateKey).toBe('FAKE_PRIVATE_KEY_BASE64==');
    expect(result.interface.dns).toBe('10.2.0.1');
  });

  test('parses publicKey, endpoint, port, allowedIPs from [Peer]', () => {
    const f = writeTmp('valid2.conf', VALID_CONF);
    const result = wg.parseWireGuardConf(f);
    expect(result.peer.publicKey).toBe('FAKE_PUBLIC_KEY_BASE64==');
    expect(result.peer.endpoint).toBe('vpn.example.com');
    expect(result.peer.port).toBe(51820);
    expect(result.peer.allowedIPs).toEqual(['0.0.0.0/0']);
  });

  test('WG_PRIVATE_KEY env var overrides key in file', () => {
    process.env.WG_PRIVATE_KEY = 'ENV_PRIVATE_KEY==';
    const f = writeTmp('env-key.conf', VALID_CONF);
    const result = wg.parseWireGuardConf(f);
    expect(result.interface.privateKey).toBe('ENV_PRIVATE_KEY==');
  });

  test('WG_PRIVATE_KEY env var substitutes when file has no PrivateKey', () => {
    process.env.WG_PRIVATE_KEY = 'ENV_KEY==';
    const conf = VALID_CONF.replace(/PrivateKey = .*\n/, '');
    const f = writeTmp('no-privkey.conf', conf);
    const result = wg.parseWireGuardConf(f);
    expect(result.interface.privateKey).toBe('ENV_KEY==');
  });

  test('throws when no private key available', () => {
    const conf = VALID_CONF.replace(/PrivateKey = .*\n/, '');
    const f = writeTmp('missing-key.conf', conf);
    expect(() => wg.parseWireGuardConf(f)).toThrow('private key not found');
  });

  test('throws when PublicKey missing in [Peer]', () => {
    const conf = VALID_CONF.replace(/PublicKey = .*\n/, '');
    const f = writeTmp('missing-pubkey.conf', conf);
    expect(() => wg.parseWireGuardConf(f)).toThrow('missing PublicKey');
  });

  test('throws when Endpoint missing in [Peer]', () => {
    const conf = VALID_CONF.replace(/Endpoint = .*\n/, '');
    const f = writeTmp('missing-endpoint.conf', conf);
    expect(() => wg.parseWireGuardConf(f)).toThrow('missing Endpoint');
  });

  test('skips comment lines and blank lines', () => {
    const conf = `
# this is a comment
[Interface]
Address = 10.2.0.2/32
PrivateKey = KEY==
# another comment

[Peer]
PublicKey = PUBKEY==
Endpoint = host.example.com:51820
AllowedIPs = 0.0.0.0/0
`;
    const f = writeTmp('comments.conf', conf);
    const result = wg.parseWireGuardConf(f);
    expect(result.interface.address).toBe('10.2.0.2/32');
    expect(result.peer.endpoint).toBe('host.example.com');
  });

  test('endpoint with IPv6 address parses correctly', () => {
    const conf = VALID_CONF.replace('Endpoint = vpn.example.com:51820', 'Endpoint = [2001:db8::1]:51820');
    const f = writeTmp('ipv6.conf', conf);
    const result = wg.parseWireGuardConf(f);
    expect(result.peer.endpoint).toBe('[2001:db8::1]');
    expect(result.peer.port).toBe(51820);
  });

  test('multiple AllowedIPs are split into array', () => {
    const conf = VALID_CONF.replace('AllowedIPs = 0.0.0.0/0', 'AllowedIPs = 0.0.0.0/0, ::/0');
    const f = writeTmp('multi-allowed.conf', conf);
    const result = wg.parseWireGuardConf(f);
    expect(result.peer.allowedIPs).toEqual(['0.0.0.0/0', '::/0']);
  });
});

// ---------------------------------------------------------------------------
// deriveGatewayIP
// ---------------------------------------------------------------------------
describe('deriveGatewayIP', () => {
  test('returns DNS field when present', () => {
    const cfg = { interface: { address: '10.2.0.2/32', dns: '10.2.0.1' } };
    expect(wg.deriveGatewayIP(cfg)).toBe('10.2.0.1');
  });

  test('derives gateway by decrementing last octet when no DNS', () => {
    const cfg = { interface: { address: '10.2.0.2/32' } };
    expect(wg.deriveGatewayIP(cfg)).toBe('10.2.0.1');
  });

  test('handles octet boundary correctly', () => {
    const cfg = { interface: { address: '10.64.0.1/32' } };
    expect(wg.deriveGatewayIP(cfg)).toBe('10.64.0.0');
  });
});
