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
export function boundsOf(stars, pad) {
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

  // Поля привязаны к размеру одного кластера, а не к общему размаху: иначе
  // при четырнадцати созвездиях отступ вырастал больше самого содержимого и
  // карта занимала меньше половины полотна. Сверху чуть больше — там подпись.
  const spread = Math.max(maxX - minX, maxY - minY, 1);
  const fallback = Math.max(90, spread * 0.16);
  const given = typeof pad === 'number' ? { x: pad } : pad || {};
  const padX = given.x ?? fallback;
  // По вертикали поле может быть уже: когда созвездия стоят в один ряд,
  // горизонтальный зазор уже задан раскладкой, и симметричный отступ сверху
  // и снизу просто раздувает пустоту.
  const padTop = given.top ?? padX * 1.35;
  const padBottom = given.bottom ?? padX;

  return {
    x: minX - padX,
    y: minY - padTop,
    width: Math.max(maxX - minX + padX * 2, 360),
    height: Math.max(maxY - minY + padTop + padBottom, 280),
  };
}

/**
 * The single star the child should work on next — the client mirror of the
 * server's rule (src/services/graph.js). Preference order: the constellation
 * with the most progress first (finish a path before opening a new one), then
 * the lowest order index inside it.
 *
 * Normally the server supplies `currentStarId`; this exists so the static demo
 * build can compute it in the browser using the very same rule.
 */
export function currentStarId(stars, edges, completedStars, visibleConstellationIds) {
  const completed = new Set((completedStars || []).map(Number));
  const available = computeAvailability(stars, edges, completedStars, visibleConstellationIds);

  const candidates = (stars || []).filter((s) => available.has(s.id) && !completed.has(s.id));
  if (!candidates.length) return null;

  const progressByConstellation = new Map();
  for (const s of stars || []) {
    if (!completed.has(s.id)) continue;
    const c = Number(s.constellationId);
    progressByConstellation.set(c, (progressByConstellation.get(c) || 0) + 1);
  }

  candidates.sort((a, b) => {
    const pa = progressByConstellation.get(Number(a.constellationId)) || 0;
    const pb = progressByConstellation.get(Number(b.constellationId)) || 0;
    if (pa !== pb) return pb - pa;
    if ((a.orderIndex || 0) !== (b.orderIndex || 0)) return (a.orderIndex || 0) - (b.orderIndex || 0);
    return a.id - b.id;
  });

  return candidates[0].id;
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

/**
 * Раскладка созвездий под то, что реально показано на экране.
 *
 * Координаты созвездий в базе задают жёсткую сетку 4×4 на все четырнадцать
 * направлений. Когда открыто, скажем, четыре — на экран попадают те ячейки,
 * которые им достались при наполнении: два кластера жмутся в угол, два висят
 * по центру, половина полотна пустая. Выглядит как случайность, потому что это
 * и есть случайность.
 *
 * Здесь центры кластеров пересчитываются под текущий набор: строки со
 * смещением через одну (так группы читаются как созвездия, а не как таблица),
 * неполная строка центрируется, число колонок подбирается под пропорции
 * контейнера. Форма самого созвездия не меняется — звёзды переносятся вместе
 * со своим центром.
 */
export function layoutConstellations(constellations, stars, aspect = 1.6) {
  const visible = constellations || [];
  if (!visible.length) return { stars: stars || [], constellations: visible };

  // Насколько далеко звёзды отходят от центра своего созвездия.
  let radius = 0;
  const byConstellation = new Map();
  for (const star of stars || []) {
    if (!byConstellation.has(star.constellationId)) byConstellation.set(star.constellationId, []);
    byConstellation.get(star.constellationId).push(star);
  }
  for (const c of visible) {
    for (const star of byConstellation.get(c.id) || []) {
      radius = Math.max(radius, Math.hypot(star.x - c.x, star.y - c.y));
    }
  }
  radius = radius || 160;

  const n = visible.length;

  // Число колонок подбираем под пропорции контейнера, а строки — так, чтобы они
  // были одинаковой длины. Наивное «заполняем по cols в ряд» на четырнадцати
  // созвездиях давало 6 + 6 + 2: последняя пара висела внизу сиротой.
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * aspect)) || 1));
  const rows = Math.ceil(n / cols);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const rowSizes = Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));

  // Зазор между кластерами: достаточно, чтобы подписи не сталкивались,
  // но не настолько, чтобы карта расползлась в пустоту.
  const cellW = radius * 2 + radius * 1.55;
  const cellH = radius * 2 + radius * 1.35;
  const widest = Math.max(...rowSizes);
  const staggered = rows > 1 && widest > 1;

  const placed = new Map();
  let index = 0;
  rowSizes.forEach((inRow, row) => {
    // Каждую строку центрируем саму по себе, поэтому короткий ряд не липнет влево.
    const rowWidth = (inRow - 1) * cellW;
    const shift = staggered && row % 2 === 1 ? cellW * 0.28 : 0;
    for (let col = 0; col < inRow; col++) {
      placed.set(visible[index].id, {
        x: col * cellW - rowWidth / 2 + shift,
        y: row * cellH - ((rows - 1) * cellH) / 2,
      });
      index++;
    }
  });

  const movedConstellations = visible.map((c) => ({ ...c, ...placed.get(c.id) }));

  const movedStars = (stars || []).map((star) => {
    const target = placed.get(star.constellationId);
    if (!target) return star;
    const origin = visible.find((c) => c.id === star.constellationId);
    return { ...star, x: star.x - origin.x + target.x, y: star.y - origin.y + target.y };
  });

  return { constellations: movedConstellations, stars: movedStars, radius, cellW, cellH, rows, cols };
}

/** Прогресс внутри заданного набора созвездий — одна формула на всё приложение. */
export function progressIn(stars, completedStars, constellationIds) {
  const scope = constellationIds?.length ? new Set(constellationIds.map(Number)) : null;
  const inScope = (stars || []).filter((s) => !scope || scope.has(Number(s.constellationId)));
  const completed = new Set((completedStars || []).map(Number));
  const done = inScope.filter((s) => completed.has(s.id)).length;
  return {
    done,
    total: inScope.length,
    percent: inScope.length ? Math.round((done / inScope.length) * 100) : 0,
  };
}
