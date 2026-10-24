import assert from 'node:assert/strict';
import { GostopGame } from '../src/game/GostopGame.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const stats = { games: 0, draw: 0, ppeok: 0, ttadak: 0, jjok: 0, sweep: 0, bomb: 0, shake: 0, go: 0, bak: 0, turns: 0 };

function check(g) {
  const all = [...g.floor, ...g.stock, ...g.hands[1], ...g.hands[2], ...g.captured[1], ...g.captured[2]];
  assert.equal(all.length, 48, 'card count');
  assert.equal(new Set(all).size, 48, 'unique cards');
}

for (let n = 0; n < 3000; n++) {
  const g = new GostopGame([1, 2], { firstPlayer: 1 + (n % 2) });
  check(g);
  let guard = 0;
  while (g.phase !== 'ended') {
    assert.ok(guard++ < 200, 'infinite loop');
    const pid = g.turn;
    let r;
    if (g.phase === 'play') {
      const hand = g.hands[pid];
      if (hand.length === 0 || (g.dummies[pid] > 0 && Math.random() < 0.5)) r = g.play(pid, null);
      else r = g.play(pid, pick(hand), { shake: Math.random() < 0.5 });
      if (!r.ok) r = g.play(pid, pick(hand));
    } else if (g.phase === 'choose') {
      r = g.choose(pid, pick(g.ctx.choice.options));
    } else if (g.phase === 'gostop') {
      r = Math.random() < 0.4 ? g.callGo(pid) : g.callStop(pid);
    }
    assert.ok(r?.ok, 'action failed: ' + JSON.stringify(r) + ' phase ' + g.phase);
    stats.turns++;
    for (const f of r.frames) {
      const k = f.banner?.kind;
      if (k && stats[k] !== undefined) stats[k]++;
      if (k === 'go') stats.go++;
    }
    check(g);
  }
  stats.games++;
  if (g.result.draw) stats.draw++;
  else {
    assert.ok(g.result.total >= 7 || g.result.forfeit, 'win under threshold: ' + g.result.total);
    if (g.result.tags.some((t) => t.includes('박'))) stats.bak++;
  }
}
console.log(stats);
