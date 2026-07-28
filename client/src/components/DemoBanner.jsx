import { useState } from 'react';
import { Info, RotateCcw, X } from 'lucide-react';

import { IS_DEMO, resetDemo } from '@demo';
import { Button, Modal } from './ui';

/**
 * Honest labelling for the GitHub Pages build.
 *
 * Anyone opening the public link should immediately understand that this runs
 * entirely in their browser: there is no server, and whatever they do stays on
 * their own device. Renders nothing in the real build.
 */
export default function DemoBanner() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!IS_DEMO || hidden) return null;

  return (
    <>
      <div className="relative z-40 flex items-center justify-center gap-2 bg-gold-400 px-3 py-1.5 text-center text-[13px] font-semibold text-space-950">
        <span>
          Демоверсия — работает прямо в браузере, без сервера.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 underline underline-offset-2 transition hover:bg-space-950/10"
        >
          <Info size={13} aria-hidden="true" />
          Подробнее
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Скрыть уведомление"
          className="absolute right-2 rounded-md p-1 transition hover:bg-space-950/10"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Это демонстрационная версия"
        subtitle="Полностью рабочая, но без серверной части"
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="secondary"
              onClick={() => {
                resetDemo();
                window.location.href = import.meta.env.BASE_URL;
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Сбросить демо
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)} data-autofocus>
              Понятно
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            GitHub Pages отдаёт только статические файлы, поэтому здесь нет ни Node.js, ни базы данных. Весь бэкенд
            воспроизведён прямо в браузере.
          </p>

          <ul className="space-y-1.5">
            <li>• Регистрация, прогресс и портфолио сохраняются <b className="text-slate-100">только в этом браузере</b></li>
            <li>• Другие люди ваших данных не увидят</li>
            <li>• Очистка данных сайта сбросит всё к начальному состоянию</li>
            <li>• Редактирование карты в админ-панели отключено</li>
          </ul>

          <p>
            Содержание — 14 созвездий, 70 навыков и 210 ресурсов — выгружено из настоящей базы продукта, а подбор
            направлений считает тот же алгоритм, что и на сервере.
          </p>

          <div className="rounded-xl bg-space-800/60 px-3 py-2.5 text-xs">
            <p className="mb-1 font-semibold text-slate-200">Готовые аккаунты для входа</p>
            <p>Ребёнок: demo@talentmap.ai / demo123</p>
            <p>Администратор: admin@talentmap.ai / admin12345</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
