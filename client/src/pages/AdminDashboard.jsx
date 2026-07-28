import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  FolderKanban,
  LogOut,
  Map as MapIcon,
  MapPin,
  Sparkles,
  Star,
  Users as UsersIcon,
} from 'lucide-react';

import api, { errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Spinner, cx } from '../components/ui';

import GraphCanvas from '../components/admin/GraphCanvas';
import ConstellationPanel from '../components/admin/ConstellationPanel';
import StarPanel from '../components/admin/StarPanel';
import UsersTable from '../components/admin/UsersTable';
import CitiesPanel from '../components/admin/CitiesPanel';

/**
 * Admin shell. Owns the graph data and exposes reload() to the child panels.
 *
 * The prototype's admin was one 851-line component whose useEffect refetched
 * and overwrote in-progress edits. Here the graph is fetched once, held in one
 * place, and dragged star positions are merged from an overrides ref so a
 * reload never reverts a just-saved drag.
 */

const TABS = [
  { id: 'graph', label: 'Карта навыков', icon: MapIcon },
  { id: 'cities', label: 'Города', icon: MapPin },
  { id: 'users', label: 'Пользователи', icon: UsersIcon },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  const [graph, setGraph] = useState({ constellations: [], stars: [], edges: [], resources: [] });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('graph');

  const [selectedConstellationId, setSelectedConstellationId] = useState(null);
  const [selectedStarId, setSelectedStarId] = useState(null);

  // Star coords saved by an in-editor drag. Merged over freshly fetched data so
  // a background reload keeps the last dragged position (never reverts it).
  const positionOverrides = useRef({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyOverrides = useCallback((stars) => {
    const ov = positionOverrides.current;
    if (!Object.keys(ov).length) return stars;
    return stars.map((s) => (ov[s.id] ? { ...s, x: ov[s.id].x, y: ov[s.id].y } : s));
  }, []);

  const loadGraph = useCallback(async () => {
    const res = await api.get('/admin/graph');
    if (!mounted.current) return null;
    const data = res.data || {};
    const next = {
      constellations: data.constellations || [],
      stars: applyOverrides(data.stars || []),
      edges: data.edges || [],
      resources: data.resources || [],
    };
    setGraph(next);
    return next;
  }, [applyOverrides]);

  const loadStats = useCallback(async () => {
    const res = await api.get('/admin/stats');
    if (mounted.current) setStats(res.data || null);
  }, []);

  /** Public reload used by the child panels after any mutation. */
  const reload = useCallback(async () => {
    setError('');
    try {
      await Promise.all([loadGraph(), loadStats()]);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Не удалось обновить данные.'));
    }
  }, [loadGraph, loadStats]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        await Promise.all([loadGraph(), loadStats()]);
      } catch (err) {
        if (!cancelled && mounted.current) setError(errorMessage(err, 'Не удалось загрузить админ-панель.'));
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [loadGraph, loadStats]);

  // The active constellation. When nothing is explicitly chosen we fall back to
  // the first one — derived during render so no effect mutates state after load.
  const selectedConstellation = useMemo(() => {
    if (selectedConstellationId != null) {
      const found = graph.constellations.find((c) => c.id === selectedConstellationId);
      if (found) return found;
    }
    return graph.constellations[0] || null;
  }, [graph.constellations, selectedConstellationId]);
  const selectedStar = useMemo(
    () => graph.stars.find((s) => s.id === selectedStarId) || null,
    [graph.stars, selectedStarId]
  );

  // Called by GraphCanvas after a batch position save succeeds.
  const mergePositions = useCallback((positions) => {
    positions.forEach((p) => {
      positionOverrides.current[p.id] = { x: p.x, y: p.y };
    });
    setGraph((prev) => ({
      ...prev,
      stars: prev.stars.map((s) => {
        const hit = positions.find((p) => p.id === s.id);
        return hit ? { ...s, x: hit.x, y: hit.y } : s;
      }),
    }));
  }, []);

  const handleSelectConstellation = useCallback((id) => {
    setSelectedConstellationId(id);
    setSelectedStarId(null); // a star from another constellation shouldn't stay open
  }, []);

  const handleStarDeleted = useCallback((starId) => {
    setSelectedStarId((cur) => (cur === starId ? null : cur));
    delete positionOverrides.current[starId];
  }, []);

  const warnings = useMemo(() => {
    if (!stats) return [];
    const list = [];
    if (stats.starsWithoutResources > 0) {
      list.push(
        `Навыков без ресурсов: ${stats.starsWithoutResources}. Ребёнок откроет такой навык и не увидит, куда идти дальше — добавьте ресурсы.`
      );
    }
    if (stats.cycle && stats.cycle.length) {
      const names = stats.cycle
        .map((id) => graph.stars.find((s) => s.id === id)?.name)
        .filter(Boolean)
        .join(' → ');
      list.push(
        `Обнаружен замкнутый круг связей${names ? ` (${names})` : ''}. Эти навыки заблокируются навсегда — удалите одну из связей в цепочке.`
      );
    }
    return list;
  }, [stats, graph.stars]);

  return (
    <div className="min-h-screen">
      <header className="glass-strong sticky top-0 z-30 border-b border-white/10">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-space-950">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div>
              <h1 className="font-display text-lg font-extrabold leading-tight text-white">TalentMap AI</h1>
              <p className="text-xs text-slate-400">Админ-панель</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button as={Link} to="/app" variant="ghost" size="sm">
              <ArrowLeft size={15} aria-hidden="true" />
              В приложение
            </Button>
            <span className="hidden text-sm text-slate-400 sm:inline">{user?.name}</span>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut size={15} aria-hidden="true" />
              Выйти
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="border-t border-white/5 bg-space-950/40">
          <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
            <Stat icon={UsersIcon} label="Пользователи" value={stats?.users} />
            <Stat icon={Sparkles} label="PRO" value={stats?.pro} />
            <Stat icon={FolderKanban} label="Созвездия" value={stats?.constellations} />
            <Stat icon={Star} label="Навыки" value={stats?.stars} />
            <Stat icon={BookOpen} label="Ресурсы" value={stats?.resources} />
            <Stat icon={FolderKanban} label="Работы" value={stats?.works} />
            <Stat icon={MapPin} label="Площадки" value={stats?.venues} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {warnings.length > 0 && (
          <Alert tone="warning" className="mb-4">
            <div className="flex gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </Alert>
        )}

        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Разделы админ-панели" className="mb-5 flex gap-1 border-b border-white/10">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cx(
                  'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
                  active
                    ? 'border-gold-400 text-gold-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Spinner label="Загружаем админ-панель…" />
        ) : tab === 'graph' ? (
          <div
            id="panel-graph"
            role="tabpanel"
            aria-labelledby="tab-graph"
            className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            {/*
              The canvas gets its own bounded height (clamp between a sane
              minimum and ~68vh) instead of being stretched to match the
              taller sidebar. `items-start` stops the grid row from stretching,
              and the sidebar scrolls on its own so a long constellation list
              never drags the canvas to 1000px+ of mostly-blank space.
            */}
            <div className="order-2 min-h-[520px] lg:order-1 lg:h-[clamp(520px,68vh,760px)]">
              <GraphCanvas
                constellation={selectedConstellation}
                stars={graph.stars}
                edges={graph.edges}
                selectedStarId={selectedStarId}
                onSelectStar={setSelectedStarId}
                onChanged={reload}
                onPositions={mergePositions}
              />
            </div>
            <div className="order-1 space-y-4 lg:order-2 lg:max-h-[clamp(520px,68vh,760px)] lg:overflow-y-auto lg:pr-1">
              <ConstellationPanel
                constellations={graph.constellations}
                stars={graph.stars}
                selectedId={selectedConstellation?.id ?? null}
                onSelect={handleSelectConstellation}
                onChanged={reload}
              />
              {selectedConstellation && (
                <StarCreator constellationId={selectedConstellation.id} onCreated={reload} onSelectStar={setSelectedStarId} />
              )}
              <StarPanel
                star={selectedStar}
                resources={graph.resources}
                onChanged={reload}
                onDeleted={handleStarDeleted}
              />
            </div>
          </div>
        ) : tab === 'cities' ? (
          <div id="panel-cities" role="tabpanel" aria-labelledby="tab-cities">
            <CitiesPanel />
          </div>
        ) : (
          <div id="panel-users" role="tabpanel" aria-labelledby="tab-users">
            <UsersTable />
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} className="text-gold-400/80" aria-hidden="true" />
      <span className="text-sm text-slate-400">{label}:</span>
      <span className="text-sm font-bold tabular-nums text-white">{value ?? '—'}</span>
    </div>
  );
}

/**
 * Small "add star to this constellation" action. Lives here (not in StarPanel)
 * because a star can only be created once a constellation is chosen, and the
 * new star immediately becomes the selection for editing.
 */
function StarCreator({ constellationId, onCreated, onSelectStar }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addStar() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/admin/stars', {
        constellationId,
        name: 'Новый навык',
        level: 'Низкий (Начальный)',
        x: 400,
        y: 300,
      });
      if (res.data?.id) onSelectStar?.(res.data.id);
      await onCreated?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось создать навык.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-2">
          {error}
        </Alert>
      )}
      <Button variant="outline" size="sm" onClick={addStar} loading={busy} className="w-full">
        <Star size={15} aria-hidden="true" />
        Добавить навык в созвездие
      </Button>
    </div>
  );
}
