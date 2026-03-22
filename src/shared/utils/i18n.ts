/** @fileoverview i18n locale setter bridging vue-i18n's Composition API. */
import type { I18n } from 'vue-i18n'

/**
 * Sets the active locale on a vue-i18n instance.
 * vue-i18n Composition API uses a Ref internally, but the type doesn't expose `.value`,
 * so this centralized function houses the single necessary cast.
 */
export function setI18nLocale(i18n: I18n, locale: string): void {
  ;(i18n.global.locale as unknown as { value: string }).value = locale
}
