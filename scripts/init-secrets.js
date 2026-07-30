'use strict';

/**
 * Генератор секретов для боевого запуска.
 *
 * Три вещи, без которых приложение не стартует на боевом сервере, и которые
 * нельзя придумать из головы: ключ подписи сессий, пароль администратора и
 * список разрешённых доменов. Скрипт печатает готовый блок для файла .env.
 *
 * Пароль намеренно собирается из слов, а не из случайных символов. Его
 * придётся продиктовать по телефону или переписать с экрана — набор вида
 * `xK9#mP2$` в этот момент превращается в источник ошибок, а стойкость у
 * четырёх случайных слов из большого словаря выше, чем у восьми символов.
 *
 * Usage:
 *   node scripts/init-secrets.js            вывести на экран
 *   node scripts/init-secrets.js --write    дописать в .env (существующий не трогает)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Словарь для парольных фраз: короткие однозначные русские слова.
 * Исключены пары, которые путаются на слух, и слова с ё — их набирают по-разному.
 */
const WORDS = [
  'якорь', 'ветер', 'звезда', 'камень', 'лодка', 'мосты', 'облако', 'парус',
  'ручей', 'сокол', 'туман', 'улица', 'фонарь', 'холмы', 'цапля', 'чайка',
  'штурман', 'эхо', 'ясень', 'берег', 'весна', 'гавань', 'долина', 'жемчуг',
  'заря', 'изумруд', 'канат', 'ландыш', 'магнит', 'невод', 'орбита', 'пирс',
  'радуга', 'север', 'тропа', 'узор', 'фрегат', 'хребет', 'циркуль', 'шторм',
  'янтарь', 'аллея', 'бархат', 'вершина', 'гранит', 'дюна', 'озеро', 'зенит',
];

/** Случайный элемент без смещения: остаток от деления его бы внёс. */
function pick(list) {
  const max = Math.floor(0xffffffff / list.length) * list.length;
  let value;
  do {
    value = crypto.randomBytes(4).readUInt32BE(0);
  } while (value >= max);
  return list[value % list.length];
}

/**
 * Парольная фраза: четыре слова плюс число. Словарь из 48 слов даёт
 * 48⁴ × 90 ≈ 478 миллионов сочетаний — при ограничении в восемь попыток на
 * пятнадцать минут перебор занимает столетия.
 */
function passphrase() {
  const words = Array.from({ length: 4 }, () => pick(WORDS));
  const number = 10 + (crypto.randomBytes(1)[0] % 90);
  return `${words.join('-')}-${number}`;
}

const secrets = {
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  ADMIN_PASSWORD: passphrase(),
};

const block = `# ─── Сгенерировано ${new Date().toISOString().slice(0, 10)} ──────────────────────────────────
# Ключ подписи сессий. Смена ключа разлогинит всех разом.
JWT_SECRET=${secrets.JWT_SECRET}

# Пароль администратора. Создаётся при первом запуске вместе с аккаунтом.
# Если база уже создана, смена этой переменной пароль НЕ поменяет —
# меняйте его через раздел «Настройки» в самом приложении.
ADMIN_PASSWORD=${secrets.ADMIN_PASSWORD}
`;

const write = process.argv.includes('--write');
const envPath = path.join(path.dirname(__dirname), '.env');

if (write) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (/^JWT_SECRET=.+$/m.test(existing)) {
    console.error(
      '\nВ файле .env уже есть JWT_SECRET. Скрипт ничего не изменил.\n' +
        'Перезапись сбросила бы все действующие сессии и, возможно, сломала бы рабочий сервер.\n' +
        'Если ключ нужно заменить — сделайте это вручную, осознанно.\n'
    );
    process.exitCode = 1;
  } else {
    fs.appendFileSync(envPath, (existing && !existing.endsWith('\n') ? '\n' : '') + block, 'utf8');
    console.log(`\nСекреты дописаны в ${envPath}\n`);
    console.log(`Пароль администратора: ${secrets.ADMIN_PASSWORD}`);
    console.log('Запишите его сейчас — из файла .env его лучше убрать после первого запуска.\n');
  }
} else {
  console.log(`\n${block}`);
  console.log('Скопируйте блок выше в файл .env, либо запустите с ключом --write.\n');
  console.log(`Пароль администратора: ${secrets.ADMIN_PASSWORD}`);
  console.log('Логин: значение ADMIN_EMAIL (по умолчанию admin@talentmap.ai)\n');
}
