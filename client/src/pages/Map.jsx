import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ExternalLink,
  Globe,
  Lock,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import {
  boundsOf,
  computeAvailability,
  layoutConstellations,
  progressIn,
  starState,
  STAR_STATE,
} from '../lib/graph';
import { skills } from '../lib/plural';
import { errorMessage } from '../lib/api';
import { Alert, Badge, Button, Modal, Spinner, cx } from '../components/ui';
import PaywallModal from '../components/PaywallModal';

/* ------------------------------------------------------------------ theme */

/**
 * Radii and type sizes are given in CSS pixels and converted to SVG units at
 * render time. Hardcoding SVG units (as the prototype did) means the stars
 * shrink to a few pixels whenever the viewBox is wide and the viewport narrow —
 * which is exactly what made the map unusable on a phone.
 */
const STAR_STYLE = {
  [STAR_STATE.COMPLETED]: { r: 13, fill: '#fbbf24', stroke: '#fde68a', label: 'Пройдено' },
  [STAR_STATE.CURRENT]: { r: 15, fill: '#f59e0b', stroke: '#fffbeb', label: 'Текущий шаг' },
  [STAR_STATE.AVAILABLE]: { r: 11, fill: '#5470a8', stroke: '#a8bde8', label: 'Доступно' },
  [STAR_STATE.LOCKED]: { r: 8, fill: '#2a3660', stroke: '#4a5885', label: 'Закрыто' },
};

const RESOURCE_TABS = [
  { type: 'offline', label: 'Офлайн', icon: Building2, hint: 'Кружки и мастер-классы рядом с вами' },
  { type: 'online', label: 'Онлайн', icon: Globe, hint: 'Курсы и видеоуроки' },
  { type: 'tool', label: 'ИТ-инструмент', icon: Wrench, hint: 'Программы для практики' },
];

/* ------------------------------------------------------------------- page */

/**
 * NB: this component must NOT be named `Map`. A function declaration binds its
 * own name inside its body, so the `new Map(...)` calls below would resolve to
 * the component itself instead of the global Map constructor and recurse until
 * the stack overflows — a runtime-only crash that no linter catches.
 */
export default function MapPage() {
  const { state, loading, error, completeStar, resetStar } = useAppState();
  const { user } = useAuth();

  const [selectedStarId, setSelectedStarId] = useState(null);
  const [hoveredStarId, setHoveredStarId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  // 'auto' → one constellation on narrow screens, all of them on wide ones.
  // 'all' → user explicitly asked for everything. A number → that constellation.
  const [focusChoice, setFocusChoice] = useState('auto');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [box, setBox] = useState({ w: 1000, h: 560 });

  // Observe the rendered size: both the aspect-correct viewBox and the
  // pixel-constant star sizing depend on it.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Memoised so the `?? []` fallbacks don't produce a new array identity on
  // every render and invalidate every downstream useMemo.
  const stars = useMemo(() => state?.stars ?? [], [state]);
  const edges = useMemo(() => state?.edges ?? [], [state]);
  const constellations = useMemo(() => state?.constellations ?? [], [state]);
  const completedStars = useMemo(() => state?.completedStars ?? [], [state]);
  const recommendedIds = useMemo(() => state?.user?.recommendedGraphs ?? [], [state]);

  /** Which constellations are on screen: the personalised set, or everything. */
  const visibleConstellationIds = useMemo(() => {
    if (showAll || !recommendedIds.length) return constellations.map((c) => c.id);
    return recommendedIds;
  }, [showAll, recommendedIds, constellations]);

  const unlockedSet = useMemo(() => new Set(visibleConstellationIds), [visibleConstellationIds]);

  /**
   * Программа ребёнка — то, что ему подобрала диагностика. В отличие от
   * `visibleConstellationIds` она не зависит от переключателя «Мои направления /
   * Все»: это фильтр отображения, и прогресс от него меняться не должен.
   */
  const programmeIds = useMemo(
    () => (recommendedIds.length ? recommendedIds : constellations.map((c) => c.id)),
    [recommendedIds, constellations]
  );
  const currentStarId = state?.currentStarId ?? null;

  /**
   * Several constellations side by side are unreadable on a phone: the labels
   * collide and every star shrinks. On narrow screens we therefore focus one
   * constellation at a time — by default the one holding the current step.
   */
  const isNarrow = box.w > 0 && box.w < 700;
  const currentConstellationId = useMemo(() => {
    const cur = stars.find((s) => s.id === currentStarId);
    if (cur) return cur.constellationId;
    return visibleConstellationIds[0] ?? null;
  }, [stars, currentStarId, visibleConstellationIds]);

  const focusedId =
    focusChoice === 'auto' ? (isNarrow ? currentConstellationId : null) : focusChoice === 'all' ? null : focusChoice;

  const visibleSet = useMemo(
    () => (focusedId ? new Set([focusedId]) : unlockedSet),
    [focusedId, unlockedSet]
  );

  /**
   * Раскладка считается под текущий набор, а не берётся из базы. В базе центры
   * созвездий стоят на сетке 4×4 сразу под все четырнадцать направлений, и при
   * четырёх открытых на экране оставались те ячейки, которые им случайно
   * достались: кластеры жались к одному краю, половина полотна пустовала.
   */
  const laid = useMemo(() => {
    const shown = constellations.filter((c) => visibleSet.has(c.id));
    const shownStars = stars.filter((s) => visibleSet.has(s.constellationId));
    return layoutConstellations(shown, shownStars, box.w / Math.max(box.h, 1));
  }, [constellations, stars, visibleSet, box]);

  const visibleStars = laid.stars;
  const laidConstellations = laid.constellations;

  const completedSet = useMemo(() => new Set(completedStars.map(Number)), [completedStars]);
  const available = useMemo(
    () => computeAvailability(stars, edges, completedStars, visibleConstellationIds),
    [stars, edges, completedStars, visibleConstellationIds]
  );

  const unlockedConstellations = useMemo(
    () => constellations.filter((c) => unlockedSet.has(c.id)),
    [constellations, unlockedSet]
  );

  // Позиции — из пересчитанной раскладки, иначе связи и подписи уедут.
  const starsById = useMemo(() => new Map(visibleStars.map((s) => [s.id, s])), [visibleStars]);
  const constellationsById = useMemo(
    () => new Map(laidConstellations.map((c) => [c.id, c])),
    [laidConstellations]
  );

  /**
   * Auto-fit to the content, then expand the short side so the viewBox aspect
   * matches the container. Without this the browser letterboxes a wide viewBox
   * inside a tall phone screen and the whole map collapses into a thin strip.
   *
   * Легенда лежит поверх полотна, поэтому нижний ряд созвездий уезжал под неё.
   * Резервируем эту полосу прямо в viewBox; на узком экране легенда переносится
   * на две строки и занимает больше места.
   */
  const base = useMemo(() => {
    const overlayBottomPx = isNarrow ? 84 : 56;
    const overlayTopPx = 8;

    // Поля привязаны к радиусу кластера. Когда рядов несколько, вертикальный
    // отступ нужен такой же, как горизонтальный; в один ряд он только раздувает
    // пустоту, поэтому там он вдвое меньше.
    const r = laid.radius || 0;
    const tight = (laid.rows || 1) <= 1;
    const b = boundsOf(
      visibleStars,
      r ? { x: r * 0.85, top: r * (tight ? 0.6 : 1.15), bottom: r * (tight ? 0.4 : 0.85) } : undefined
    );
    const target = box.w / Math.max(box.h, 1);
    const current = b.width / Math.max(b.height, 1);

    const fitted =
      current < target
        ? (() => {
            const width = b.height * target;
            return { ...b, x: b.x - (width - b.width) / 2, width };
          })()
        : (() => {
            const height = b.width / target;
            return { ...b, y: b.y - (height - b.height) / 2, height };
          })();

    // Мировые единицы на пиксель считаем по уже подогнанной ширине, затем
    // расширяем рамку на высоту накладок — содержимое сдвигается внутрь.
    const perPx = fitted.width / Math.max(box.w, 1);
    const top = overlayTopPx * perPx;
    const bottom = overlayBottomPx * perPx;
    return { ...fitted, y: fitted.y - top, height: fitted.height + top + bottom };
  }, [visibleStars, laid.radius, laid.rows, box, isNarrow]);

  const viewBox = useMemo(() => {
    const w = base.width / zoom;
    const h = base.height / zoom;
    const cx = base.x + base.width / 2 + pan.x;
    const cy = base.y + base.height / 2 + pan.y;
    return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
  }, [base, zoom, pan]);

  /** SVG units per CSS pixel — multiply any pixel size by this. */
  const unit = base.width / zoom / Math.max(box.w, 1);

  const selectedStar = selectedStarId ? starsById.get(selectedStarId) : null;

  /** Toggling the visible set also recentres the camera, so switching views
   *  never leaves the user staring at empty space. */
  const toggleShowAll = (next) => {
    setShowAll(next);
    setFocusChoice('auto');
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const focusConstellation = (choice) => {
    setFocusChoice(choice);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /* ------------------------------------------------------------ interaction */

  const openStar = useCallback(
    (star) => {
      setActionError(null);
      const st = starState(star, { completed: completedSet, available, currentStarId });
      if (st === STAR_STATE.LOCKED) return;
      setSelectedStarId(star.id);
    },
    [completedSet, available, currentStarId]
  );

  const handleComplete = async () => {
    if (!selectedStar) return;
    setBusy(true);
    setActionError(null);
    try {
      await completeStar(selectedStar.id);
      setSelectedStarId(null);
    } catch (err) {
      if (err?.response?.status === 402) {
        setSelectedStarId(null);
        setPaywallOpen(true);
      } else {
        setActionError(errorMessage(err, 'Не удалось отметить шаг'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!selectedStar) return;
    setBusy(true);
    setActionError(null);
    try {
      await resetStar(selectedStar.id);
      setSelectedStarId(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось сбросить шаг'));
    } finally {
      setBusy(false);
    }
  };

  // Pan by dragging empty canvas; pointer events so it works on touch too.
  const onPointerDown = (e) => {
    if (e.target.closest('[data-star]')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, pan: { ...pan } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = base.width / zoom / rect.width;
    setPan({
      x: drag.pan.x - (e.clientX - drag.x) * scale,
      y: drag.pan.y - (e.clientY - drag.y) * scale,
    });
  };
  const endPan = (e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /* ---------------------------------------------------------------- render */

  if (loading && !state) return <Spinner label="Строим вашу карту…" />;
  if (error && !state) return <Alert tone="error">{error}</Alert>;
  if (!state) return null;

  // Считаем по открытым направлениям, а не по показанным: переключение
  // «Мои направления / Все» — это фильтр отображения, и от него прогресс
  // ребёнка меняться не должен.
  const { done, total, percent } = progressIn(stars, completedStars, programmeIds);

  return (
    <div className="space-y-4">
      {/* Панель управления картой */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm text-slate-400">Прогресс по открытым созвездиям</p>
            <p className="font-display text-lg font-bold text-white">
              {done} из {skills(total)} · {percent}%
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recommendedIds.length > 0 && (
            <div className="flex rounded-xl border border-white/10 p-0.5" role="group" aria-label="Отображение созвездий">
              <button
                type="button"
                onClick={() => toggleShowAll(false)}
                aria-pressed={!showAll}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  !showAll ? 'bg-gold-400 text-space-950' : 'text-slate-300 hover:text-white'
                )}
              >
                Мои направления
              </button>
              <button
                type="button"
                onClick={() => toggleShowAll(true)}
                aria-pressed={showAll}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  showAll ? 'bg-gold-400 text-space-950' : 'text-slate-300 hover:text-white'
                )}
              >
                Все ({constellations.length})
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 rounded-xl border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              aria-label="Отдалить"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="Показать карту целиком"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Maximize2 size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              aria-label="Приблизить"
              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Выбор созвездия — на узком экране показываем по одному */}
      {unlockedConstellations.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Выбор созвездия">
          <button
            type="button"
            onClick={() => focusConstellation('all')}
            aria-pressed={!focusedId}
            className={cx(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
              !focusedId
                ? 'border-gold-400/60 bg-gold-400/15 text-gold-200'
                : 'border-white/12 text-slate-300 hover:border-white/25 hover:text-white'
            )}
          >
            Все созвездия
          </button>
          {unlockedConstellations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => focusConstellation(c.id)}
              aria-pressed={focusedId === c.id}
              className={cx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                focusedId === c.id
                  ? 'border-gold-400/60 bg-gold-400/15 text-gold-200'
                  : 'border-white/12 text-slate-300 hover:border-white/25 hover:text-white'
              )}
            >
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Карта */}
      <div className="glass relative overflow-hidden rounded-3xl">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="h-[58vh] max-h-[720px] min-h-[380px] w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          role="application"
          aria-label="Карта созвездий компетенций. Используйте Tab для перехода между навыками."
        >
          <defs>
            <radialGradient id="star-glow">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Подписи созвездий.
              Названия обрезаются под ширину ячейки: в режиме «все созвездия»
              на экран помещается 14 кластеров, и полные подписи наезжали друг
              на друга, превращая карту в кашу. */}
          {laidConstellations.map((c) => {
              // Сколько места по горизонтали остаётся подписи на экране.
              // Ширину ячейки берём из текущей раскладки: она зависит от размера
              // кластера, а не от константы, иначе при плотной сетке подписи
              // рассчитываются на несуществующий запас и наезжают друг на друга.
              const availablePx = ((laid.cellW || 620) / unit) * 0.88;
              const fontPx = 16;
              const charPx = fontPx * 0.62; // ширина символа Montserrat Bold
              const maxChars = Math.floor(availablePx / charPx);

              // Если названию не хватает места даже в обрезанном виде, оставляем
              // только иконку: названия всё равно продублированы в чипах выше,
              // а наезжающие друг на друга подписи делали карту нечитаемой.
              const iconOnly = availablePx < 150;
              const label = iconOnly
                ? c.icon
                : c.name.length + 2 > maxChars
                  ? `${c.icon} ${c.name.slice(0, Math.max(3, maxChars - 3))}…`
                  : `${c.icon} ${c.name}`;

              return (
                <text
                  key={`c-${c.id}`}
                  aria-hidden="true"
                  data-constellation-label={c.name}
                  x={c.x}
                  // Отступ считается в мировых координатах: он должен
                  // отталкиваться от радиуса кластера (±150), а не от
                  // масштаба, иначе при уменьшении подпись уезжает на
                  // соседние созвездия.
                  y={c.y - (170 + 16 * unit)}
                  textAnchor="middle"
                  className="font-display"
                  fill={c.accent}
                  fontSize={(iconOnly ? 22 : fontPx) * unit}
                  fontWeight="700"
                  opacity="0.95"
                >
                  {label}
                </text>
              );
            })}

          {/* Связи между навыками */}
          {edges.map((e) => {
            const a = starsById.get(e.parent);
            const b = starsById.get(e.child);
            if (!a || !b) return null;
            if (!visibleSet.has(a.constellationId) || !visibleSet.has(b.constellationId)) return null;

            const bothDone = completedSet.has(a.id) && completedSet.has(b.id);
            const constellation = constellationsById.get(a.constellationId);

            return (
              <line
                key={`e-${e.parent}-${e.child}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={bothDone ? '#fbbf24' : constellation?.stroke || 'rgba(148,163,184,0.3)'}
                strokeWidth={(bothDone ? 2 : 1.3) * unit}
                strokeDasharray={bothDone ? undefined : `${5 * unit} ${6 * unit}`}
                opacity={bothDone ? 0.9 : 0.55}
              />
            );
          })}

          {/* Звёзды */}
          {visibleStars.map((star) => {
            const st = starState(star, { completed: completedSet, available, currentStarId });
            const style = STAR_STYLE[st];
            const isHovered = hoveredStarId === star.id;
            const isLocked = st === STAR_STATE.LOCKED;
            const isCurrent = st === STAR_STATE.CURRENT;
            const constellation = constellationsById.get(star.constellationId);

            const r = style.r * unit;
            // Названия видны сразу у пройденных и текущей звезды, у остальных —
            // при наведении: так карта читается с первого взгляда, но не пестрит.
            // На узком экране постоянных подписей нет: кластеры там плотные,
            // и название неизбежно налезает на соседнюю звезду. Текущий шаг
            // назван в полосе под картой, остальные открываются по касанию.
            const showLabel =
              !isNarrow && (isCurrent || st === STAR_STATE.COMPLETED) && laidConstellations.length <= 3;
            const maxLabel = isNarrow ? 17 : 26;
            const shortName =
              star.name.length > maxLabel ? `${star.name.slice(0, maxLabel - 1)}…` : star.name;

            return (
              <g
                key={star.id}
                data-star={star.id}
                tabIndex={isLocked ? -1 : 0}
                role="button"
                aria-label={`${star.name}. ${style.label}. Уровень: ${star.level}`}
                aria-disabled={isLocked || undefined}
                className={cx('outline-none', !isLocked && 'cursor-pointer')}
                onClick={() => openStar(star)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    openStar(star);
                  }
                }}
                onMouseEnter={() => setHoveredStarId(star.id)}
                onMouseLeave={() => setHoveredStarId((id) => (id === star.id ? null : id))}
                onFocus={() => setHoveredStarId(star.id)}
                onBlur={() => setHoveredStarId((id) => (id === star.id ? null : id))}
              >
                {(st === STAR_STATE.COMPLETED || isCurrent) && (
                  <circle cx={star.x} cy={star.y} r={r * 2.9} fill="url(#star-glow)" />
                )}

                {isCurrent && (
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={r + 8 * unit}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={1.8 * unit}
                    opacity="0.7"
                    className="animate-ping"
                    style={{ transformOrigin: `${star.x}px ${star.y}px` }}
                  />
                )}

                {/* Прозрачная зона нажатия — чтобы попасть пальцем на телефоне */}
                <circle cx={star.x} cy={star.y} r={Math.max(r * 2.2, 22 * unit)} fill="transparent" />

                <circle
                  cx={star.x}
                  cy={star.y}
                  r={isHovered && !isLocked ? r * 1.2 : r}
                  fill={style.fill}
                  stroke={isHovered && !isLocked ? '#ffffff' : style.stroke}
                  strokeWidth={(isCurrent ? 2.4 : 1.6) * unit}
                  opacity={isLocked ? 0.75 : 1}
                />

                {st === STAR_STATE.COMPLETED && (
                  <path
                    d={`M ${star.x - r * 0.42} ${star.y + r * 0.02} l ${r * 0.3} ${r * 0.34} l ${r * 0.6} ${-r * 0.66}`}
                    fill="none"
                    stroke="#3b2708"
                    strokeWidth={2.2 * unit}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Постоянная подпись под ключевыми звёздами */}
                {showLabel && !isHovered && (
                  <text
                    pointerEvents="none"
                    x={star.x}
                    y={star.y + r + 14 * unit}
                    textAnchor="middle"
                    fill={isCurrent ? '#fde68a' : '#cbd5e1'}
                    fontSize={11 * unit}
                    fontWeight="600"
                  >
                    {shortName}
                  </text>
                )}

                {/* Подсказка при наведении и с клавиатуры */}
                {isHovered && (
                  <g pointerEvents="none">
                    <rect
                      x={star.x - (star.name.length * 3.6 + 14) * unit}
                      y={star.y - r - 34 * unit}
                      width={(star.name.length * 7.2 + 28) * unit}
                      height={26 * unit}
                      rx={7 * unit}
                      fill="rgba(5,7,15,0.96)"
                      stroke={constellation?.accent || '#fbbf24'}
                      strokeWidth={unit}
                    />
                    <text
                      x={star.x}
                      y={star.y - r - 16 * unit}
                      textAnchor="middle"
                      fill="#e8edf7"
                      fontSize={12 * unit}
                      fontWeight="600"
                    >
                      {star.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Легенда */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl bg-space-950/75 px-3 py-2 text-[11px] text-slate-300 backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-gold-400" /> Пройдено
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-gold-500 ring-2 ring-white/70" /> Текущий шаг
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#475e8f]" /> Доступно
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#1b2547] ring-1 ring-[#39456e]" /> Закрыто
          </span>
        </div>
      </div>

      {/* Подсказка про следующий шаг */}
      {currentStarId && starsById.get(currentStarId) && (
        <button
          type="button"
          onClick={() => openStar(starsById.get(currentStarId))}
          className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-gold-400/40"
        >
          <Sparkles className="shrink-0 text-gold-400" size={20} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-400">Ваш следующий шаг</span>
            <span className="block truncate font-semibold text-white">{starsById.get(currentStarId).name}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-gold-300">Открыть →</span>
        </button>
      )}

      <StarModal
        key={selectedStar?.id ?? 'none'}
        star={selectedStar}
        constellation={selectedStar ? constellationsById.get(selectedStar.constellationId) : null}
        resources={state.resources}
        isCompleted={selectedStar ? completedSet.has(selectedStar.id) : false}
        userCity={user?.city}
        busy={busy}
        error={actionError}
        onComplete={handleComplete}
        onReset={handleReset}
        onClose={() => {
          setSelectedStarId(null);
          setActionError(null);
        }}
      />

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------- star modal */

function StarModal({
  star,
  constellation,
  resources,
  isCompleted,
  userCity,
  busy,
  error,
  onComplete,
  onReset,
  onClose,
}) {
  // Tab state resets naturally: the parent remounts this via key={star.id}.
  const [tab, setTab] = useState('offline');

  if (!star) return null;

  const starResources = (resources || []).filter((r) => r.starId === star.id);
  const active = starResources.filter((r) => r.type === tab);

  return (
    <Modal
      open={Boolean(star)}
      onClose={onClose}
      title={star.name}
      subtitle={`${constellation?.icon || ''} ${constellation?.name || ''} · ${star.level}`}
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          {isCompleted ? (
            <Button variant="secondary" loading={busy} onClick={onReset}>
              Отменить выполнение
            </Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={onComplete} data-autofocus>
              <Check size={16} aria-hidden="true" />Я выполнил этот шаг
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {isCompleted && (
          <Badge tone="gold">
            <Check size={13} aria-hidden="true" /> Навык освоен
          </Badge>
        )}

        <p className="leading-relaxed text-slate-300">{star.description}</p>

        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-slate-400">
            Что делать дальше
          </h3>

          <div className="flex gap-1 rounded-xl border border-white/10 p-1" role="tablist" aria-label="Тип ресурса">
            {RESOURCE_TABS.map(({ type, label, icon: Icon }) => {
              const count = starResources.filter((r) => r.type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={tab === type}
                  onClick={() => setTab(type)}
                  className={cx(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm',
                    tab === type ? 'bg-gold-400 text-space-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.split(' ')[0]}</span>
                  {count > 0 && <span className="opacity-60">({count})</span>}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-slate-500">{RESOURCE_TABS.find((t) => t.type === tab)?.hint}</p>

          <div className="mt-3 space-y-2.5">
            {active.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-slate-500">
                Для этого навыка пока нет материалов такого типа.
              </p>
            )}

            {active.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-space-800/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{r.title}</p>
                    {r.detail1 && <p className="mt-1 text-sm text-slate-400">{r.detail1}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.detail2 && <Badge tone="neutral">{r.detail2}</Badge>}
                      {r.type === 'offline' && r.city && (
                        <Badge tone={r.city === userCity ? 'green' : 'neutral'}>
                          {r.city}
                          {r.city === userCity ? ' · ваш город' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {r.link && (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg border border-gold-400/40 px-3 py-2 text-xs font-semibold text-gold-300 transition hover:bg-gold-400/10"
                    >
                      <span className="flex items-center gap-1.5">
                        Открыть <ExternalLink size={13} aria-hidden="true" />
                      </span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!isCompleted && (
          <p className="flex items-start gap-2 rounded-xl bg-space-800/50 px-4 py-3 text-xs text-slate-400">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Отметьте шаг выполненным, когда закончите — звезда загорится золотым, вы получите 50 XP, а следующий навык
            откроется.
          </p>
        )}
      </div>
    </Modal>
  );
}
