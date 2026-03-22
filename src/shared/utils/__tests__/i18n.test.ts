/**
 * @fileoverview Tests for the i18n locale setter utility.
 *
 * Key behavior: setI18nLocale casts the vue-i18n locale ref and sets its value.
 */
import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { setI18nLocale } from '../i18n'

describe('setI18nLocale', () => {
  it('changes the active locale on a vue-i18n instance', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: { 'en-US': {}, 'zh-CN': {} },
    })

    setI18nLocale(i18n as Parameters<typeof setI18nLocale>[0], 'zh-CN')

    const locale = (i18n.global.locale as unknown as { value: string }).value
    expect(locale).toBe('zh-CN')
  })

  it('can set locale to any arbitrary string', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: { 'en-US': {} },
    })

    setI18nLocale(i18n as Parameters<typeof setI18nLocale>[0], 'ja')

    const locale = (i18n.global.locale as unknown as { value: string }).value
    expect(locale).toBe('ja')
  })

  it('setting the same locale is idempotent', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en-US',
      fallbackLocale: 'en-US',
      messages: { 'en-US': {} },
    })

    setI18nLocale(i18n as Parameters<typeof setI18nLocale>[0], 'en-US')

    const locale = (i18n.global.locale as unknown as { value: string }).value
    expect(locale).toBe('en-US')
  })
})
