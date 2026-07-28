'use strict';

/**
 * DB row → API shape.
 *
 * Centralised so a password hash, a PIN hash or an admin flag can never leak
 * by accident: every user object returned by the API goes through publicUser().
 */

function safeJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    age: row.age ?? null,
    city: row.city ?? null,
    weeklyHours: row.weekly_hours ?? null,
    role: row.role || 'parent',
    avatar: row.avatar ?? null,
    xp: row.xp_points ?? 0,
    subscription: row.subscription_status || 'trial',
    recommendedGraphId: row.recommended_graph_id ?? null,
    recommendedGraphs: safeJsonArray(row.recommended_graphs),
    equipped: {
      avatar: row.equipped_avatar ?? null,
      frame: row.equipped_frame ?? null,
      title: row.equipped_title ?? null,
    },
    isAdmin: Boolean(row.is_admin),
    onboarded: Boolean(row.onboarded),
    hasPin: Boolean(row.has_pin),
  };
}

function publicStar(row) {
  return {
    id: row.id,
    constellationId: row.constellation_id,
    name: row.name,
    level: row.level,
    x: row.x,
    y: row.y,
    description: row.description,
    orderIndex: row.order_index,
  };
}

function publicConstellation(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description_for_ai,
    x: row.x,
    y: row.y,
    stroke: row.stroke,
    accent: row.accent,
    icon: row.icon,
    sortOrder: row.sort_order,
  };
}

function publicResource(row) {
  return {
    id: row.id,
    starId: row.star_id,
    type: row.type,
    title: row.title,
    detail1: row.detail1,
    detail2: row.detail2,
    link: row.link,
    city: row.city,
  };
}

function publicPortfolioItem(row) {
  return {
    id: row.id,
    title: row.title,
    starId: row.star_id,
    image: row.image,
    comment: row.comment,
    verifiedByAi: Boolean(row.verified_by_ai),
    aiFeedback: row.ai_feedback,
    createdAt: row.created_at,
    date: formatRuDate(row.created_at),
  };
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC; render it as "14 июня, 15:40". */
function formatRuDate(value) {
  if (!value) return '';
  const iso = typeof value === 'string' && !value.includes('T') ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function publicLog(row) {
  return { id: row.id, text: row.log_text, createdAt: row.created_at, date: formatRuDate(row.created_at) };
}

/** Площадка для очных занятий. `directions` в базе лежит строкой JSON. */
function publicVenue(row) {
  return {
    id: row.id,
    code: row.code,
    network: row.network,
    name: row.name,
    org: row.org,
    city: row.city,
    address: row.address,
    url: row.url,
    kind: row.kind,
    format: row.format,
    priceNote: row.price_note,
    ageRange: row.age_range,
    summary: row.summary,
    directions: safeJsonArray(row.directions),
    verified: Boolean(row.verified),
  };
}

function publicStoreItem(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    price: row.price,
    type: row.type,
    icon: row.icon,
    payload: row.payload,
  };
}

module.exports = {
  publicUser,
  publicStar,
  publicConstellation,
  publicResource,
  publicPortfolioItem,
  publicLog,
  publicStoreItem,
  publicVenue,
  formatRuDate,
  safeJsonArray,
};
