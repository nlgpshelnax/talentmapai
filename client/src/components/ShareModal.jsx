import { useMemo, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

import { Button, Modal, Textarea } from './ui';

/**
 * "Поделиться" — required by the TZ's map header and entirely absent from the
 * prototype (which imported the Share2 icon and never rendered it).
 * Shares a text summary of progress; no personal data leaves the device.
 */
export default function ShareModal({ open, onClose, user, done, total, percent }) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(
    () =>
      `${user?.name || 'Мы'} строит карту талантов в TalentMap AI 🌟\n` +
      `Пройдено навыков: ${done} из ${total} (${percent}%).\n` +
      `Следующая цель — новая звезда на карте!`,
    [user, done, total, percent]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const shareNative = async () => {
    // Web Share API where available (mobile); clipboard is the fallback.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TalentMap AI', text });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copying */
      }
    }
    copy();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Поделиться прогрессом"
      subtitle="Покажите близким, как растёт карта талантов"
      size="sm"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button variant="secondary" onClick={copy}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? 'Скопировано' : 'Копировать текст'}
          </Button>
          <Button variant="primary" onClick={shareNative} data-autofocus>
            <Share2 size={16} aria-hidden="true" />
            Поделиться
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-gold-400/25 bg-gradient-to-br from-space-800 to-space-900 p-5 text-center">
          <p className="font-display text-4xl font-extrabold text-gold-400">{percent}%</p>
          <p className="mt-1 text-sm text-slate-300">
            {done} из {total} навыков освоено
          </p>
        </div>

        <Textarea readOnly value={text} rows={4} aria-label="Текст для публикации" className="text-sm" />

        <p className="text-xs text-slate-500">
          Мы не публикуем ничего автоматически — текст просто копируется, вы сами решаете, куда его отправить.
        </p>
      </div>
    </Modal>
  );
}
