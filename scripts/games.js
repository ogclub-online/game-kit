// Where games live. Most are in games/<id>/. A builder that may only write the built site (dist/) can build a new
// game in dist/games/<id>/ instead: the "inbox". It sits at the same depth as games/<id>/, so its imports
// (../../engine/...) work the same, and the build keeps it, the checks, tests and sims include it, and the playtest
// page plays it. A reviewer moves an inbox game into games/ when it's accepted. A folder in games/ always wins.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const INBOX = join(ROOT, 'dist', 'games');
const isGame = (dir) => { try { return statSync(dir).isDirectory() && existsSync(join(dir, 'game.json')); } catch { return false; } };
const list = (base) => { try { return readdirSync(base).filter((d) => !d.startsWith('.') && isGame(join(base, d))).sort(); } catch { return []; } };

/** Every game: [{ id, dir, inbox }], games/ first, then inbox games that aren't also in games/. */
export function allGames() {
  const main = list(join(ROOT, 'games'));
  return [
    ...main.map((id) => ({ id, dir: join(ROOT, 'games', id), inbox: false })),
    ...list(INBOX).filter((id) => !main.includes(id)).map((id) => ({ id, dir: join(INBOX, id), inbox: true })),
  ];
}
/** The ids of the games in the inbox (built in dist/games/, not in games/). */
export const inboxGames = () => allGames().filter((g) => g.inbox).map((g) => g.id);
