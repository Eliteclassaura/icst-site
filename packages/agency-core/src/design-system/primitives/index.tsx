import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ')

export function Container({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('ds-container', className)} {...rest} />
}

type StackProps<T extends ElementType> = {
  as?: T
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
} & ComponentPropsWithoutRef<T>
export function Stack<T extends ElementType = 'div'>({ as, gap = 4, className, ...rest }: StackProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  return <Tag className={cx('ds-stack', className as string)} data-gap={gap} {...rest} />
}

export function Band({
  tight,
  className,
  ...rest
}: ComponentPropsWithoutRef<'section'> & { tight?: boolean }) {
  return <section className={cx('ds-band', tight && 'ds-band--tight', className)} {...rest} />
}

export function Prose({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('prose', className)} {...rest} />
}

export function Rule({
  variant = 'hair',
  className,
  ...rest
}: ComponentPropsWithoutRef<'hr'> & { variant?: 'hair' | 'visible' | 'gold' | 'gold-thin' }) {
  const v =
    variant === 'hair'
      ? ''
      : variant === 'gold-thin'
        ? 'ds-rule--gold ds-rule--gold-thin'
        : `ds-rule--${variant}`
  return <hr className={cx('ds-rule', v, className)} aria-hidden="true" {...rest} />
}

type ButtonProps = { variant?: 'solid' | 'ghost'; size?: 'md' | 'sm' } & (
  | ({ href: string } & ComponentPropsWithoutRef<'a'>)
  | ({ href?: undefined } & ComponentPropsWithoutRef<'button'>)
)
export function Button({ variant = 'solid', size = 'md', className, children, ...rest }: ButtonProps) {
  const cls = cx('ds-btn', `ds-btn--${variant}`, size === 'sm' && 'ds-btn--sm', className)
  if ('href' in rest && rest.href)
    return (
      <a className={cls} {...(rest as ComponentPropsWithoutRef<'a'>)}>
        {children}
      </a>
    )
  return (
    <button type="button" className={cls} {...(rest as ComponentPropsWithoutRef<'button'>)}>
      {children}
    </button>
  )
}

export function Link({ className, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a className={cx('ds-link', className)} {...rest}>
      {children}
    </a>
  )
}

export function Label({ className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  return <span className={cx('t-label', className)} {...rest} />
}

export function Num({ className, ...rest }: ComponentPropsWithoutRef<'span'>) {
  return <span className={cx('num', className)} {...rest} />
}

export function Table({
  caption,
  compare,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<'table'> & { caption?: ReactNode; compare?: boolean }) {
  return (
    // Scrollable on narrow viewports: focusable region with a name so keyboard users can scroll it (axe scrollable-region-focusable).
    <div
      className="ds-tbl-wrap"
      role="region"
      aria-label={typeof caption === 'string' ? caption : 'Table'}
      tabIndex={0}
    >
      <table className={cx('ds-tbl', compare && 'ds-tbl--compare', className)} {...rest}>
        {caption ? <caption>{caption}</caption> : null}
        {children}
      </table>
    </div>
  )
}

export function Dl({
  items,
  className,
  ...rest
}: ComponentPropsWithoutRef<'dl'> & { items: Array<{ id?: string; term: ReactNode; detail: ReactNode }> }) {
  return (
    <dl className={cx('ds-dl', className)} {...rest}>
      {items.map((it, i) => (
        <div key={it.id ?? i} id={it.id}>
          <dt>{it.term}</dt>
          <dd>{it.detail}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="ds-err" id={`${id}-err`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
