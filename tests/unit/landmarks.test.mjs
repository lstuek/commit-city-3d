import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS } from '../../src/landmarks/registry.js';
import { LANDMARK_KEYS } from '../../src/data/city-data.js';

const EXPECTED_SITES = {
  portfolio: 'https://lincolnstuek.com',
  'new-era': 'https://new-era-design.com',
  'bionic-wave': 'https://bionicwave.ai',
  'ka-tech': 'https://katechairsoft.com',
  'ka-ops': null,
  aios: null,
  crm: null,
  systemselect: null,
};

test('the registry holds exactly the 8 landmark keys of the city data', () => {
  assert.deepEqual(LANDMARKS.map((l) => l.key), LANDMARK_KEYS);
});

for (const [key, site] of Object.entries(EXPECTED_SITES)) {
  test(`${key} has ${site ? `site ${site}` : 'no site'}, a name and one line`, () => {
    const l = LANDMARKS.find((x) => x.key === key);
    assert.equal(l.site, site);
    assert.ok(l.name.trim());
    assert.ok(l.line.trim() && !l.line.includes('\n'));
  });
}

test('no landmark text or link points to a repo', () => {
  for (const l of LANDMARKS) assert.doesNotMatch(JSON.stringify(l), /github|gitlab|bitbucket/i);
});
