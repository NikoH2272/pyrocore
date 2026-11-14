const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const path = require('node:path');

// Exercise the actual admin helpers without a DOM, database or staff session.
const source = fs.readFileSync(path.join(__dirname, '../assets/admin.js'), 'utf8');
const common = fs.readFileSync(path.join(__dirname, '../assets/common.js'), 'utf8');
const context = vm.createContext({
  window: {},
  crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  addEventListener() {},
});
vm.runInContext(common + '\nglobalThis.shared = PYROCORE;', context);
vm.runInContext(`
  const { STATES, PHASES } = PYROCORE;
  const SPONSOR_SLOTS = 18;
  ${source.slice(source.indexOf('  const uuid ='), source.indexOf('  const TOKEN_KEY'))}
  globalThis.helpers = { uuid, normalize };
`, context);
const { uuid, normalize } = context.helpers;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('initializes missing or malformed data without randomUUID', () => {
  for (const input of [undefined, null, false, 'bad', [], {}, {
    tournament: [], links: 42, prizes: {}, schedule: 'bad', results: false, sponsors: {},
  }]) {
    const result = normalize(input);
    assert.equal(result.tournament.state, 'abierto');
    assert.equal(result.tournament.rulesText, context.shared.DEFAULT_RULES.rulesText);
    assert.equal(result.sponsors.length, 18);
    assert.ok(result.sponsors.every(s => uuidPattern.test(s.id)));
    assert.equal(result.results.length, 0);
  }
});

test('repairs nested records so ranking and rendering can use them', () => {
  const result = normalize({
    tournament: { state: 'toString' },
    schedule: [null, 5, { group: 123 }],
    results: [null, { rows: null }, { title: 5, rows: [null, false, { team: 123 }, { team: 'Team A', kills: 5 }] }],
    sponsors: [null, { logo: 123 }],
  });
  assert.equal(result.tournament.state, 'abierto');
  assert.equal(result.schedule.length, 1);
  assert.equal(result.schedule[0].group, '');
  assert.equal(result.results[0].rows.length, 0);
  assert.equal(result.results[1].title, '');
  assert.equal(result.results[1].rows[0].team, '');
  assert.equal(result.sponsors[0].logo, '');
  const ranking = context.shared.generalRows(result.results, context.shared.PHASES[0]);
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].team, 'Team A');
  assert.equal(context.shared.total(ranking[0]), 5);
});

test('preserves valid data, extra sponsors and identifiers across repeated normalization', () => {
  const input = JSON.parse(fs.readFileSync(path.join(__dirname, '../data.json'), 'utf8'));
  input.tournament.rulesText = '';
  input.results = [{ id: uuid(), title: 'Grupo A', phase: 'Final', rows: [{ id: uuid(), team: 'Team A', kills: 9 }] }];
  input.sponsors = Array.from({ length: 20 }, () => ({ id: uuid(), name: 'Sponsor', logo: '', url: '' }));
  const original = JSON.stringify(input);
  assert.equal(JSON.stringify(normalize(input)), original);
  assert.equal(JSON.stringify(normalize(input)), original);
  const empty = normalize({});
  const first = JSON.stringify(empty);
  assert.equal(JSON.stringify(normalize(empty)), first);
});

test('fallback produces distinct UUID v4 identifiers', () => {
  const ids = Array.from({ length: 10000 }, uuid);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => uuidPattern.test(id)));
});
