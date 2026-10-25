import { describe, expect, it } from 'vitest';
import { loadCity, type Fetcher } from './load-city';

function fakeFetcher(files: Record<string, unknown>, seen: string[] = []): Fetcher {
  return async (url) => {
    seen.push(url);
    if (!(url in files)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(files[url]), { status: 200 });
  };
}

const empty = { type: 'FeatureCollection', features: [] };
const required = (folder: string) => ({
  [`/data/${folder}/city.json`]: { city_id: folder, name: 'X', time_zone: 'America/Los_Angeles' },
  [`/data/${folder}/segments.geojson`]: empty,
  [`/data/${folder}/sweeping.geojson`]: empty,
  [`/data/${folder}/timed-parking.geojson`]: empty,
  [`/data/${folder}/restrictions.geojson`]: empty,
  [`/data/${folder}/curb-colors.geojson`]: empty,
  [`/data/${folder}/coverage.json`]: { city_id: folder, segment_ids: ['a'] },
  [`/data/${folder}/metadata.json`]: { city_id: folder, last_updated: '2026-10-24' },
  [`/data/${folder}/trim.json`]: { city_id: folder, segments: { a: { trim_start_m: 3.4, trim_end_m: 0, sliver: false, inner_L: true, inner_R: false } } },
});

describe('loadCity', () => {
  it('reads the sample folder for the sample set and returns typed data', async () => {
    const seen: string[] = [];
    const data = await loadCity('burbank', { dataSet: 'sample', baseUrl: '/data', fetcher: fakeFetcher(required('burbank-sample'), seen) });
    expect(data.city.time_zone).toBe('America/Los_Angeles');
    expect(data.coverage.segment_ids).toEqual(['a']);
    expect(data.trim.segments.a).toMatchObject({ trim_start_m: 3.4, inner_L: true });
    expect(data.metadata.last_updated).toBe('2026-10-24');
    expect(data.zoning).toBeNull();
    expect(data.curbColorConfig).toBeNull();
    expect(seen.every((u) => u.startsWith('/data/burbank-sample/'))).toBe(true);
  });

  it('reads the plain folder for the real set and picks up optional files', async () => {
    const files = { ...required('burbank'), '/data/burbank/zoning.geojson': empty };
    const data = await loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(files) });
    expect(data.zoning).toEqual(empty);
  });

  it('fails with the url when a required file is missing', async () => {
    const files = required('burbank');
    delete files['/data/burbank/coverage.json'];
    await expect(loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(files) })).rejects.toThrow(/burbank\/coverage\.json.*404/);
  });

  it('fails with the url when trim.json is missing', async () => {
    const files = required('burbank');
    delete files['/data/burbank/trim.json'];
    await expect(loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(files) })).rejects.toThrow(/burbank\/trim\.json.*404/);
  });

  it('fails with the url when metadata.json is missing', async () => {
    const files = required('burbank');
    delete files['/data/burbank/metadata.json'];
    await expect(loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(files) })).rejects.toThrow(/burbank\/metadata\.json.*404/);
  });

  it('reads blocks.json when the city has one, and returns null when it does not (task M5-5)', async () => {
    const without = await loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(required('burbank')) });
    expect(without.blocks).toBeNull();
    const blocks = { city_id: 'burbank', blocks: { a: 1200, b: null } };
    const files = { ...required('burbank'), '/data/burbank/blocks.json': blocks };
    const withBlocks = await loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher: fakeFetcher(files) });
    expect(withBlocks.blocks).toEqual(blocks);
  });

  it('treats an HTML answer for an optional file as absent', async () => {
    const fetcher: Fetcher = async (url) =>
      url.endsWith('zoning.geojson') ? new Response('<html>', { status: 200 }) : fakeFetcher(required('burbank'))(url);
    const data = await loadCity('burbank', { dataSet: 'real', baseUrl: '/data', fetcher });
    expect(data.zoning).toBeNull();
  });
});
