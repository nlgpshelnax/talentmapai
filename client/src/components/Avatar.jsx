import { cx } from './ui';

/**
 * The user's face across the whole app.
 *
 * This is where store purchases finally become visible. In the prototype
 * buying an avatar, a frame or a title deducted XP and changed absolutely
 * nothing on screen — the cosmetics existed only as rows in a price list.
 * Every surface that shows a user renders through this component, so an
 * equipped item appears everywhere at once.
 */

const FRAME_CLASS = {
  gold: 'ring-frame-gold',
  comet: 'ring-frame-comet',
};

const SIZES = {
  xs: { box: 'h-8 w-8', text: 'text-base' },
  sm: { box: 'h-10 w-10', text: 'text-lg' },
  md: { box: 'h-14 w-14', text: 'text-2xl' },
  lg: { box: 'h-20 w-20', text: 'text-4xl' },
  xl: { box: 'h-28 w-28', text: 'text-5xl' },
};

export default function Avatar({ user, size = 'md', className, showFrame = true }) {
  const dims = SIZES[size] || SIZES.md;
  const equipped = user?.equipped || {};
  const frameClass = showFrame && equipped.frame ? FRAME_CLASS[equipped.frame] : '';

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div
      className={cx(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full',
        'bg-gradient-to-br from-space-600 to-space-800 select-none',
        dims.box,
        frameClass,
        className
      )}
    >
      {equipped.avatar ? (
        // Cosmetic avatar bought in the store (an emoji glyph).
        <span className={dims.text} role="img" aria-label="Аватар">
          {equipped.avatar}
        </span>
      ) : user?.avatar ? (
        <img src={user.avatar} alt={`Аватар: ${user.name || 'пользователь'}`} className="h-full w-full object-cover" />
      ) : (
        <span className={cx('font-display font-bold text-gold-300', dims.text)} aria-hidden="true">
          {initial}
        </span>
      )}
    </div>
  );
}

/** Name plus the equipped title, e.g. «София · Звёздный Лорд». */
export function UserName({ user, className, titleClassName }) {
  if (!user) return null;
  return (
    <span className={className}>
      {user.name}
      {user.equipped?.title && (
        <span className={cx('ml-2 text-xs font-semibold text-gold-300', titleClassName)}>· {user.equipped.title}</span>
      )}
    </span>
  );
}
