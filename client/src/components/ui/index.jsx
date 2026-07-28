import { useEffect, useId, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

/* ------------------------------------------------------------------ utils */

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ----------------------------------------------------------------- Button */

const VARIANTS = {
  primary:
    'bg-gradient-to-r from-gold-400 to-gold-500 text-space-950 hover:from-gold-300 hover:to-gold-400 shadow-lg shadow-gold-500/25',
  secondary: 'bg-space-700 text-slate-100 hover:bg-space-600 border border-white/10',
  ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
  outline: 'border border-gold-400/50 text-gold-300 hover:bg-gold-400/10',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3.5 text-base gap-2.5',
};

export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:transform-none',
        'active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ Modal */

/**
 * Accessible dialog: Escape closes, focus is trapped and restored, background
 * scroll is locked. The prototype's modals had none of this — it even printed
 * "ESC — отмена" on screen while no key handler existed anywhere in the app.
 */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', labelledBy }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    // Move focus into the dialog on open.
    const timer = setTimeout(() => {
      const target = panelRef.current?.querySelector('[data-autofocus]') || panelRef.current;
      target?.focus?.();
    }, 30);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      clearTimeout(timer);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-space-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? headingId : undefined)}
        tabIndex={-1}
        className={cx(
          'glass-strong relative w-full rounded-t-3xl sm:rounded-3xl outline-none',
          'max-h-[92vh] overflow-y-auto',
          widths[size]
        )}
      >
        {(title || onClose) && (
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-space-900/80 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
            <div className="min-w-0">
              {title && (
                <h2 id={headingId} className="truncate text-lg font-bold text-white sm:text-xl">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть окно"
                className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="px-5 py-5 sm:px-7 sm:py-6">{children}</div>

        {footer && (
          <div className="sticky bottom-0 border-t border-white/10 bg-space-900/80 px-5 py-4 backdrop-blur sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Field */

export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200">
          {label}
          {required && <span className="ml-1 text-gold-400">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-white/12 bg-space-800/70 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 ' +
  'transition focus:border-gold-400/60 focus:outline-none focus:ring-2 focus:ring-gold-400/25';

export function Input({ className, ...rest }) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cx(inputClass, 'resize-y', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx(inputClass, 'appearance-none pr-10', className)} {...rest}>
      {children}
    </select>
  );
}

/* ---------------------------------------------------------------- Feedback */

export function Spinner({ label = 'Загрузка…', className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 py-16 text-slate-400', className)} role="status">
      <Loader2 size={30} className="animate-spin text-gold-400" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Alert({ tone = 'error', children, className }) {
  const tones = {
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    warning: 'border-gold-500/30 bg-gold-500/10 text-gold-200',
  };
  if (!children) return null;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/12 px-6 py-14 text-center">
      {icon && <div className="text-4xl opacity-70">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ ProgressRing */

/** Circular progress chart required by the TZ personal-cabinet section. */
export function ProgressRing({ value = 0, size = 148, stroke = 12, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Прогресс ${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold text-white">{label ?? `${clamped}%`}</span>
        {sublabel && <span className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{sublabel}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-white/10 text-slate-200',
    gold: 'bg-gold-400/15 text-gold-300 border border-gold-400/25',
    green: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25',
    violet: 'bg-nebula-400/15 text-nebula-400 border border-nebula-400/25',
  };
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}
