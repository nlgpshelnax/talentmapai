import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, ExternalLink, Globe, BadgeCheck, RefreshCw } from 'lucide-react';

import api, { errorMessage } from '../lib/api';
import { Badge, Button, Spinner, cx } from './ui';
import { plural } from '../lib/plural';

/**
 * Где заниматься очно.
 *
 * Раньше на навык приходился ровно один «офлайн-ресурс» с жёстко вшитым
 * городом, поэтому ребёнок из Омска видел мастер-класс в Казани — и это был
 * весь ответ на вопрос «куда пойти». Теперь площадки привязаны к направлению и
 * городу: сначала то, что есть рядом, затем честно — что есть в других
 * городах и куда можно попасть из любой точки страны.
 */

/**
 * Подписываем только то, что действительно меняет решение родителя:
 * государственная площадка обычно бесплатна, при вузе — это доступ к
 * настоящей лаборатории. «Частная» и «некоммерческая» рядом с ценником
 * ничего не добавляют, а порой и противоречат ему.
 */
const KIND_LABEL = {
  state: 'Государственная',
  university: 'При вузе',
};

/**
 * Подпись организации нужна, только если она добавляет знание. «Британская
 * высшая школа дизайна» под заголовком «Британская высшая школа дизайна» —
 * шум, а «Московская школа фотографии и мультимедиа им. А. Родченко» под
 * «Школой Родченко» — полезное уточнение.
 */
function usefulOrg(venue) {
  const name = (venue.name || '').toLowerCase();
  const org = (venue.org || '').toLowerCase();
  if (!org || org === name) return null;
  if (org.startsWith(name) || name.startsWith(org)) return null;
  return venue.org;
}

/** Загрузка площадок по направлению. Город берётся из профиля на сервере. */
export function useVenues(constellationId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (signal) => {
      if (!constellationId) {
        setLoading(false);
        return;
      }
      try {
        setError('');
        const res = await api.get('/venues', { params: { constellationId }, ...(signal ? { signal } : {}) });
        if (mounted.current) setData(res.data);
      } catch (err) {
        if (mounted.current && err?.code !== 'ERR_CANCELED') {
          setError(errorMessage(err, 'Не удалось загрузить площадки.'));
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [constellationId]
  );

  useEffect(() => {
    const controller = new AbortController();
    // Вызов в микротаске: в синхронном теле эффекта состояние не меняется.
    Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  return { data, loading, error, reload: () => load() };
}

/** Одна карточка площадки. */
export function VenueCard({ venue, showCity = false, tone = 'default' }) {
  return (
    <div
      className={cx(
        'rounded-xl border p-4',
        tone === 'local' ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-white/10 bg-space-800/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{venue.name}</p>
            {venue.verified && (
              <span
                title="Ссылка проверена вручную"
                className="inline-flex items-center gap-1 text-xs text-emerald-300"
              >
                <BadgeCheck size={13} aria-hidden="true" />
                проверено
              </span>
            )}
          </div>

          {usefulOrg(venue) && <p className="mt-0.5 text-xs text-slate-500">{usefulOrg(venue)}</p>}
          {venue.summary && <p className="mt-1.5 text-sm text-slate-400">{venue.summary}</p>}

          {venue.address && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-400">
              <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {venue.address}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {showCity && (
              <Badge tone={tone === 'local' ? 'green' : 'neutral'}>
                {venue.format === 'online' ? (
                  <>
                    <Globe size={12} aria-hidden="true" />
                    {venue.city}
                  </>
                ) : (
                  <>
                    <MapPin size={12} aria-hidden="true" />
                    {venue.city}
                  </>
                )}
              </Badge>
            )}
            {venue.priceNote && (
              <Badge tone={/бесплатн/i.test(venue.priceNote) ? 'green' : 'neutral'}>{venue.priceNote}</Badge>
            )}
            {venue.ageRange && <Badge tone="neutral">{venue.ageRange}</Badge>}
            {venue.kind && KIND_LABEL[venue.kind] && (
              <span className="text-xs text-slate-500">{KIND_LABEL[venue.kind]}</span>
            )}
          </div>
        </div>

        {venue.url && (
          <a
            href={venue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-gold-400/40 px-3 py-2 text-xs font-semibold text-gold-300 transition hover:bg-gold-400/10"
          >
            <span className="flex items-center gap-1.5">
              Сайт <ExternalLink size={13} aria-hidden="true" />
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Полный блок «где заниматься»: свой город, другие города, вся страна.
 * `limit` ограничивает длину каждой корзины — в модальном окне навыка список
 * должен помещаться на экран, в родительском разделе можно показать больше.
 */
export function VenueList({ constellationId, userCity, limit = 4, emptyHint }) {
  const { data, loading, error, reload } = useVenues(constellationId);
  const [expanded, setExpanded] = useState(false);

  if (loading) return <Spinner label="Ищем площадки…" />;

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Button type="button" variant="secondary" onClick={reload}>
          <RefreshCw size={15} aria-hidden="true" />
          Повторить
        </Button>
      </div>
    );
  }

  const local = data?.local || [];
  const elsewhere = data?.elsewhere || [];
  const anywhere = data?.anywhere || [];
  const cap = expanded ? Infinity : limit;

  if (!local.length && !elsewhere.length && !anywhere.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-slate-500">
        {emptyHint || 'Пока не нашли очных занятий по этому направлению.'}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {local.length > 0 && (
        <section>
          <h4 className="mb-2.5 text-sm font-semibold text-slate-200">
            {userCity ? `В городе ${userCity}` : 'Рядом с вами'}
            <span className="ml-1.5 font-normal text-slate-500">
              — {local.length} {plural(local.length, 'место', 'места', 'мест')}
            </span>
          </h4>
          <div className="space-y-2.5">
            {local.slice(0, cap).map((v) => (
              <VenueCard key={v.code} venue={v} tone="local" />
            ))}
          </div>
        </section>
      )}

      {!local.length && elsewhere.length > 0 && (
        <p className="text-sm text-slate-400">
          {userCity ? `Очных занятий в городе ${userCity} мы пока не нашли.` : 'Город не указан в профиле.'} Вот что есть
          в других городах — и то, куда можно попасть откуда угодно.
        </p>
      )}

      {anywhere.length > 0 && (
        <section>
          <h4 className="mb-2.5 text-sm font-semibold text-slate-200">Откуда угодно</h4>
          <div className="space-y-2.5">
            {anywhere.slice(0, cap).map((v) => (
              <VenueCard key={v.code} venue={v} showCity />
            ))}
          </div>
        </section>
      )}

      {elsewhere.length > 0 && (
        <section>
          <h4 className="mb-2.5 text-sm font-semibold text-slate-200">В других городах</h4>
          <div className="space-y-2.5">
            {elsewhere.slice(0, cap).map((v) => (
              <VenueCard key={v.code} venue={v} showCity />
            ))}
          </div>
        </section>
      )}

      {!expanded && local.length + elsewhere.length + anywhere.length > limit && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setExpanded(true)}>
          Показать все площадки
        </Button>
      )}
    </div>
  );
}
