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

const dns = require('../lib/dns');

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.post.mockResolvedValue({ data: { code: 200 } });
});

// ---------------------------------------------------------------------------
// listEntries
// ---------------------------------------------------------------------------
describe('listEntries', () => {
  test('prints all entries when no filter', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [
      { host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'], descr: '', aliases: [] },
      { host: 'db',  domain: 'bub.lan', ip: ['10.0.0.2'], descr: '', aliases: [] },
    ] } });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.listEntries();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('filters by host substring', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [
      { host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'], descr: '', aliases: [] },
      { host: 'db',  domain: 'bub.lan', ip: ['10.0.0.2'], descr: '', aliases: [] },
    ] } });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.listEntries('web');
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('web');
    expect(output).not.toContain('db');
    spy.mockRestore();
  });

  test('prints nothing-found message for empty result set', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.listEntries();
    expect(spy).toHaveBeenCalledWith('No entries found.');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// addEntry
// ---------------------------------------------------------------------------
describe('addEntry', () => {
  test('POSTs correct payload and applies', async () => {
    mockClient.post.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.addEntry({ host: 'svc', domain: 'bub.lan', ip: '10.0.0.5', description: 'test' });

    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dns_resolver/host_override',
      expect.objectContaining({ host: 'svc', domain: 'bub.lan', ip: ['10.0.0.5'], descr: 'test' })
    );
    expect(mockClient.post).toHaveBeenCalledWith('/api/v2/services/dns_resolver/apply');
    console.log.mockRestore();
  });

  test('wraps single IP in array', async () => {
    mockClient.post.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.addEntry({ host: 'svc', domain: 'bub.lan', ip: '10.0.0.5' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dns_resolver/host_override',
      expect.objectContaining({ ip: ['10.0.0.5'] })
    );
    console.log.mockRestore();
  });

  test('preserves array IP as-is', async () => {
    mockClient.post.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.addEntry({ host: 'svc', domain: 'bub.lan', ip: ['10.0.0.5', '10.0.0.6'] });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dns_resolver/host_override',
      expect.objectContaining({ ip: ['10.0.0.5', '10.0.0.6'] })
    );
    console.log.mockRestore();
  });

  test('throws on API error code', async () => {
    mockClient.post.mockResolvedValue({ data: { code: 500, message: 'duplicate' } });
    await expect(dns.addEntry({ host: 'svc', domain: 'bub.lan', ip: '1.2.3.4' }))
      .rejects.toThrow('duplicate');
  });
});

// ---------------------------------------------------------------------------
// deleteEntry
// ---------------------------------------------------------------------------
describe('deleteEntry', () => {
  test('finds entry by host+domain and DELETEs by index', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [
      { host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'] },
      { host: 'db',  domain: 'bub.lan', ip: ['10.0.0.2'] },
    ] } });
    mockClient.delete.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.deleteEntry('db', 'bub.lan');
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/services/dns_resolver/host_override',
      { data: { id: 1 } }
    );
    console.log.mockRestore();
  });

  test('throws when entry not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await expect(dns.deleteEntry('missing', 'bub.lan'))
      .rejects.toThrow('Entry not found: missing.bub.lan');
  });
});

// ---------------------------------------------------------------------------
// addAlias / deleteAlias
// ---------------------------------------------------------------------------
describe('addAlias', () => {
  const entries = [
    { host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'], descr: '', aliases: [] },
  ];

  test('appends alias and PATCHes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: entries } });
    mockClient.patch.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.addAlias({ host: 'web', domain: 'bub.lan', aliasHost: 'www', aliasDomain: 'bub.lan' });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/dns_resolver/host_override',
      expect.objectContaining({ aliases: [{ host: 'www', domain: 'bub.lan', descr: '' }] })
    );
    console.log.mockRestore();
  });

  test('skips when alias already exists', async () => {
    const withAlias = [{ ...entries[0], aliases: [{ host: 'www', domain: 'bub.lan', descr: '' }] }];
    mockClient.get.mockResolvedValue({ data: { data: withAlias } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.addAlias({ host: 'web', domain: 'bub.lan', aliasHost: 'www', aliasDomain: 'bub.lan' });
    expect(mockClient.patch).not.toHaveBeenCalled();
    console.log.mockRestore();
  });

  test('throws when parent not found', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await expect(dns.addAlias({ host: 'missing', domain: 'bub.lan', aliasHost: 'a', aliasDomain: 'bub.lan' }))
      .rejects.toThrow('Parent entry not found');
  });
});

describe('deleteAlias', () => {
  test('removes alias and PATCHes', async () => {
    const entries = [
      { host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'], descr: '',
        aliases: [{ host: 'www', domain: 'bub.lan', descr: '' }, { host: 'cdn', domain: 'bub.lan', descr: '' }] },
    ];
    mockClient.get.mockResolvedValue({ data: { data: entries } });
    mockClient.patch.mockResolvedValue({ data: { code: 200 } });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dns.deleteAlias({ host: 'web', domain: 'bub.lan', aliasHost: 'www', aliasDomain: 'bub.lan' });
    const patchCall = mockClient.patch.mock.calls[0][1];
    expect(patchCall.aliases).toHaveLength(1);
    expect(patchCall.aliases[0].host).toBe('cdn');
    console.log.mockRestore();
  });

  test('throws when alias not found', async () => {
    const entries = [{ host: 'web', domain: 'bub.lan', ip: ['10.0.0.1'], descr: '', aliases: [] }];
    mockClient.get.mockResolvedValue({ data: { data: entries } });
    await expect(dns.deleteAlias({ host: 'web', domain: 'bub.lan', aliasHost: 'missing', aliasDomain: 'bub.lan' }))
      .rejects.toThrow('Alias not found');
  });
});
