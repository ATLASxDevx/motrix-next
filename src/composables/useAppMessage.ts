/** @fileoverview Composable providing application-level message notifications. */
import { useMessage, type MessageOptions } from 'naive-ui'
import { MESSAGE_DURATION } from '@shared/timing'
import { ellipsis } from '@shared/utils/format'

/** Maximum display length for toast notification content. */
const TOAST_MAX_LENGTH = 48

const DEFAULTS: MessageOptions = {
  closable: true,
  duration: MESSAGE_DURATION,
  keepAliveOnHover: true,
}

const activeMessages = new Map<
  string,
  { el: ReturnType<ReturnType<typeof useMessage>['error']>; timer: ReturnType<typeof setTimeout> }
>()

function dedupShow(
  fn: (content: string, options?: MessageOptions) => ReturnType<ReturnType<typeof useMessage>['error']>,
  content: string,
  options?: MessageOptions,
) {
  const key = content
  const display = ellipsis(content, TOAST_MAX_LENGTH)
  const existing = activeMessages.get(key)
  const duration = options?.duration ?? DEFAULTS.duration ?? MESSAGE_DURATION

  if (existing) {
    existing.el.destroy()
    clearTimeout(existing.timer)
    activeMessages.delete(key)
    setTimeout(() => {
      const el = fn(display, { ...DEFAULTS, ...options })
      const timer = setTimeout(() => activeMessages.delete(key), duration)
      activeMessages.set(key, { el, timer })
    }, 80)
    return existing.el
  }

  const el = fn(display, { ...DEFAULTS, ...options })
  const timer = setTimeout(() => activeMessages.delete(key), duration)
  activeMessages.set(key, { el, timer })
  return el
}

export function useAppMessage() {
  const message = useMessage()
  return {
    success: (content: string, options?: MessageOptions) => dedupShow(message.success.bind(message), content, options),
    error: (content: string, options?: MessageOptions) => dedupShow(message.error.bind(message), content, options),
    warning: (content: string, options?: MessageOptions) => dedupShow(message.warning.bind(message), content, options),
    info: (content: string, options?: MessageOptions) => dedupShow(message.info.bind(message), content, options),
  }
}
