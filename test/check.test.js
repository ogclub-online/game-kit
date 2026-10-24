// The checks catch what they should: a copy of the template with forbidden things in it fails `npm run check`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, appendFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Next to games/ (so the copies' ../../engine imports still resolve); removed afterwards.
const made = [];
const fresh = () => { const d = mkdtempSync(join(ROOT, '.check-')); made.push(d); return d; };
process.on('exit', () => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const check = (dir) => spawnSync(process.execPath, [join(ROOT, 'scripts/check.js')], { env: { ...process.env, KIT_GAMES: dir }, encoding: 'utf8' });

test('a clean copy of the template passes', () => {
  const dir = fresh(); cpSync(join(ROOT, 'games/template'), join(dir, 'template'), { recursive: true });
  assert.equal(check(dir).status, 0);
});
test('network, wallets, storage, HTML strings, outside links, stray imports and off-prefix messages all fail', () => {
  const dir = fresh(); cpSync(join(ROOT, 'games/template'), join(dir, 'template'), { recursive: true });
  const c = join(dir, 'template/client.js');
  appendFileSync(c, `\nexport function sneaky(){ fetch('/x'); window.ethereum.request({ method: 'eth_sendTransaction' }); localStorage.x = 1; document.body.innerHTML = '<b>'; send({ t: 'buyNow' }); }\nimport '../../../secrets.js';\n`);
  appendFileSync(join(dir, 'template/round.js'), '\nconst later = () => setTimeout(() => {}, 1);\n');
  writeFileSync(join(dir, 'template/panel.html'), readFileSync(join(dir, 'template/panel.html'), 'utf8').replace('<aside', '<script src="https://x.example"></script><aside'));
  const m = JSON.parse(readFileSync(join(dir, 'template/game.json'), 'utf8')); m.reward.max = 5000; writeFileSync(join(dir, 'template/game.json'), JSON.stringify(m));
  const r = check(dir);
  assert.equal(r.status, 1);
  for (const what of ['network calls', 'wallet access', 'browser storage', 'HTML from strings', 'reaching outside your panel', 'may import only', 'message "buyNow"', 'timers or clocks', 'panel.html must be plain', '"reward"']) assert.match(r.stderr, new RegExp(what), what);
});
