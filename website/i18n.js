/**
 * @fileoverview Lightweight i18n engine for the Motrix Next website.
 *
 * Architecture:
 *   1. Detect language: URL hash (#lang=xx) > localStorage > navigator.languages > en-US
 *   2. Fetch JSON locale file from /locales/{lang}.json
 *   3. Walk DOM for [data-i18n] attributes and replace textContent
 *   4. Handle interpolation: {variable} placeholders
 *   5. RTL support for Arabic and Persian
 *
 * Zero dependencies. ~90 lines.
 */

const SUPPORTED_LOCALES = [
  'ar',
  'bg',
  'ca',
  'de',
  'el',
  'en-US',
  'es',
  'fa',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt-BR',
  'ro',
  'ru',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-CN',
  'zh-TW',
]

/** Native display names for the toggle button (always in the locale's own language). */
const LOCALE_NAMES = {
  ar: 'العربية',
  bg: 'Български',
  ca: 'Català',
  de: 'Deutsch',
  el: 'Ελληνικά',
  'en-US': 'English',
  es: 'Español',
  fa: 'فارسی',
  fr: 'Français',
  hu: 'Magyar',
  id: 'Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nb: 'Norsk',
  nl: 'Nederlands',
  pl: 'Polski',
  'pt-BR': 'Português',
  ro: 'Română',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

const RTL_LOCALES = ['ar', 'fa']
const FALLBACK = 'en-US'
const STORAGE_KEY = 'motrix-website-lang'

let currentLocale = FALLBACK
let detectedSystemLocale = null
let messages = {}
let fallbackMessages = {}

/** Registered callbacks invoked after every locale switch. */
const localeChangeCallbacks = []

/** Resolve the best locale from browser language, e.g. "zh-CN" or "zh" → "zh-CN". */
function resolveLocale(raw) {
  if (!raw) return null
  const normalized = raw.trim()
  if (SUPPORTED_LOCALES.includes(normalized)) return normalized
  // Region-specific overrides (Traditional Chinese regions → zh-TW)
  const REGION_MAP = { 'zh-hk': 'zh-TW', 'zh-mo': 'zh-TW', 'zh-tw': 'zh-TW' }
  const lower = normalized.toLowerCase()
  if (REGION_MAP[lower]) return REGION_MAP[lower]
  // Try base language match: "zh" → "zh-CN", "pt" → "pt-BR"
  const base = normalized.split('-')[0].toLowerCase()
  const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase().startsWith(base))
  return match || null
}

/** Detect preferred locale from URL hash > localStorage > navigator. */
function detectLocale() {
  // 1. URL hash: #lang=zh-CN
  const hash = location.hash.match(/lang=([^&]+)/)
  if (hash) {
    const resolved = resolveLocale(hash[1])
    if (resolved) return resolved
  }
  // 2. localStorage
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
  // 3. navigator.languages (preferred over navigator.language)
  //    On Windows + Chromium, navigator.language returns the *browser UI*
  //    language (often "en-US") rather than the OS display language.
  //    navigator.languages includes the user's OS language preferences
  //    (e.g. ["zh-CN", "en-US"]), giving us the correct priority order.
  //    Fallback to [navigator.language] for legacy browsers without the
  //    languages array.
  for (const lang of navigator.languages || [navigator.language]) {
    const resolved = resolveLocale(lang)
    if (resolved) return resolved
  }
  return FALLBACK
}

/** Fetch a locale JSON file. Returns parsed object or empty on failure. */
async function fetchLocale(locale) {
  try {
    const base = document.querySelector('script[src*="i18n.js"]')?.src.replace(/i18n\.js.*/, '') || ''
    const res = await fetch(`${base}locales/${locale}.json`)
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

/** Interpolate {variable} placeholders in a string. */
function interpolate(template, vars) {
  if (!vars || !template) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

/** Get a translated string by key, with optional interpolation variables. */
function t(key, vars) {
  const raw = messages[key] ?? fallbackMessages[key] ?? key
  return vars ? interpolate(raw, vars) : raw
}

/** Apply translations to all [data-i18n] elements in the DOM. */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (key) el.textContent = t(key)
  })
  // HTML interpolation variables — keeps locale files free of markup
  const HTML_VARS = {
    link: '<a href="https://github.com/agalwood/Motrix" target="_blank" rel="noopener">Motrix</a>',
  }
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html')
    if (key) el.innerHTML = t(key, HTML_VARS)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key) el.placeholder = t(key)
  })

  // Update HTML lang and dir attributes
  document.documentElement.lang = currentLocale
  document.documentElement.dir = RTL_LOCALES.includes(currentLocale) ? 'rtl' : 'ltr'

  // Update active state in language picker
  document.querySelectorAll('.lang-option').forEach((opt) => {
    opt.classList.toggle('active', opt.dataset.lang === currentLocale)
  })

  // Update toggle button to show current language name
  const toggleLabel = document.getElementById('lang-toggle-label')
  if (toggleLabel) toggleLabel.textContent = LOCALE_NAMES[currentLocale] || currentLocale

  // Update system detection hint in dropdown
  const sysHint = document.getElementById('lang-system-hint')
  if (sysHint && detectedSystemLocale) {
    const sysName = LOCALE_NAMES[detectedSystemLocale] || detectedSystemLocale
    sysHint.textContent = 'System: ' + sysName
    sysHint.dataset.lang = detectedSystemLocale
    sysHint.style.display = ''
  }
}

/** Switch to a new locale with smooth cross-fade and re-render. */
async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  currentLocale = locale
  localStorage.setItem(STORAGE_KEY, locale)
  location.hash = `lang=${locale}`

  const main = document.querySelector('main')
  const footer = document.querySelector('footer')

  // Phase 1: Fade out — add class to trigger CSS dim+blur animation
  if (main) main.classList.add('i18n-fade-out')
  if (footer) footer.classList.add('i18n-fade-out')

  // Wait for BOTH: fade-out transition (150ms) AND locale fetch
  const [msgs] = await Promise.all([fetchLocale(locale), new Promise((r) => setTimeout(r, 150))])

  // Phase 2: Swap content while dimmed
  messages = msgs
  applyTranslations()
  for (const cb of localeChangeCallbacks) cb()

  // Phase 3: Fade in — remove out class, add in class
  if (main) {
    main.classList.remove('i18n-fade-out')
    main.classList.add('i18n-fade-in')
  }
  if (footer) {
    footer.classList.remove('i18n-fade-out')
    footer.classList.add('i18n-fade-in')
  }

  // Clean up animation class after it completes
  setTimeout(() => {
    if (main) main.classList.remove('i18n-fade-in')
    if (footer) footer.classList.remove('i18n-fade-in')
  }, 200)
}

/** Register a callback to re-render dynamic content on locale change. */
function onLocaleChange(cb) {
  localeChangeCallbacks.push(cb)
}

/** Initialize i18n: detect language, load messages, render. */
async function initI18n() {
  // Detect and remember the system locale (before checking localStorage/hash)
  detectedSystemLocale = resolveLocale(navigator.language) || FALLBACK
  currentLocale = detectLocale()
  // Always load fallback for missing keys
  fallbackMessages = await fetchLocale(FALLBACK)
  if (currentLocale !== FALLBACK) {
    messages = await fetchLocale(currentLocale)
  } else {
    messages = fallbackMessages
  }
  applyTranslations()
}

// Expose globally for inline usage
window.i18n = { t, setLocale, onLocaleChange, currentLocale: () => currentLocale, SUPPORTED_LOCALES }
