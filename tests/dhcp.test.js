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

const dhcp = require('../lib/dhcp');

const SERVERS = [
  {
    id: 'LAN', staticmap: [
      { id: 'sm0', parent_id: 'LAN', mac: 'aa:bb:cc:dd:ee:01', ipaddr: '10.0.0.10', hostname: 'host-a', descr: 'server A' },
      { id: 'sm1', parent_id: 'LAN', mac: 'aa:bb:cc:dd:ee:02', ipaddr: '10.0.0.11', hostname: 'host-b', descr: '' },
    ]
  },
  {
    id: 'OPT1', staticmap: [
      { id: 'sm2', parent_id: 'OPT1', mac: 'aa:bb:cc:dd:ee:03', ipaddr: '10.1.0.5', hostname: 'host-c', descr: 'server C' },
    ]
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.get.mockResolvedValue({ data: { data: SERVERS } });
  mockClient.post.mockResolvedValue({ data: {} });
  mockClient.patch.mockResolvedValue({ data: {} });
  mockClient.delete.mockResolvedValue({ data: {} });
});

// ---------------------------------------------------------------------------
// listStaticMappings
// ---------------------------------------------------------------------------
describe('listStaticMappings', () => {
  test('lists all mappings across interfaces', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.listStaticMappings();
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('host-a');
    expect(output).toContain('host-c');
    spy.mockRestore();
  });

  test('filters by hostname substring', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.listStaticMappings({ filter: 'host-a' });
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('host-a');
    expect(output).not.toContain('host-c');
    spy.mockRestore();
  });

  test('filters by MAC', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.listStaticMappings({ filter: 'ee:03' });
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('host-c');
    expect(output).not.toContain('host-a');
    spy.mockRestore();
  });

  test('restricts to a single interface when iface given', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.listStaticMappings({ iface: 'OPT1' });
    const output = spy.mock.calls.flat().join('\n');
    expect(output).toContain('host-c');
    expect(output).not.toContain('host-a');
    spy.mockRestore();
  });

  test('prints no-mappings message when filter matches nothing', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.listStaticMappings({ filter: 'zzz' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No static mappings matching'));
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// addStaticMapping
// ---------------------------------------------------------------------------
describe('addStaticMapping', () => {
  test('POSTs and applies on correct interface', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.addStaticMapping({ iface: 'LAN', mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.50', hostname: 'new-host' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/static_mapping',
      expect.objectContaining({ parent_id: 'LAN', mac: 'aa:bb:cc:dd:ee:ff', ipaddr: '10.0.0.50' })
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/apply',
      { interface: 'LAN' }
    );
    console.log.mockRestore();
  });

  test('lowercases MAC address', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.addStaticMapping({ iface: 'LAN', mac: 'AA:BB:CC:DD:EE:FF' });
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/static_mapping',
      expect.objectContaining({ mac: 'aa:bb:cc:dd:ee:ff' })
    );
    console.log.mockRestore();
  });

  test('throws when iface missing', async () => {
    await expect(dhcp.addStaticMapping({ mac: 'aa:bb:cc:dd:ee:ff' }))
      .rejects.toThrow('--interface is required');
  });

  test('throws when mac missing', async () => {
    await expect(dhcp.addStaticMapping({ iface: 'LAN' }))
      .rejects.toThrow('--mac is required');
  });
});

// ---------------------------------------------------------------------------
// updateStaticMapping
// ---------------------------------------------------------------------------
describe('updateStaticMapping', () => {
  test('PATCHes existing entry by MAC', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.updateStaticMapping({ iface: 'LAN', mac: 'aa:bb:cc:dd:ee:01', ip: '10.0.0.99' });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/static_mapping',
      expect.objectContaining({ id: 'sm0', parent_id: 'LAN', ipaddr: '10.0.0.99' })
    );
    console.log.mockRestore();
  });

  test('MAC lookup is case-insensitive', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.updateStaticMapping({ iface: 'LAN', mac: 'AA:BB:CC:DD:EE:01', hostname: 'renamed' });
    expect(mockClient.patch).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/static_mapping',
      expect.objectContaining({ hostname: 'renamed' })
    );
    console.log.mockRestore();
  });

  test('throws when MAC not found', async () => {
    await expect(dhcp.updateStaticMapping({ iface: 'LAN', mac: 'ff:ff:ff:ff:ff:ff' }))
      .rejects.toThrow('No static mapping found for MAC');
  });
});

// ---------------------------------------------------------------------------
// deleteStaticMapping
// ---------------------------------------------------------------------------
describe('deleteStaticMapping', () => {
  test('DELETEs correct entry', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await dhcp.deleteStaticMapping({ iface: 'LAN', mac: 'aa:bb:cc:dd:ee:02' });
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/services/dhcp_server/static_mapping',
      { data: { id: 'sm1', parent_id: 'LAN' } }
    );
    console.log.mockRestore();
  });

  test('throws when MAC not found', async () => {
    await expect(dhcp.deleteStaticMapping({ iface: 'LAN', mac: 'de:ad:be:ef:00:00' }))
      .rejects.toThrow('No static mapping found for MAC');
  });
});
