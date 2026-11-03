// Test af kommandoen: rapport, JSON og afslutningskode 2 ved brud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeInput, makeAnswer, studentsOf, ids } from './helpers.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function files() {
  const dir = mkdtempSync(join(tmpdir(), 'dommer-'));
  const input = makeInput({ students: studentsOf(8, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })), rules: [{ type: 'distribute', column: 'Køn' }] });
  writeFileSync(join(dir, 'in.json'), JSON.stringify(input));
  writeFileSync(join(dir, 'ok.json'), JSON.stringify(makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)])));
  writeFileSync(join(dir, 'bad.json'), JSON.stringify(makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7)])));
  return dir;
}

test('et gyldigt svar: rapport og kode 0', () => {
  const dir = files();
  const result = run(join(dir, 'in.json'), join(dir, 'ok.json'));
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Faste krav: alle overholdt/);
  assert.match(result.stdout, /Fordel på "Køn"/);
});

test('et svar, der bryder de faste krav: stor advarsel og kode 2', () => {
  const dir = files();
  const result = run(join(dir, 'in.json'), join(dir, 'bad.json'));
  assert.equal(result.status, 2);
  assert.match(result.stdout, /FASTE KRAV BRUDT/);
});

test('JSON-tilstand giver hele karakteren', () => {
  const dir = files();
  const result = run(join(dir, 'in.json'), join(dir, 'ok.json'), '--json');
  const grade = JSON.parse(result.stdout);
  assert.equal(grade.status, 'ok');
  assert.ok(Array.isArray(grade.precedence.vector));
});

test('batch og compare over mapper', () => {
  const dir = files();
  const inputs = join(dir, 'inputs');
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  for (const d of [inputs, a, b]) mkdirSync(d);
  const input = makeInput({ students: studentsOf(8, (i) => ({ Køn: i <= 4 ? 'Pige' : 'Dreng' })), rules: [{ type: 'distribute', column: 'Køn' }] });
  writeFileSync(join(inputs, '001-x.json'), JSON.stringify(input));
  writeFileSync(join(a, '001-x.seed1.json'), JSON.stringify(makeAnswer([ids(1, 2, 5, 6), ids(3, 4, 7, 8)])));
  writeFileSync(join(b, '001-x.seed1.json'), JSON.stringify(makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)])));
  const lines = run('batch', inputs, a, '--json').stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].answer, '001-x.seed1.json');
  const compared = JSON.parse(run('compare', inputs, a, b, '--json').stdout.trim());
  assert.equal(compared.heavy, 'same');
  assert.equal(compared.goals, 'better');
});

test('compare: et "umulig" uden grund hos A er dårligere og giver kode 2', () => {
  const dir = files();
  const inputs = join(dir, 'inputs');
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  for (const d of [inputs, a, b]) mkdirSync(d);
  const input = makeInput({ students: studentsOf(8, (i) => ({ Køn: i <= 4 ? 'Pige' : 'Dreng' })), rules: [{ type: 'distribute', column: 'Køn' }] });
  writeFileSync(join(inputs, '001-x.json'), JSON.stringify(input));
  writeFileSync(join(a, '001-x.json'), JSON.stringify({ contractVersion: 2, status: 'impossible', groups: null, messages: [] }));
  writeFileSync(join(b, '001-x.json'), JSON.stringify(makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)])));
  const result = run('compare', inputs, a, b);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /dårligere 1/);
  assert.match(result.stdout, /bryder de faste krav/);
  const line = JSON.parse(run('compare', inputs, a, b, '--json').stdout.trim());
  assert.equal(line.heavy, 'worse');
});

test('compare --known: B er ikke målestok for kendte forskelle; A skal stadig holde de faste krav', () => {
  const dir = files();
  const inputs = join(dir, 'inputs');
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  for (const d of [inputs, a, b]) mkdirSync(d);
  const input = makeInput({ students: studentsOf(8, (i) => ({ Køn: i <= 4 ? 'Pige' : 'Dreng' })), rules: [{ type: 'distribute', column: 'Køn' }] });
  writeFileSync(join(inputs, '001-x.json'), JSON.stringify(input));
  writeFileSync(join(a, '001-x.json'), JSON.stringify(makeAnswer([ids(1, 2, 3, 4), ids(5, 6, 7, 8)])));
  writeFileSync(join(b, '001-x.json'), JSON.stringify(makeAnswer([ids(1, 2, 3), ids(4, 5, 6, 7, 8)])));
  const knownFile = join(dir, 'known.json');
  writeFileSync(knownFile, JSON.stringify({ inputs: { '001-x.json': { kind: 'bevidst forbedring', reason: 'test' } } }));
  const result = run('compare', inputs, a, b, '--known', knownFile);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Kendte forskelle.*001-x\.json/);
  assert.doesNotMatch(result.stdout, /B's svar bryder/);
  writeFileSync(join(a, '001-x.json'), JSON.stringify(makeAnswer([ids(1, 2, 3), ids(4, 5, 6, 7, 8)])));
  assert.equal(run('compare', inputs, a, b, '--known', knownFile).status, 2);
});
