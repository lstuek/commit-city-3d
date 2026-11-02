import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCityData } from '../../src/data/city-data.js';
import { panelModel, nearestLandmark } from '../../src/landmarks/panel.js';

const city = parseCityData(JSON.parse(await readFile(new URL('../fixtures/city.json', import.meta.url), 'utf8')));

test('a panel shows name, line, commits, last update, language and site', () => {
  assert.deepEqual(panelModel('portfolio', city), {
    key: 'portfolio', name: 'Portfolio', line: 'Placeholder line: Lincoln\'s portfolio site.',
    commits: '310', commits30d: '12', lastUpdate: 'pushed this week', language: 'TypeScript',
    site: 'https://lincolnstuek.com',
  });
});

test('a landmark not pushed this week shows its date; nulls show a dash; no site is null', () => {
  const m = panelModel('crm', city);
  assert.equal(m.commits30d, '—');
  assert.equal(m.lastUpdate, '—');
  assert.equal(m.site, null);
  assert.equal(panelModel('new-era', city).lastUpdate, '2026-09-02');
});

test('proximity picks the nearest landmark within the radius, else none', () => {
  const spots = [{ key: 'aios', x: 0, z: 0 }, { key: 'crm', x: 5, z: 0 }];
  assert.equal(nearestLandmark({ x: 4, z: 1 }, spots, 2), 'crm');
  assert.equal(nearestLandmark({ x: 1, z: 0 }, spots, 2), 'aios');
  assert.equal(nearestLandmark({ x: 2.5, z: 3 }, spots, 2), null);
});
