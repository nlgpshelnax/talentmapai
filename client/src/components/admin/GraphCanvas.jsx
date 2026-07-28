import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, GitBranch, Loader2, Move, X } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Button, Modal, cx } from '../ui';

/**
 * SVG skill-graph editor.
 *
 * Fixes carried over from the prototype's GraphEditor:
 *  - viewBox is AUTO-FIT to the rendered nodes (the prototype hardcoded
 *    "-200 -50 2000 1200" while data lived near 0–900, so it rendered tiny).
 *  - Dragging uses Pointer Events + setPointerCapture, so it works with mouse
 *    AND touch (the prototype was mouse-only).
 *  - Client→SVG coordinate mapping goes through getScreenCTM().inverse(), so it
 *    is correct at any zoom / CSS scale (the prototype assumed a fixed scale).
 *  - Connect mode's «ESC — отмена» finally has a real key handler behind it.
 *
 * Props:
 *   constellation : selected constellation | null
 *   stars         : ALL stars (we filter + dim others here)
 *   edges         : [{parent, child}]
 *   selectedStarId: number | null
 *   onSelectStar  : (id) => void
 *   onChanged     : () => Promise|void   — reload graph after edge mutations
 *   onPositions   : (Array<{id,x,y}>) => void  — merge dragged coords locally
 */

/** Радиусы заданы в CSS-пикселях и переводятся в мировые единицы через `unit`. */
const LEVEL_STYLE = {
  'Низкий (Начальный)': { fill: '#38bdf8', r: 9 },
  'Допустимый (Базовый)': { fill: '#34d399', r: 10.5 },
  'Высокий (Прогрессивный)': { fill: '#a78bfa', r: 12 },
  'Экспертный (Профи)': { fill: '#fbbf24', r: 14 },
};
const DEFAULT_STYLE = { fill: '#94a3b8', r: 9 };
const PADDING = 90; // world-units of breathing room around the fitted nodes

export default function GraphCanvas({
  constellation,
  stars,
  edges,
  selectedStarId,
  onSelectStar,
  onChanged,
  onPositions,
}) {
  const svgRef = useRef(null);
  const [error, setError] = useState('');
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState(null); // star id chosen as parent
  const [pointer, setPointer] = useState(null); // live rubber-band endpoint {x,y}
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [confirmEdge, setConfirmEdge] = useState(null); // {parent, child}

  // Local, drag-time overrides for star coords. Kept separate from props so a
  // background reload never yanks a node out from under the pointer.
  const [dragCoords, setDragCoords] = useState({});
  const dragState = useRef(null); // { id, moved:boolean }
  const pendingSave = useRef({}); // id -> {x,y} awaiting the batch POST
  const saveTimer = useRef(null);
  const savedTimer = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, []);

  const constellationId = constellation?.id ?? null;

  // Effective coordinate for a star: a live drag override wins over server data.
  const coordOf = useCallback(
    (star) => dragCoords[star.id] || { x: star.x, y: star.y },
    [dragCoords]
  );

  const shownStars = useMemo(
    () => stars.filter((s) => s.constellationId === constellationId),
    [stars, constellationId]
  );
  const contextStars = useMemo(
    () => (constellationId == null ? [] : stars.filter((s) => s.constellationId !== constellationId)),
    [stars, constellationId]
  );

  const starById = useMemo(() => {
    const m = new Map();
    stars.forEach((s) => m.set(s.id, s));
    return m;
  }, [stars]);

  // Edges whose BOTH endpoints belong to the selected constellation.
  const shownEdges = useMemo(() => {
    if (constellationId == null) return [];
    const ids = new Set(shownStars.map((s) => s.id));
    return edges.filter((e) => ids.has(e.parent) && ids.has(e.child));
  }, [edges, shownStars, constellationId]);

  // Auto-fit viewBox to the shown nodes (fall back to a sane default if empty).
  const viewBox = useMemo(() => {
    const pts = shownStars.map(coordOf);
    if (!pts.length) return { x: 0, y: 0, w: 900, h: 600 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    const w = Math.max(320, Math.max(...xs) - Math.min(...xs) + PADDING * 2);
    const h = Math.max(240, Math.max(...ys) - Math.min(...ys) + PADDING * 2);
    return { x: minX, y: minY, w, h };
  }, [shownStars, coordOf]);

  const [canvasWidth, setCanvasWidth] = useState(900);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setCanvasWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Map a pointer event's client coords into SVG user-space coords. */
  const toSvgPoint = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    }
    // Fallback: derive from the bounding box against the current viewBox.
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.h,
    };
  }, [viewBox]);

  const flushPositions = useCallback(async () => {
    const entries = Object.entries(pendingSave.current);
    if (!entries.length) return;
    const positions = entries.map(([id, p]) => ({ id: Number(id), x: Math.round(p.x), y: Math.round(p.y) }));
    pendingSave.current = {};
    setSaveState('saving');
    try {
      await api.post('/admin/stars/positions', { positions });
      // Merge the saved coords into parent state so they survive the next reload.
      onPositions?.(positions);
      if (!mounted.current) return;
      setSaveState('saved');
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => mounted.current && setSaveState('idle'), 1800);
    } catch (err) {
      if (!mounted.current) return;
      setError(errorMessage(err, 'Не удалось сохранить позиции.'));
      setSaveState('idle');
    }
  }, [onPositions]);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPositions, 600);
  }, [flushPositions]);

  // ---------------------------------------------------------------- pointer

  function handleNodePointerDown(event, star) {
    event.stopPropagation();
    if (connectMode) return; // clicks in connect mode are handled on pointer-up
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragState.current = { id: star.id, moved: false };
  }

  function handleNodePointerMove(event, star) {
    if (!dragState.current || dragState.current.id !== star.id) return;
    const { x, y } = toSvgPoint(event);
    dragState.current.moved = true;
    setDragCoords((prev) => ({ ...prev, [star.id]: { x, y } }));
  }

  function handleNodePointerUp(event, star) {
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (connectMode) {
      handleConnectClick(star.id);
      return;
    }

    const state = dragState.current;
    dragState.current = null;
    if (!state) return;

    if (state.moved) {
      const coord = dragCoords[star.id];
      if (coord) {
        pendingSave.current[star.id] = coord;
        scheduleSave();
      }
    } else {
      // A click without movement selects the star.
      onSelectStar?.(star.id);
    }
  }

  // Track the rubber-band endpoint while connecting.
  function handleSurfacePointerMove(event) {
    if (!connectMode || connectFrom == null) return;
    setPointer(toSvgPoint(event));
  }

  // ---------------------------------------------------------------- connect

  function handleConnectClick(starId) {
    if (connectFrom == null) {
      setConnectFrom(starId);
      onSelectStar?.(starId);
      return;
    }
    if (starId === connectFrom) {
      setError('Навык нельзя связать сам с собой.');
      return;
    }
    createEdge(connectFrom, starId);
  }

  async function createEdge(parent, child) {
    setError('');
    try {
      await api.post('/admin/edges', { parent, child });
      setConnectFrom(null);
      setPointer(null);
      await onChanged?.();
    } catch (err) {
      // Surface the cycle / validation message from the server verbatim.
      setError(errorMessage(err, 'Не удалось создать связь.'));
      setConnectFrom(null);
      setPointer(null);
    }
  }

  async function deleteEdge() {
    if (!confirmEdge) return;
    const { parent, child } = confirmEdge;
    setError('');
    try {
      await api.delete('/admin/edges', { params: { parent, child } });
      setConfirmEdge(null);
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить связь.'));
      setConfirmEdge(null);
    }
  }

  const cancelConnect = useCallback(() => {
    setConnectMode(false);
    setConnectFrom(null);
    setPointer(null);
  }, []);

  // Escape cancels connect mode (real handler this time). Bound only while active.
  useEffect(() => {
    if (!connectMode) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelConnect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectMode, cancelConnect]);

  /**
   * World units per CSS pixel. The viewBox is fitted tightly to one
   * constellation, so a fixed world-unit font renders enormous on a wide
   * canvas and tiny on a narrow one. Expressing sizes in pixels and scaling
   * by `unit` keeps the editor visually constant at any size.
   */
  const unit = viewBox.w / Math.max(canvasWidth, 1);
  const strokeW = 1.4 * unit;
  const labelSize = 12 * unit;
  const fromStar = connectFrom != null ? starById.get(connectFrom) : null;
  const fromCoord = fromStar ? coordOf(fromStar) : null;

  if (!constellation) {
    return (
      <div className="glass flex h-full min-h-[420px] items-center justify-center rounded-2xl p-8 text-center">
        <div>
          <GitBranch size={34} className="mx-auto mb-3 text-slate-600" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-slate-300">Созвездие не выбрано</h2>
          <p className="mt-1 text-sm text-slate-500">Выберите созвездие слева, чтобы открыть карту его навыков.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass flex h-full flex-col rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold text-white">
            <span aria-hidden="true">{constellation.icon} </span>
            {constellation.name}
          </h2>
          <span aria-live="polite" className="inline-flex items-center gap-1 text-xs text-slate-400">
            {saveState === 'saving' && (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                Сохранение…
              </>
            )}
            {saveState === 'saved' && (
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <Check size={13} aria-hidden="true" />
                Сохранено
              </span>
            )}
          </span>
        </div>
        <Button
          size="sm"
          variant={connectMode ? 'primary' : 'outline'}
          onClick={() => (connectMode ? cancelConnect() : setConnectMode(true))}
          aria-pressed={connectMode}
        >
          <GitBranch size={15} aria-hidden="true" />
          {connectMode ? 'Завершить связывание' : 'Связать навыки'}
        </Button>
      </div>

      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}

      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
        {connectMode ? (
          <>
            <GitBranch size={13} aria-hidden="true" />
            {connectFrom == null
              ? 'Выберите начальный навык, затем конечный.'
              : 'Теперь выберите конечный навык.'}{' '}
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[10px]">Esc</kbd> — отмена.
          </>
        ) : (
          <>
            <Move size={13} aria-hidden="true" />
            Перетаскивайте навыки, чтобы менять расположение. Клик — открыть навык. Крестик на связи удаляет её.
          </>
        )}
      </p>

      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-space-950/60">
        {shownStars.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
            В этом созвездии пока нет навыков. Добавьте первый, чтобы он появился на карте.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className={cx('h-full w-full touch-none select-none', connectMode ? 'cursor-crosshair' : 'cursor-default')}
            role="application"
            aria-label={`Карта навыков созвездия «${constellation.name}»`}
            onPointerMove={handleSurfacePointerMove}
            onPointerDown={() => {
              // Clicking empty canvas cancels an in-progress connection start.
              if (connectMode && connectFrom != null) {
                setConnectFrom(null);
                setPointer(null);
              }
            }}
          >
            {/* Faint context: nodes from other constellations */}
            {contextStars.map((s) => {
              const c = coordOf(s);
              return <circle key={`ctx-${s.id}`} cx={c.x} cy={c.y} r={DEFAULT_STYLE.r * 0.7 * unit} fill="#1b2547" opacity={0.35} />;
            })}

            {/* Edges (beneath nodes) */}
            {shownEdges.map((e) => {
              const p = starById.get(e.parent);
              const c = starById.get(e.child);
              if (!p || !c) return null;
              const pc = coordOf(p);
              const cc = coordOf(c);
              const midX = (pc.x + cc.x) / 2;
              const midY = (pc.y + cc.y) / 2;
              return (
                <g key={`edge-${e.parent}-${e.child}`}>
                  <line
                    x1={pc.x}
                    y1={pc.y}
                    x2={cc.x}
                    y2={cc.y}
                    stroke="rgba(148,163,184,0.4)"
                    strokeWidth={strokeW}
                  />
                  {!connectMode && (
                    <g
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`Удалить связь «${p.name}» → «${c.name}»`}
                      onClick={() => setConfirmEdge({ parent: e.parent, child: e.child })}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setConfirmEdge({ parent: e.parent, child: e.child });
                        }
                      }}
                    >
                      <circle cx={midX} cy={midY} r={labelSize * 0.72} fill="#0a0f1f" stroke="rgba(244,63,94,0.6)" strokeWidth={strokeW * 0.8} />
                      <text
                        x={midX}
                        y={midY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={labelSize}
                        fill="#fb7185"
                      >
                        ×
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Rubber-band while connecting */}
            {connectMode && fromCoord && pointer && (
              <line
                x1={fromCoord.x}
                y1={fromCoord.y}
                x2={pointer.x}
                y2={pointer.y}
                stroke="#fbbf24"
                strokeWidth={strokeW}
                strokeDasharray={`${strokeW * 3} ${strokeW * 3}`}
                pointerEvents="none"
              />
            )}

            {/* Nodes */}
            {shownStars.map((s) => {
              const c = coordOf(s);
              const style = LEVEL_STYLE[s.level] || DEFAULT_STYLE;
              const isSelected = s.id === selectedStarId;
              const isFrom = s.id === connectFrom;
              return (
                <g
                  key={s.id}
                  transform={`translate(${c.x} ${c.y})`}
                  className={cx(connectMode ? 'cursor-pointer' : 'cursor-grab')}
                  onPointerDown={(ev) => handleNodePointerDown(ev, s)}
                  onPointerMove={(ev) => handleNodePointerMove(ev, s)}
                  onPointerUp={(ev) => handleNodePointerUp(ev, s)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Навык «${s.name}», уровень: ${s.level}`}
                  aria-pressed={isSelected}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      if (connectMode) handleConnectClick(s.id);
                      else onSelectStar?.(s.id);
                    }
                  }}
                >
                  {(isSelected || isFrom) && (
                    <circle r={style.r * unit + strokeW * 2.5} fill="none" stroke={isFrom ? '#fbbf24' : '#fcd34d'} strokeWidth={strokeW * 1.4} />
                  )}
                  <circle r={style.r * unit} fill={style.fill} stroke="#05070f" strokeWidth={strokeW * 0.8} />
                  <text
                    x={0}
                    y={style.r * unit + labelSize * 1.15}
                    textAnchor="middle"
                    fontSize={labelSize}
                    fill="#e8edf7"
                    className="pointer-events-none"
                  >
                    {truncate(s.name, 22)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Level legend */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {Object.entries(LEVEL_STYLE).map(([lvl, st]) => (
          <span key={lvl} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.fill }} aria-hidden="true" />
            {lvl}
          </span>
        ))}
      </div>

      <Modal open={Boolean(confirmEdge)} onClose={() => setConfirmEdge(null)} title="Удалить связь?" size="sm">
        {confirmEdge && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Связь «<span className="font-semibold text-white">{starById.get(confirmEdge.parent)?.name}</span>» →
              «<span className="font-semibold text-white">{starById.get(confirmEdge.child)?.name}</span>» будет удалена.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmEdge(null)}>
                Отмена
              </Button>
              <Button type="button" variant="danger" onClick={deleteEdge}>
                <X size={16} aria-hidden="true" />
                Удалить связь
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
