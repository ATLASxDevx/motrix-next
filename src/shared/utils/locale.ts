/** @fileoverview Locale direction detection and form label width calculation. */
import { SUPPORT_RTL_LOCALES } from '@shared/constants'

export const isRTL = (locale = 'en-US'): boolean => {
  return SUPPORT_RTL_LOCALES.includes(locale)
}

export const getLangDirection = (locale = 'en-US'): string => {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

export const calcFormLabelWidth = (locale: string): string => {
  return locale.startsWith('de') ? '28%' : '25%'
}
