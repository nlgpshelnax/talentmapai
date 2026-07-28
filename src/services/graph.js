'use strict';

/**
 * Skill-graph rules, shared by the API and mirrored by the client.
 *
 * Two prototype bugs are fixed here:
 *  1. Availability was computed against the GLOBAL edge list, so a star whose
 *     parent lived in a constellation the user hadn't unlocked stayed locked
 *     forever. Availability is now evaluated within the visible sub-graph.
 *  2. Every unlocked-but-unfinished star pulsed, so the map had no single
 *     "current step". `currentStarId` picks exactly one.
 *
 * The server also uses `isStarAvailable` to reject attempts to complete a
 * locked star — the prototype accepted any starId the client sent.
 */

/** Set of star ids reachable given the visible constellations. */
function visibleStarIds(stars, visibleConstellationIds) {
  if (!visibleConstellationIds || !visibleConstellationIds.length) {
    return new Set(stars.map((s) => s.id));
  }
  const visible = new Set(visibleConstellationIds.map(Number));
  return new Set(stars.filter((s) => visible.has(Number(s.constellation_id))).map((s) => s.id));
}

/**
 * A star is available when every prerequisite *inside the visible sub-graph*
 * is complete. Edges pointing in from hidden constellations are ignored rather
 * than treated as permanently unmet.
 */
function computeAvailability(stars, edges, completedStars, visibleConstellationIds) {
  const completed = new Set((completedStars || []).map(Number));
  const inScope = visibleStarIds(stars, visibleConstellationIds);

  const parentsOf = new Map();
  for (const e of edges || []) {
    const child = Number(e.child_star_id);
    const parent = Number(e.parent_star_id);
    if (!inScope.has(child) || !inScope.has(parent)) continue;
    if (!parentsOf.has(child)) parentsOf.set(child, []);
    parentsOf.get(child).push(parent);
  }

  const available = new Set();
  for (const star of stars) {
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

function isStarAvailable(stars, edges, completedStars, starId, visibleConstellationIds) {
  return computeAvailability(stars, edges, completedStars, visibleConstellationIds).has(Number(starId));
}

/**
 * The single star the child should work on next.
 * Preference order: lowest order_index inside the constellation with the most
 * progress (so we finish a path before opening a new one), then by star id.
 */
function currentStarId(stars, edges, completedStars, visibleConstellationIds) {
  const completed = new Set((completedStars || []).map(Number));
  const available = computeAvailability(stars, edges, completedStars, visibleConstellationIds);

  const candidates = stars.filter((s) => available.has(s.id) && !completed.has(s.id));
  if (!candidates.length) return null;

  const progressByConstellation = new Map();
  for (const s of stars) {
    if (!completed.has(s.id)) continue;
    const c = Number(s.constellation_id);
    progressByConstellation.set(c, (progressByConstellation.get(c) || 0) + 1);
  }

  candidates.sort((a, b) => {
    const pa = progressByConstellation.get(Number(a.constellation_id)) || 0;
    const pb = progressByConstellation.get(Number(b.constellation_id)) || 0;
    if (pa !== pb) return pb - pa;
    if ((a.order_index || 0) !== (b.order_index || 0)) return (a.order_index || 0) - (b.order_index || 0);
    return a.id - b.id;
  });

  return candidates[0].id;
}

/** Guard against admin-created cycles, which would soft-lock a whole branch. */
function findCycle(stars, edges) {
  const adjacency = new Map();
  for (const e of edges || []) {
    const p = Number(e.parent_star_id);
    if (!adjacency.has(p)) adjacency.set(p, []);
    adjacency.get(p).push(Number(e.child_star_id));
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map(stars.map((s) => [s.id, WHITE]));

  const stack = [];
  let cycle = null;

  function visit(node) {
    if (cycle) return;
    colour.set(node, GREY);
    stack.push(node);
    for (const next of adjacency.get(node) || []) {
      if (cycle) return;
      const c = colour.get(next);
      if (c === GREY) {
        cycle = [...stack.slice(stack.indexOf(next)), next];
        return;
      }
      if (c === WHITE || c === undefined) visit(next);
    }
    stack.pop();
    colour.set(node, BLACK);
  }

  for (const s of stars) {
    if (colour.get(s.id) === WHITE) visit(s.id);
    if (cycle) break;
  }
  return cycle;
}

module.exports = { computeAvailability, isStarAvailable, currentStarId, findCycle, visibleStarIds };
