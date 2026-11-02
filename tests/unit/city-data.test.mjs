import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCityData, formatValue, DASH, isStale, loadCityData } from '../../src/data/city-data.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/city.json', import.meta.url), 'utf8'));

test('valid city data parses with its numbers intact', () => {
  const city = parseCityData(fixture);
  assert.equal(city.generated_at, '2026-10-28T06:00:00Z');
  assert.deepEqual(city.totals, { tokens: 123456789, commits: 4321, top_language: 'TypeScript' });
  assert.deepEqual(city.landmarks.portfolio, {
    commits_total: 310, commits_30d: 12, pushed_this_week: true, last_push_date: '2026-10-27', language: 'TypeScript',
  });
  assert.equal(city.locked.activity_30d, 57);
});

test('a null or missing value stays null and shows a dash, never 0', () => {
  const city = parseCityData({ ...fixture, totals: { tokens: null, commits: 'x' } });
  assert.equal(city.totals.tokens, null);
  assert.equal(city.totals.commits, null);
  assert.equal(city.totals.top_language, null);
  assert.equal(city.landmarks.crm.commits_30d, null);
  assert.equal(formatValue(null), '—');
  assert.equal(DASH, '—');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(123456789), '123,456,789');
  assert.equal(formatValue('TypeScript'), 'TypeScript');
});

test('data older than 36 hours is stale; newer data is not', () => {
  const city = parseCityData(fixture); // generated 2026-10-28T06:00:00Z
  assert.equal(isStale(city, Date.parse('2026-10-29T18:00:00Z')), false); // exactly 36 h
  assert.equal(isStale(city, Date.parse('2026-10-29T18:00:01Z')), true);
  assert.equal(isStale(city, Date.parse('2026-10-28T07:00:00Z')), false);
});

const bundled = { ...fixture, generated_at: '2026-10-01T00:00:00Z' };
const respond = (status, body) => async () => new Response(body, { status });

test('a good fetch returns the live data', async () => {
  const r = await loadCityData('https://x/city.json', bundled, { fetch: respond(200, JSON.stringify(fixture)) });
  assert.equal(r.source, 'live');
  assert.equal(r.city.generated_at, '2026-10-28T06:00:00Z');
});

for (const [why, fetch] of [
  ['a network error', async () => { throw new TypeError('Failed to fetch'); }],
  ['an HTTP 404', respond(404, 'not found')],
  ['a body that is not JSON', respond(200, '<html>')],
  ['JSON that is not city data', respond(200, '{"generated_at":"yesterday"}')],
  ['a JSON array', respond(200, '[]')],
]) {
  test(`${why} falls back to the bundled copy`, async () => {
    const r = await loadCityData('https://x/city.json', bundled, { fetch });
    assert.equal(r.source, 'fallback');
    assert.equal(r.city.generated_at, '2026-10-01T00:00:00Z');
    assert.equal(r.city.totals.commits, 4321);
  });
}

test('the bundled fallback copy is valid city data and holds no zeros in place of unknowns', async () => {
  const raw = JSON.parse(await readFile(new URL('../../src/data/fallback.json', import.meta.url), 'utf8'));
  const city = parseCityData(raw);
  for (const v of Object.values(city.totals)) assert.notEqual(formatValue(v), '0');
  assert.equal(formatValue(city.totals.commits), '—');
});
