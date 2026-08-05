import { useLayoutEffect, useRef, type JSX, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  className?: string
  placeholder?: string
  ariaLabel: string
  autoFocus?: boolean
}

/**
 * A textarea that grows to fit its content, so an editor opens at the same
 * height as the text it replaced — no scrollbar, no dragging a resize handle.
 *
 * Height is measured rather than estimated from line count: the text wraps, so
 * counting newlines would be wrong. Setting height to auto first lets the box
 * shrink again when text is deleted, not just grow.
 */
export default function AutoTextarea({
  value,
  onChange,
  onFocus,
  onKeyDown,
  className,
  placeholder,
  ariaLabel,
  autoFocus
}: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      rows={1}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    />
  )
}
