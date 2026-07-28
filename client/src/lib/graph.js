/**
 * Client mirror of the server's skill-graph rules (src/services/graph.js).
 * Kept deliberately small and pure so the map can render optimistically
 * without waiting for a round trip. The server remains authoritative.
 */

export const STAR_STATE = {
  COMPLETED: 'completed',
  CURRENT: 'current',
  AVAILABLE: 'available',
  LOCKED: 'locked',
};

/**
 * Availability is evaluated inside the visible sub-graph only.
 * The prototype filtered against the global edge list, so a skill whose
 * prerequisite lived in a constellation the child hadn't unlocked stayed
 * grey forever with no way to progress.
 */
export function computeAvailability(stars, edges, completedStars, visibleConstellationIds) {
  const completed = new Set((completedStars || []).map(Number));

  const visible = visibleConstellationIds?.length ? new Set(visibleConstellationIds.map(Number)) : null;
  const inScope = new Set(
    (stars || []).filter((s) => !visible || visible.has(Number(s.constellationId))).map((s) => s.id)
  );

  const parentsOf = new Map();
  for (const e of edges || []) {
    if (!inScope.has(e.child) || !inScope.has(e.parent)) continue;
    if (!parentsOf.has(e.child)) parentsOf.set(e.child, []);
    parentsOf.get(e.child).push(e.parent);
  }

  const available = new Set();
  for (const star of stars || []) {
    if (!inScope.has(star.id)) continue;
    if (completed.has(star.id)) {
      available.add(star.id);
      continue;
    }
    const parents = parentsOf.get(star.id) || [];
    if (parents.every((p) => completed.has(p))) available.add(star.id);
  }
  return available;
}

/**
 * Visual state of one star. Exactly one star in the map is CURRENT — the
 * prototype pulsed every unlocked star at once, so "the next step" was
 * impossible to spot.
 */
export function starState(star, { completed, available, currentStarId }) {
  if (completed.has(star.id)) return STAR_STATE.COMPLETED;
  if (star.id === currentStarId) return STAR_STATE.CURRENT;
  if (available.has(star.id)) return STAR_STATE.AVAILABLE;
  return STAR_STATE.LOCKED;
}

/**
 * Bounding box of a set of stars, used to auto-fit the SVG viewBox.
 * Padding scales with the content: a fixed margin swamps a single constellation
 * (leaving a few stars marooned in empty space) while being too tight for all
 * fourteen at once.
 */
export function boundsOf(stars) {
  if (!stars || !stars.length) return { x: 0, y: 0, width: 1000, height: 600 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of stars) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }

  const spread = Math.max(maxX - minX, maxY - minY, 1);
  // Extra room on top for the constellation caption.
  const padX = Math.max(90, spread * 0.16);
  const padTop = Math.max(150, spread * 0.28);
  const padBottom = Math.max(90, spread * 0.16);

  return {
    x: minX - padX,
    y: minY - padTop,
    width: Math.max(maxX - minX + padX * 2, 360),
    height: Math.max(maxY - minY + padTop + padBottom, 280),
  };
}

/** Per-constellation completion, for the progress panel. */
export function constellationProgress(constellations, stars, completedStars) {
  const completed = new Set((completedStars || []).map(Number));
  return (constellations || []).map((c) => {
    const own = (stars || []).filter((s) => s.constellationId === c.id);
    const done = own.filter((s) => completed.has(s.id)).length;
    return {
      ...c,
      total: own.length,
      done,
      percent: own.length ? Math.round((done / own.length) * 100) : 0,
    };
  });
}
