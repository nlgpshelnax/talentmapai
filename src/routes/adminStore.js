'use strict';

/**
 * Управление товарами магазина для администратора.
 *
 * До сих пор 7 наград были «зашиты» в код сидера (src/db/seed.js) и никакого
 * интерфейса не имели. Здесь — полноценный CRUD: код, название, описание, цена,
 * тип (avatar/frame/title), иконка, payload, порядок сортировки.
 *
 * Монтируется в admin.js под общим шлюзом `requireAuth + requireAdmin`; шлюз
 * навешивается и здесь повторно — на случай прямого монтирования роутер не
 * должен оказаться открытым.
 */

const express = require('express');

const { dbAll, dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, z, fields } = require('../middleware/validate');

const router = express.Router();

router.use(requireAuth, requireAdmin);

/**
 * Типы должны совпадать со схемой (CHECK type IN (...)) и с колонками
 * экипировки в store.js: avatar → equipped_avatar и т.д.
 */
const TYPES = ['avatar', 'frame', 'title'];

/**
 * Ряд БД → форма ответа. В отличие от публичного `publicStoreItem`, админу
 * отдаём и `sortOrder` (им управляют только здесь), и `owners` — сколько
 * пользователей уже владеют предметом (для решения об удалении и правках цены).
 */
function serializeItem(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    price: row.price,
    type: row.type,
    icon: row.icon,
    payload: row.payload,
    sortOrder: row.sort_order,
    owners: row.owners ?? 0,
  };
}

const SELECT_WITH_OWNERS = `
  SELECT si.*, (SELECT COUNT(*) FROM purchases p WHERE p.item_id = si.id) AS owners
    FROM store_items si`;

// ------------------------------------------------------------------ list

/** Каталог с числом владельцев по каждому предмету. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await dbAll(`${SELECT_WITH_OWNERS} ORDER BY si.sort_order, si.id`);
    res.json({ items: rows.map(serializeItem) });
  })
);

// --------------------------------------------------------------- schema

/**
 * `code` — стабильный уникальный идентификатор (по нему сидер делает upsert),
 * поэтому разрешаем только латиницу/цифры/подчёркивание и не даём пробелов.
 * `payload` — то, что реально «надевается»: эмодзи для аватара, ключ рамки
 * (`gold`/`comet`) или текст титула. Длину payload держим щедрой (титул — это
 * фраза), но ограниченной.
 */
const codeField = z
  .string()
  .trim()
  .min(2, 'Код от 2 символов')
  .max(60, 'Слишком длинный код')
  .regex(/^[a-z0-9_]+$/i, 'Код: только латиница, цифры и подчёркивание');

const baseItemSchema = z.object({
  code: codeField,
  title: fields.plainText(80, { min: 2, minMsg: 'Название от 2 символов' }),
  description: fields.plainText(240).default(''),
  price: z.coerce.number().int().min(0, 'Цена не может быть отрицательной').max(1_000_000),
  type: z.enum(TYPES),
  icon: z.string().trim().min(1, 'Укажите иконку').max(16).default('✨'),
  payload: z.string().trim().min(1, 'Укажите содержимое (payload)').max(120),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
});

// ---------------------------------------------------------------- create

router.post(
  '/',
  validate(baseItemSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;

    const existing = await dbGet('SELECT id FROM store_items WHERE code = ? COLLATE NOCASE', [b.code]);
    if (existing) throw ApiError.conflict('Товар с таким кодом уже существует');

    const sortOrder =
      b.sort_order ??
      (await dbGet('SELECT COALESCE(MAX(sort_order), 0) + 1 AS m FROM store_items')).m;

    const { lastID } = await dbRun(
      `INSERT INTO store_items (code, title, description, price, type, icon, payload, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.code, b.title, b.description, b.price, b.type, b.icon, b.payload, sortOrder]
    );

    const row = await dbGet(`${SELECT_WITH_OWNERS} WHERE si.id = ?`, [lastID]);
    res.status(201).json({ success: true, item: serializeItem(row) });
  })
);

// ---------------------------------------------------------------- update

/**
 * Правка предмета.
 *
 * Важно: изменение цены НЕ пересчитывает никого задним числом. Уже купленные
 * предметы остаются у владельцев, списанный ранее опыт не возвращается и не
 * доначисляется — покупка была совершена по цене, действовавшей на тот момент.
 * Здесь мы меняем только карточку товара в каталоге; таблицу purchases не
 * трогаем вовсе.
 */
router.put(
  '/:id',
  validate(baseItemSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM store_items WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Товар не найден');

    if (req.body.code !== undefined) {
      const clash = await dbGet('SELECT id FROM store_items WHERE code = ? COLLATE NOCASE AND id != ?', [
        req.body.code,
        id,
      ]);
      if (clash) throw ApiError.conflict('Товар с таким кодом уже существует');
    }

    const map = {
      code: 'code',
      title: 'title',
      description: 'description',
      price: 'price',
      type: 'type',
      icon: 'icon',
      payload: 'payload',
      sort_order: 'sort_order',
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(req.body[key]);
      }
    }
    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE store_items SET ${sets.join(', ')} WHERE id = ?`, params);

    const row = await dbGet(`${SELECT_WITH_OWNERS} WHERE si.id = ?`, [id]);
    res.json({ success: true, item: serializeItem(row) });
  })
);

// ---------------------------------------------------------------- delete

/**
 * Удаление товара.
 *
 * РЕШЕНИЕ: купленный кем-либо товар удалить НЕЛЬЗЯ (возвращаем 409 с числом
 * владельцев). Товар без покупок удаляется свободно.
 *
 * Почему так, а не «жёстко удалить». Внешний ключ purchases.item_id объявлен с
 * `ON DELETE CASCADE`, поэтому физическое удаление молча снесло бы записи о
 * покупках. Хуже того, «надетый» предмет хранится в users.equipped_* как
 * payload-строка (см. store.js), а не как ссылка на товар: после удаления
 * пользователь визуально остался бы, например, в аватаре «Пришелец», но в
 * магазине этого предмета уже нет — он не значится купленным и его нельзя снять
 * штатно. Это порча данных у живого пользователя.
 *
 * Мягкое удаление (флаг «архивный») было бы идеальным, но требует новой колонки
 * в схеме store_items — а схема вне зоны этой задачи. Поэтому выбран безопасный
 * и предсказуемый для клиента вариант: отказ с понятным объяснением. Чтобы
 * убрать востребованный товар из витрины, админ может обнулить/поднять цену или
 * оставить его как есть — данные пользователей при этом не страдают.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const item = await dbGet('SELECT id, title FROM store_items WHERE id = ?', [id]);
    if (!item) throw ApiError.notFound('Товар не найден');

    const { n: owners } = await dbGet('SELECT COUNT(*) AS n FROM purchases WHERE item_id = ?', [id]);
    if (owners > 0) {
      throw ApiError.conflict(
        `Этот товар уже купили ${owners} польз. Удаление снесло бы записи о покупках и сломало ` +
          'надетый предмет у этих пользователей. Товар можно изменить, но не удалить.'
      );
    }

    await dbRun('DELETE FROM store_items WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

module.exports = router;
