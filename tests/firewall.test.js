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

const fw = require('../lib/firewall');

const ALIASES = [
  { id: 1, name: 'dns_servers',   type: 'host', descr: 'DNS servers', address: ['8.8.8.8', '1.1.1.1'], detail: ['google', 'cloudflare'] },
  { id: 2, name: 'blocked_hosts', type: 'host', descr: 'block list',  address: ['10.0.0.99'],           detail: ['bad actor'] },
];

const RULES = [
  { id: 0, type: 'pass',  interface: ['LAN'],  descr: 'allow DNS',   source: 'any', destination: 'any', protocol: 'udp' },
  { id: 1, type: 'block', interface: ['WAN'],  descr: 'block telnet', source: 'any', destination: 'any', protocol: 'tcp' },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockClient.post.mockResolvedValue({ data: { data: { id: 99 } } });
  mockClient.patch.mockResolvedValue({ data: {} });
  mockClient.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  console.log.mockRestore();
});

// ---------------------------------------------------------------------------
// listAliases
// ---------------------------------------------------------------------------
describe('listAliases', () => {
  test('lists all aliases', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.listAliases();
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('dns_servers');
    expect(out).toContain('blocked_hosts');
  });

  test('filters by name substring', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.listAliases({ filter: 'dns' });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('dns_servers');
    expect(out).not.toContain('blocked_hosts');
  });

  test('prints no-match message on empty result', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.listAliases({ filter: 'zzz' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No aliases matching'));
  });
});

// ---------------------------------------------------------------------------
// createOrUpdateAlias
// ---------------------------------------------------------------------------
describe('createOrUpdateAlias', () => {
  test('creates new alias with POST when not existing', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await fw.createOrUpdateAlias({ name: 'new_alias', hosts: ['10.0.0.1'] });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/firewall/alias',
      expect.objectContaining({ name: 'new_alias', address: ['10.0.0.1'] })
    );
  });

  test('updates existing alias with PATCH', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.createOrUpdateAlias({ name: 'dns_servers', hosts: ['8.8.8.8', '9.9.9.9'] });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/firewall/alias',
      expect.objectContaining({ id: 1, address: ['8.8.8.8', '9.9.9.9'] })
    );
  });

  test('strips /32 CIDR suffix from hosts', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await fw.createOrUpdateAlias({ name: 'test', hosts: ['10.0.0.1/32'] });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/firewall/alias',
      expect.objectContaining({ address: ['10.0.0.1'] })
    );
  });
});

// ---------------------------------------------------------------------------
// addAliasHost
// ---------------------------------------------------------------------------
describe('addAliasHost', () => {
  test('appends host and PATCHes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.addAliasHost({ name: 'dns_servers', host: '9.9.9.9', detail: 'quad9' });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/firewall/alias',
      expect.objectContaining({ id: 1, address: expect.arrayContaining(['9.9.9.9']) })
    );
  });

  test('skips if host already in alias', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.addAliasHost({ name: 'dns_servers', host: '8.8.8.8' });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('strips CIDR before checking/adding', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.addAliasHost({ name: 'dns_servers', host: '8.8.8.8/32' });
    // 8.8.8.8 already exists → no patch
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('throws when alias not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await expect(fw.addAliasHost({ name: 'missing', host: '1.2.3.4' }))
      .rejects.toThrow('Alias not found: missing');
  });
});

// ---------------------------------------------------------------------------
// removeAliasHost
// ---------------------------------------------------------------------------
describe('removeAliasHost', () => {
  test('removes host and PATCHes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.removeAliasHost({ name: 'dns_servers', host: '8.8.8.8' });
    const patch = mockClient.patch.mock.calls[0][1];
    expect(patch.address).not.toContain('8.8.8.8');
    expect(patch.address).toContain('1.1.1.1');
  });

  test('skips if host not in alias', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.removeAliasHost({ name: 'dns_servers', host: '5.5.5.5' });
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('throws when alias not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await expect(fw.removeAliasHost({ name: 'missing', host: '1.1.1.1' }))
      .rejects.toThrow('Alias not found: missing');
  });
});

// ---------------------------------------------------------------------------
// deleteAlias
// ---------------------------------------------------------------------------
describe('deleteAlias', () => {
  test('DELETEs by alias id', async () => {
    mockClient.get.mockResolvedValue({ data: { data: ALIASES } });
    await fw.deleteAlias({ name: 'blocked_hosts' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/firewall/alias',
      { data: { id: 2 } }
    );
  });

  test('skips gracefully when alias not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await fw.deleteAlias({ name: 'missing' });
    expect(mockClient.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------
describe('listRules', () => {
  test('filters by description substring', async () => {
    mockClient.get.mockResolvedValue({ data: { data: RULES } });
    await fw.listRules({ filter: 'DNS' });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('allow DNS');
    expect(out).not.toContain('block telnet');
  });

  test('filters by interface', async () => {
    mockClient.get.mockResolvedValue({ data: { data: RULES } });
    await fw.listRules({ iface: 'WAN' });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('block telnet');
    expect(out).not.toContain('allow DNS');
  });

  test('filters by type', async () => {
    mockClient.get.mockResolvedValue({ data: { data: RULES } });
    await fw.listRules({ type: 'block' });
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toContain('block telnet');
    expect(out).not.toContain('allow DNS');
  });

  test('prints no-match message when nothing found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await fw.listRules();
    expect(console.log).toHaveBeenCalledWith('No firewall rules found matching criteria.');
  });
});

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------
describe('deleteRule', () => {
  test('deletes by numeric id directly', async () => {
    await fw.deleteRule({ id: 5 });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/firewall/rule',
      { data: { id: 5 } }
    );
  });

  test('looks up id by description then deletes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: RULES } });
    await fw.deleteRule({ description: 'allow DNS' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/firewall/rule',
      { data: { id: 0 } }
    );
  });

  test('throws when description matches no rule', async () => {
    mockClient.get.mockResolvedValue({ data: { data: RULES } });
    await expect(fw.deleteRule({ description: 'nonexistent' }))
      .rejects.toThrow('No rule found with description');
  });

  test('throws when description matches multiple rules', async () => {
    const dupRules = [
      { id: 0, descr: 'dup rule', type: 'pass', interface: ['LAN'] },
      { id: 1, descr: 'dup rule', type: 'pass', interface: ['LAN'] },
    ];
    mockClient.get.mockResolvedValue({ data: { data: dupRules } });
    await expect(fw.deleteRule({ description: 'dup rule' }))
      .rejects.toThrow('Multiple rules match');
  });

  test('throws when neither id nor description given', async () => {
    await expect(fw.deleteRule({})).rejects.toThrow('Either --id or --description is required');
  });
});

// ---------------------------------------------------------------------------
// deletePortForward
// ---------------------------------------------------------------------------
describe('deletePortForward', () => {
  const FORWARDS = [
    { id: 10, descr: 'ssh forward', interface: 'WAN', destination_port: '22', target: '10.0.0.5' },
    { id: 11, descr: 'http forward', interface: 'WAN', destination_port: '80', target: '10.0.0.5' },
  ];

  test('deletes by id directly', async () => {
    await fw.deletePortForward({ id: 10 });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/firewall/nat/port_forward',
      { data: { id: 10 } }
    );
  });

  test('looks up by description then deletes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: FORWARDS } });
    await fw.deletePortForward({ description: 'ssh forward' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/firewall/nat/port_forward',
      { data: { id: 10 } }
    );
  });

  test('throws when description matches multiple forwards', async () => {
    const dups = [
      { id: 10, descr: 'dup', interface: 'WAN' },
      { id: 11, descr: 'dup', interface: 'WAN' },
    ];
    mockClient.get.mockResolvedValue({ data: { data: dups } });
    await expect(fw.deletePortForward({ description: 'dup' }))
      .rejects.toThrow('Multiple port forwards match');
  });
});
