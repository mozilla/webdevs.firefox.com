import type { FunctionComponent } from 'preact';

import * as styles from '~/components/Button.module.css';

/**
 * The Buttons component set from Figma (node `43:6818`), which crosses
 * Size × Style × State. Hover, pressed, focus and disabled are CSS states
 * rather than props, so only Size and Style are exposed.
 *
 * Renders an `<a>` when given an `href` and a `<button>` otherwise, so the
 * same styling serves navigation and actions.
 *
 * Preact rather than Astro so it can be used from both. It holds no state and
 * is never given a `client:*` directive, so it is rendered to HTML at build
 * time and ships no JavaScript.
 */

/** Figma's three sizes, plus `compact` for the header CTA — which is the
 * same button drawn smaller than any size in the set. */
type Size = 'large' | 'medium' | 'small' | 'compact';
type Style = 'filled' | 'outlined';

const sizeClasses: Record<Size, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
  compact: styles.sizeCompact,
};

const styleClasses: Record<Style, string> = {
  filled: styles.filled,
  outlined: styles.outlined,
};

interface Props {
  size?: Size | undefined;
  style?: Style | undefined;
  href?: string | undefined;
  type?: 'button' | 'submit' | 'reset' | undefined;
  disabled?: boolean | undefined;
  /** Named `class` rather than `className` so Astro call sites read
   * naturally; Preact accepts either. */
  class?: string | undefined;
}

/* `children` comes from FunctionComponent's RenderableProps, so Props does
   not declare it. */
const Button: FunctionComponent<Props> = ({
  size = 'medium',
  style = 'filled',
  href,
  type,
  disabled,
  class: className,
  children,
  ...rest
}) => {
  const classes = [
    styles.button,
    sizeClasses[size],
    styleClasses[style],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href) {
    // A disabled link is not a thing, so drop the href and let assistive
    // tech see the disabled state instead.
    const linkProps = disabled
      ? { role: 'link' as const, 'aria-disabled': true }
      : { href };

    return (
      <a class={classes} {...linkProps} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button
      class={classes}
      type={type ?? 'button'}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
