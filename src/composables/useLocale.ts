/** @fileoverview Composable providing vue-i18n instance and locale management. */
import { createI18n } from 'vue-i18n'
import { setI18nLocale } from '@shared/utils/i18n'

const localeModules = import.meta.glob('@shared/locales/*/index.js', { eager: true }) as Record<
  string,
  { default: Record<string, Record<string, string>> }
>

const messages: Record<string, Record<string, Record<string, string>>> = {}

for (const path in localeModules) {
  const match = path.match(/locales\/([^/]+)\/index\.js$/)
  if (match) {
    const locale = match[1]
    messages[locale] = localeModules[path].default
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages,
})

export function useLocale() {
  function setLocale(locale: string) {
    setI18nLocale(i18n, locale)
  }

  return { i18n, setLocale }
}
