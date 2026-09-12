'use strict';

const mockClient = {
  get:    jest.fn(),
  post:   jest.fn(),
  patch:  jest.fn(),
  delete: jest.fn(),
};

jest.mock('../lib/pfsense', () => ({
  getPfSenseClient: jest.fn(() => mockClient),
}));

// Mock dns module used by resolveHostnameForIp / fixBackendIpAddresses
const mockDns = { reverse: jest.fn(), lookup: jest.fn() };
jest.mock('dns', () => ({ promises: mockDns }));

const haproxy = require('../lib/haproxy');

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.post.mockResolvedValue({ data: { code: 200 } });
  mockClient.patch.mockResolvedValue({ data: { code: 200 } });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

// ---------------------------------------------------------------------------
// auditBackends — classification logic
// ---------------------------------------------------------------------------
describe('auditBackends', () => {
  const makeBackends = (servers) => [{ id: 1, name: 'be_test', servers }];

  test('classifies static IP as safe', async () => {
    mockClient.get
      .mockResolvedValueOnce({ data: { data: makeBackends([{ id: 10, name: 's1', address: '10.0.0.1', port: 443 }]) } })
      .mockResolvedValueOnce({ data: { data: [] } }); // dns_resolver
    await haproxy.auditBackends();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toContain('1'); // 1 static IP
    expect(output).toMatch(/STATIC IP/);
  });

  test('classifies unknown hostname as named (reload risk)', async () => {
    mockClient.get
      .mockResolvedValueOnce({ data: { data: makeBackends([{ id: 10, name: 's1', address: 'svc.bub.lan', port: 80 }]) } })
      .mockResolvedValueOnce({ data: { data: [] } });
    await haproxy.auditBackends();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toMatch(/SERVICE HOSTNAME/);
  });

  test('classifies hostname with >=3 aliases as shared (HIGH RISK)', async () => {
    const dnsEntry = {
      host: 'catch', domain: 'bub.lan',
      aliases: [
        { host: 'a1', domain: 'bub.lan' },
        { host: 'a2', domain: 'bub.lan' },
        { host: 'a3', domain: 'bub.lan' },
      ]
    };
    mockClient.get
      .mockResolvedValueOnce({ data: { data: makeBackends([{ id: 10, name: 's1', address: 'catch.bub.lan', port: 80 }]) } })
      .mockResolvedValueOnce({ data: { data: [dnsEntry] } });
    await haproxy.auditBackends();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toMatch(/SHARED/);
  });

  test('hostname with <3 aliases stays named, not shared', async () => {
    const dnsEntry = {
      host: 'svc', domain: 'bub.lan',
      aliases: [{ host: 'alias1', domain: 'bub.lan' }],
    };
    mockClient.get
      .mockResolvedValueOnce({ data: { data: makeBackends([{ id: 10, name: 's1', address: 'svc.bub.lan', port: 80 }]) } })
      .mockResolvedValueOnce({ data: { data: [dnsEntry] } });
    await haproxy.auditBackends();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toMatch(/SERVICE HOSTNAME/);
    expect(output).not.toMatch(/SHARED/);
  });

  test('mixed: IP + named + shared counted correctly', async () => {
    const dnsEntry = { host: 'catch', domain: 'bub.lan', aliases: [{}, {}, {}] };
    const servers = [
      { id: 1, name: 's1', address: '10.0.0.1',    port: 80 },
      { id: 2, name: 's2', address: 'svc.bub.lan',  port: 80 },
      { id: 3, name: 's3', address: 'catch.bub.lan', port: 80 },
    ];
    mockClient.get
      .mockResolvedValueOnce({ data: { data: makeBackends(servers) } })
      .mockResolvedValueOnce({ data: { data: [dnsEntry] } });
    await haproxy.auditBackends();
    const lines = console.log.mock.calls.flat().join('\n');
    // Summary line contains "1 static IP", "1 service hostname", "1 shared"
    expect(lines).toMatch(/1.*static IP/i);
    expect(lines).toMatch(/1.*service hostname/i);
    expect(lines).toMatch(/1.*shared/i);
  });
});

// ---------------------------------------------------------------------------
// fixBackendDnsAddresses — dry-run vs apply
// ---------------------------------------------------------------------------
describe('fixBackendDnsAddresses', () => {
  const backend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: '10.0.0.5', port: 443 }] };

  test('dry-run: does not call patch', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.reverse.mockResolvedValue(['svc.bub.lan']);
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.5' });
    await haproxy.fixBackendDnsAddresses({ apply: false });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('apply: PATCHes with resolved hostname', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.reverse.mockResolvedValue(['svc.bub.lan']);
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.5' });
    await haproxy.fixBackendDnsAddresses({ apply: true });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend/server',
      expect.objectContaining({ parent_id: 1, id: 10, address: 'svc.bub.lan' })
    );
  });

  test('skips IP when reverse DNS returns non-.bub.lan hostname', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.reverse.mockResolvedValue(['external.example.com']);
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.5' });
    await haproxy.fixBackendDnsAddresses({ apply: true });
    expect(mockClient.patch).not.toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend/server',
      expect.anything()
    );
  });

  test('skips IP when reverse DNS forward-confirms different IP', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.reverse.mockResolvedValue(['svc.bub.lan']);
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.99' }); // mismatch
    await haproxy.fixBackendDnsAddresses({ apply: true });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('prints nothing-to-do when all servers already use hostnames', async () => {
    const hostnameBackend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: 'svc.bub.lan', port: 443 }] };
    mockClient.get.mockResolvedValue({ data: { data: [hostnameBackend] } });
    await haproxy.fixBackendDnsAddresses();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toContain('already hostnames');
  });
});

// ---------------------------------------------------------------------------
// fixBackendIpAddresses — dry-run vs apply
// ---------------------------------------------------------------------------
describe('fixBackendIpAddresses', () => {
  const backend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: 'svc.bub.lan', port: 443 }] };

  test('dry-run: does not call patch', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.5' });
    await haproxy.fixBackendIpAddresses({ apply: false });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('apply: PATCHes with resolved IP', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.lookup.mockResolvedValue({ address: '10.0.0.5' });
    await haproxy.fixBackendIpAddresses({ apply: true });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend/server',
      expect.objectContaining({ parent_id: 1, id: 10, address: '10.0.0.5' })
    );
  });

  test('skips unresolvable hostname', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    mockDns.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await haproxy.fixBackendIpAddresses({ apply: true });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('prints nothing-to-do when all servers already use IPs', async () => {
    const ipBackend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: '10.0.0.1', port: 443 }] };
    mockClient.get.mockResolvedValue({ data: { data: [ipBackend] } });
    await haproxy.fixBackendIpAddresses();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toContain('already IPs');
  });
});

// ---------------------------------------------------------------------------
// setBackendTimeouts
// ---------------------------------------------------------------------------
describe('setBackendTimeouts', () => {
  const backend = { id: 5, name: 'ghost-files', advanced_backend: '' };

  test('PATCHes connection_timeout and server_timeout', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.setBackendTimeouts({ name: 'ghost-files', connectTimeout: 5000, serverTimeout: 60000 });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend',
      expect.objectContaining({ id: 5, connection_timeout: '5000', server_timeout: '60000' })
    );
  });

  test('writes tunnel timeout into advanced_backend', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.setBackendTimeouts({ name: 'ghost-files', tunnelTimeout: 3600000 });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend',
      expect.objectContaining({ advanced_backend: 'timeout tunnel 3600000ms' })
    );
  });

  test('merges tunnel timeout, preserving other advanced_backend lines', async () => {
    const existing = { ...backend, advanced_backend: 'option http-server-close' };
    mockClient.get.mockResolvedValue({ data: { data: [existing] } });
    await haproxy.setBackendTimeouts({ name: 'ghost-files', tunnelTimeout: 3600000 });
    const patch = mockClient.patch.mock.calls[0][1];
    expect(patch.advanced_backend).toContain('option http-server-close');
    expect(patch.advanced_backend).toContain('timeout tunnel 3600000ms');
  });

  test('replaces existing timeout tunnel line', async () => {
    const existing = { ...backend, advanced_backend: 'timeout tunnel 1000ms\noption http-server-close' };
    mockClient.get.mockResolvedValue({ data: { data: [existing] } });
    await haproxy.setBackendTimeouts({ name: 'ghost-files', tunnelTimeout: 3600000 });
    const patch = mockClient.patch.mock.calls[0][1];
    expect(patch.advanced_backend).not.toContain('timeout tunnel 1000ms');
    expect(patch.advanced_backend).toContain('timeout tunnel 3600000ms');
  });

  test('throws when backend not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await expect(haproxy.setBackendTimeouts({ name: 'missing', tunnelTimeout: 1000 }))
      .rejects.toThrow('Backend not found: missing');
  });

  test('skips apply when apply=false', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.setBackendTimeouts({ name: 'ghost-files', tunnelTimeout: 3600000, apply: false });
    expect(mockClient.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// disableBackendResolver
// ---------------------------------------------------------------------------
describe('disableBackendResolver', () => {
  test('dry-run: lists servers with resolver but does not PATCH', async () => {
    const backend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: 'svc.bub.lan', port: 80, resolvers: 'local' }] };
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.disableBackendResolver({ apply: false });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('apply: clears resolvers field', async () => {
    const backend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: 'svc.bub.lan', port: 80, resolvers: 'local' }] };
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.disableBackendResolver({ apply: true });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/haproxy/backend/server',
      expect.objectContaining({ resolvers: '', resolver: '' })
    );
  });

  test('nothing-to-do when no servers have resolver set', async () => {
    const backend = { id: 1, name: 'be_svc', servers: [{ id: 10, name: 's1', address: '10.0.0.1', port: 80 }] };
    mockClient.get.mockResolvedValue({ data: { data: [backend] } });
    await haproxy.disableBackendResolver({ apply: true });
    expect(mockClient.patch).not.toHaveBeenCalled();
    const output = console.log.mock.calls.flat().join('\n');
    expect(output).toContain('Nothing to do');
  });
});
