// Smooth movement on screen. The server sends where everyone is about ten times a second; easing toward each new
// spot (fast at first, then slowing) made walkers surge and stall ten times a second, and a camera easing after
// them on top made the whole world wobble. Instead each walker glides at a steady speed from where it is to its
// latest spot, timed to arrive as the next update is due; and the camera stays locked on you while you walk.

/** Move `p` (x, y toward tx, ty) for `dt` seconds at time `t`. Far jumps (a teleport, a respawn) land at once. */
export function glide(p, t, dt) {
  if (p.tx !== p.gx || p.ty !== p.gy) {
    // A new spot: how long updates take to come (smoothed), and the steady speed that gets there in that time.
    if (p.gt !== undefined) { const gap = t - p.gt; if (gap > 0.02 && gap < 0.5) p.gap = p.gap ? p.gap * 0.8 + gap * 0.2 : gap; }
    p.gt = t; p.gx = p.tx; p.gy = p.ty;
    // Timed to land a little after the next update is due, so one that comes late does not leave a pause.
    const gap = Math.min(0.3, Math.max(0.06, (p.gap ?? 0.1) * 1.2));
    // The pace: half the old speed, half the new, so updates that come a little early or late don't jerk it.
    const dist = Math.hypot(p.tx - p.x, p.ty - p.y), was = Math.hypot(p.vx ?? 0, p.vy ?? 0);
    p.speed = was ? (was + dist / gap) / 2 : dist / gap;
  }
  const rx = p.tx - p.x, ry = p.ty - p.y, left = Math.hypot(rx, ry);
  // A real jump (a teleport, a respawn, a new room): land at once.
  if (left > 6) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = p.speed = 0; return; }
  // Always straight at the latest spot (a walk round corners stays on pace), and never left far behind: past a
  // tile behind, it hurries to catch up within about a third of a second instead of jumping.
  // With no pace yet (nothing new since it last arrived: a small correction), close the gap in about a quarter second.
  const speed = Math.max(p.speed || left / 0.25, left > 1 ? left / 0.35 : 0), step = speed * dt;
  if (step >= left || !speed) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = p.speed = 0; return; }
  p.vx = (rx / left) * speed; p.vy = (ry / left) * speed;
  p.x += p.vx * dt; p.y += p.vy * dt;
}

/**
 * Bring the camera (cam.x, cam.y) toward `goal` for `dt` seconds. Once it has caught up it locks on and moves
 * exactly with the goal (so whoever it follows stays still on screen while the world scrolls under them); a jump
 * (you travelled, or a room's view changed) unlocks it and it glides over, then locks on again.
 */
export function camStep(cam, goal, dt, lock = true) {
  const [gx, gy] = goal, off = Math.hypot(gx - cam.x, gy - cam.y);
  if (lock && (off < 0.2 || (cam.locked && off < 0.75))) { cam.x = gx; cam.y = gy; cam.locked = true; return; }
  cam.locked = false;
  const c = 1 - Math.pow(0.002, dt);
  cam.x += (gx - cam.x) * c; cam.y += (gy - cam.y) * c;
}

/**
 * Your own walking with the keys (or the thumb stick), shown at once instead of waiting for the server: moved here by
 * the same rules the server uses (`free(x, y)`: can a body stand there; `speed` tiles a second). The server still
 * decides: if it is far behind (a lag spike, a wall this screen didn't know about) you wait for it, and when you let
 * go you settle onto the spot it stopped you at. That is a few pixels at most, since the server starts and stops you
 * equally late; if it is further (it had you blocked), you glide back to it quickly. `dir` is the screen direction held ([0, 0] for none), or null where the game drives
 * movement itself. True if it moved `p` this frame (then the usual glide leaves it alone).
 */
export function predict(p, dir, dt, t, free, speed) {
  const [dx, dy] = dir ?? [0, 0];
  if (dx || dy) {
    let wx = dx + dy, wy = -dx + dy; const len = Math.hypot(wx, wy); wx /= len; wy /= len;
    const lead = Math.hypot(p.tx - p.x, p.ty - p.y);
    // The server has you somewhere else entirely (a new room, a respawn): go there.
    if (lead > 6) { p.x = p.tx; p.y = p.ty; }
    // Far ahead of what the server has confirmed (a lag spike, a dropped connection, a wall it knows of and this
    // screen doesn't): wait for it rather than run on and be pulled back.
    else if (lead > 2.5) { p.predicting = true; p.moving = false; return true; }
    const step = speed * dt;
    if (free(p.x + wx * step, p.y)) p.x += wx * step;
    if (free(p.x, p.y + wy * step)) p.y += wy * step;
    p.predicting = true; p.moving = true; p.pdx = wx; p.pdy = wy;
    const sdx = wx - wy; if (Math.abs(sdx) > 0.01) p.facing = sdx < 0 ? -1 : 1;
    p.vx = p.vy = p.speed = 0; p.gx = p.tx; p.gy = p.ty; // the glide starts afresh afterwards
    return true;
  }
  if (p.predicting) { p.predicting = false; p.moving = false; p.settle = t + 0.8; }
  if (p.settle && t < p.settle) {
    // Let go: the server is still walking you for the time your key-up takes to reach it, and its last word on where
    // you are is that old too. Stay put until it says you've stopped; then the glide settles you onto its spot.
    if (p.srvMoving) { p.vx = p.vy = p.speed = 0; p.gx = p.tx; p.gy = p.ty; return true; }
    p.settle = 0;
  }
  return false;
}
