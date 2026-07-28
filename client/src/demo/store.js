import snapshot from './snapshot.json';

/**
 * Persistent state for the demo build.
 *
 * GitHub Pages has no backend, so everything a signed-in user does lives in
 * this browser's localStorage. The curriculum itself (constellations, skills,
 * resources, store, cities) comes from `snapshot.json`, which is generated
 * from the real server seed — so the demo always shows what a fresh install
 * of the actual product contains.
 */

const KEY = 'talentmap.demo.v2';

const DEMO_ACCOUNTS = [
  { email: 'demo@talentmap.ai', password: 'demo123', name: 'София', age: 9, city: 'Москва', role: 'child', isAdmin: false },
  { email: 'admin@talentmap.ai', password: 'admin12345', name: 'Администратор', age: null, city: null, role: 'parent', isAdmin: true },
];

function nowIso() {
  return new Date().toISOString();
}

function blankState() {
  return {
    version: 2,
    nextId: 100,
    users: [],
    progress: [], // { userId, starId, at }
    portfolio: [],
    logs: [],
    purchases: [], // { userId, itemId }
    diagnostics: [],
    // Admin edits are applied on top of the snapshot so the demo editor works
    // without mutating the bundled data.
    graphOverrides: { constellations: [], stars: [], edges: [], resources: [], removed: {} },
    cities: [...snapshot.cities],
    session: null,
  };
}

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2) {
        state = parsed;
        return state;
      }
    }
  } catch {
    /* corrupted or unavailable storage — fall through to a fresh state */
  }
  state = blankState();
  seedAccounts();
  persist();
  return state;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or private mode — the demo keeps working in memory */
  }
}

function seedAccounts() {
  for (const account of DEMO_ACCOUNTS) {
    state.users.push({
      id: state.nextId++,
      name: account.name,
      email: account.email,
      password: account.password, // plaintext is acceptable: this never leaves the browser
      age: account.age,
      city: account.city,
      weeklyHours: '3-5 часов',
      role: account.role,
      xp: account.email === 'demo@talentmap.ai' ? 100 : 0,
      subscription: account.isAdmin ? 'pro' : 'trial',
      recommendedGraphs: [],
      equipped: { avatar: null, frame: null, title: null },
      isAdmin: account.isAdmin,
      onboarded: true,
      pin: null,
      createdAt: nowIso(),
    });
  }

  // Give the demo child a little history so the map, portfolio and profile
  // are not empty on a first visit.
  const demo = state.users.find((u) => u.email === 'demo@talentmap.ai');
  const graphics = snapshot.constellations.find((c) => c.key === 'computer-graphics');
  const design = snapshot.constellations.find((c) => c.key === 'design-project');
  demo.recommendedGraphs = [graphics?.id, design?.id].filter(Boolean);

  const firstTwo = snapshot.stars
    .filter((s) => s.constellationId === demo.recommendedGraphs[0])
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .slice(0, 2);

  for (const star of firstTwo) {
    state.progress.push({ userId: demo.id, starId: star.id, at: nowIso() });
    state.logs.push({
      id: state.nextId++,
      userId: demo.id,
      text: `Отмечен выполненным шаг: «${star.name}». Получено 50 XP!`,
      createdAt: nowIso(),
    });
  }

  if (firstTwo[1]) {
    state.portfolio.push({
      id: state.nextId++,
      userId: demo.id,
      title: 'Мой первый коллаж «КосмоКот»',
      starId: firstTwo[1].id,
      image: `${import.meta.env.BASE_URL}img/demo/collage.svg`,
      comment: 'Собрала из пяти разных фотографий. Научилась делать маски и полупрозрачность.',
      verifiedByAi: true,
      aiFeedback:
        'Отличная работа! Идея читается сразу, а это самое сложное в творческой работе. В следующий раз попробуй поиграть с контрастом.',
      createdAt: nowIso(),
    });
  }

  state.logs.push({
    id: state.nextId++,
    userId: demo.id,
    text: 'Успешно пройдена диагностика интересов.',
    createdAt: nowIso(),
  });
}

/* ------------------------------------------------------------------ api */

export function getState() {
  return load();
}

export function save() {
  persist();
}

export function nextId() {
  const s = load();
  return s.nextId++;
}

export function resetDemo() {
  state = blankState();
  seedAccounts();
  persist();
}

/** Curriculum = bundled snapshot + whatever the demo admin has changed. */
export function graph() {
  const s = load();
  const removed = s.graphOverrides.removed || {};

  const constellations = [
    ...snapshot.constellations.filter((c) => !removed[`c${c.id}`]),
    ...s.graphOverrides.constellations,
  ].map((c) => ({ ...c, ...(s.graphOverrides.patches?.[`c${c.id}`] || {}) }));

  const stars = [...snapshot.stars.filter((st) => !removed[`s${st.id}`]), ...s.graphOverrides.stars].map((st) => ({
    ...st,
    ...(s.graphOverrides.patches?.[`s${st.id}`] || {}),
  }));

  const visibleConstellations = new Set(constellations.map((c) => c.id));
  const visibleStars = new Set(stars.filter((st) => visibleConstellations.has(st.constellationId)).map((st) => st.id));

  const edges = [...snapshot.edges, ...s.graphOverrides.edges].filter(
    (e) => visibleStars.has(e.parent) && visibleStars.has(e.child) && !removed[`e${e.parent}-${e.child}`]
  );

  const resources = [...snapshot.resources.filter((r) => !removed[`r${r.id}`]), ...s.graphOverrides.resources].filter(
    (r) => visibleStars.has(r.starId)
  );

  return {
    constellations,
    stars: stars.filter((st) => visibleConstellations.has(st.constellationId)),
    edges,
    resources,
  };
}

export { snapshot, DEMO_ACCOUNTS };
