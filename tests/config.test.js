'use strict';

const mockClient = {
  get:    jest.fn(),
  delete: jest.fn(),
};

jest.mock('../lib/pfsense', () => ({
  getPfSenseClient: jest.fn(() => mockClient),
}));

const config = require('../lib/config');

// Pull internal pure helpers out via a small inline re-implementation so we
// can test them without exporting them from the module.
// fmtSize and fmtAge are tested implicitly via listConfigHistory output.

const now = Math.floor(Date.now() / 1000);

const REVS = [
  { time: now - 100,    description: 'recent change',  version: '2.7.0', filesize: 1024 },
  { time: now - 86500,  description: 'day-old change',  version: '2.7.0', filesize: 2048 },
  { time: now - 432000, description: 'five-day-old',    version: '2.6.0', filesize: 512  },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockClient.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  console.log.mockRestore();
});

// ---------------------------------------------------------------------------
// listConfigHistory
// ---------------------------------------------------------------------------
describe('listConfigHistory', () => {
  test('returns all revisions sorted newest first', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [...REVS].reverse() } });
    const result = await config.listConfigHistory();
    expect(result[0].description).toBe('recent change');
    expect(result[result.length - 1].description).toBe('five-day-old');
  });

  test('respects limit', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    const result = await config.listConfigHistory({ limit: 2 });
    expect(result).toHaveLength(2);
  });

  test('prints no-history message on empty list', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await config.listConfigHistory();
    expect(console.log).toHaveBeenCalledWith('No config history revisions found.');
  });

  test('output contains age suffixes', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    await config.listConfigHistory();
    const out = console.log.mock.calls.flat().join('\n');
    // recent entry is <60s → "Xs ago" or "Xm ago"; five-day-old → "Xd ago"
    expect(out).toMatch(/\d+(s|m|h|d) ago/);
  });

  test('output includes file size with unit', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    await config.listConfigHistory();
    const out = console.log.mock.calls.flat().join('\n');
    expect(out).toMatch(/\d+\.\d+(K|M)/);
  });
});

// ---------------------------------------------------------------------------
// pruneConfigHistory — keepLast
// ---------------------------------------------------------------------------
describe('pruneConfigHistory — keepLast', () => {
  test('deletes all beyond keepLast (newest first)', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    await config.pruneConfigHistory({ keepLast: 1 });
    // REVS has 3 entries; keepLast=1 → 2 deletions
    expect(mockClient.delete).toHaveBeenCalledTimes(2);
  });

  test('deletes nothing when keepLast >= total', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    await config.pruneConfigHistory({ keepLast: 10 });
    expect(mockClient.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pruneConfigHistory — olderThanDays
// ---------------------------------------------------------------------------
describe('pruneConfigHistory — olderThanDays', () => {
  test('deletes revisions older than threshold', async () => {
    mockClient.get.mockResolvedValue({ data: { data: REVS } });
    // five-day-old is ~5d; threshold 3d → only that one deleted
    await config.pruneConfigHistory({ olderThanDays: 3 });
    expect(mockClient.delete).toHaveBeenCalledTimes(1);
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/v2/diagnostics/config_history/revision',
      { data: { time: REVS[2].time } }
    );
  });

  test('deletes nothing when all revisions are recent', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [REVS[0]] } }); // 100s old
    await config.pruneConfigHistory({ olderThanDays: 1 });
    expect(mockClient.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pruneConfigHistory — validation
// ---------------------------------------------------------------------------
describe('pruneConfigHistory — validation', () => {
  test('throws when neither option provided', async () => {
    await expect(config.pruneConfigHistory({})).rejects.toThrow('Either --older-than or --keep-last is required');
  });

  test('prints no-revisions message on empty history', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [] } });
    await config.pruneConfigHistory({ keepLast: 5 });
    expect(console.log).toHaveBeenCalledWith('No config history revisions to prune.');
    expect(mockClient.delete).not.toHaveBeenCalled();
  });
});
