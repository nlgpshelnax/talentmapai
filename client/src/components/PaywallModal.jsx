import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

import api, { errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useAppState } from '../context/AppStateContext';
import { Alert, Button, Modal } from './ui';

const BENEFITS = [
  'Все 14 направлений и 70 навыков',
  'Неограниченное количество пройденных шагов',
  'Портфолио без ограничений',
  'Подбор кружков и курсов по вашему городу',
  'ИИ-наставник для ребёнка',
];

/**
 * Shown when a trial account hits the free star limit.
 * The upgrade is a demo action — there is no payment provider wired in — but
 * unlike the prototype it can only ever affect the signed-in account, and the
 * limit itself is enforced by the server rather than merely hidden in the UI.
 */
export default function PaywallModal({ open, onClose }) {
  const { patchUser } = useAuth();
  const { refresh } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/users/subscription/upgrade');
      patchUser(res.data.user);
      await refresh();
      onClose?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось оформить подписку'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Продолжить с подпиской PRO"
      subtitle="Бесплатно доступны первые 3 навыка"
      size="sm"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" loading={busy} onClick={upgrade} data-autofocus>
            <Sparkles size={16} aria-hidden="true" />
            Оформить PRO
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Не сейчас
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <p className="text-sm text-slate-300">
          Ребёнок прошёл все бесплатные шаги — отличный результат! Чтобы открыть карту целиком, оформите подписку.
        </p>

        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-slate-200">
              <Check size={16} className="mt-0.5 shrink-0 text-gold-400" aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>

        <p className="rounded-xl bg-space-800/60 px-3 py-2 text-xs text-slate-400">
          Демонстрационный режим: оплата не подключена, подписка активируется сразу.
        </p>
      </div>
    </Modal>
  );
}
