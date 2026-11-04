// Палитра интерфейса: значения по умолчанию и метаданные для редактора.
//
// Зачем отдельный файл: цвета хранятся в базе (таблица app_theme) и
// применяются как CSS-переменные. Здесь же лежат исходные значения —
// они нужны, чтобы кнопка «Сбросить» вернула заводской вид, и чтобы
// редактор показывал, какие цвета изменены относительно исходных.

export type ThemePalette = {
  bg: string
  panel: string
  panel2: string
  line: string
  text: string
  muted: string
  orange: string
  mint: string
  lime: string
  violet: string
  blue: string
  pink: string
}

/** Порядок и подписи полей в редакторе. */
export const PALETTE_FIELDS: { key: keyof ThemePalette; label: string; hint: string }[] = [
  { key: 'bg',      label: 'Фон приложения',   hint: 'Общий фон за панелями' },
  { key: 'panel',   label: 'Фон панелей',      hint: 'Карточки, таблицы, модальные окна' },
  { key: 'panel2',  label: 'Фон вложенных',    hint: 'Второй уровень: файлы, строки' },
  { key: 'line',    label: 'Границы',          hint: 'Рамки и разделители' },
  { key: 'text',    label: 'Основной текст',   hint: 'Заголовки и значения' },
  { key: 'muted',   label: 'Вторичный текст',  hint: 'Подписи, единицы, подсказки' },
  { key: 'orange',  label: 'Акцент',           hint: 'Главный цвет: кнопки, активный пункт' },
  { key: 'mint',    label: 'Успех',            hint: 'Оплачено, готово' },
  { key: 'lime',    label: 'Салатовый',        hint: 'Второй оттенок статуса' },
  { key: 'violet',  label: 'Фиолетовый',       hint: 'Готовые наряды' },
  { key: 'blue',    label: 'Синий',            hint: 'Новые наряды' },
  { key: 'pink',    label: 'Розовый',          hint: 'Дополнительный акцент' },
]

/** Заводская тёмная тема — совпадает с :root в globals.css. */
export const DARK_DEFAULT: ThemePalette = {
  bg: '#0d1014',
  panel: '#171c22',
  panel2: '#1c232b',
  line: '#2b333d',
  text: '#eef1f5',
  muted: '#9ba7b5',
  orange: '#ffa052',
  mint: '#82c6ae',
  lime: '#abd988',
  violet: '#baa0ee',
  blue: '#9abbe5',
  pink: '#e3a8c3',
}

/** Заводская светлая тема — совпадает с html[data-theme='light'] в globals.css. */
export const LIGHT_DEFAULT: ThemePalette = {
  bg: '#F5F7FA',
  panel: '#FFFFFF',
  panel2: '#FFFFFF',
  line: '#DDE3EA',
  text: '#10151B',
  muted: '#5C6976',
  orange: '#D9730D',
  mint: '#1F7A5C',
  lime: '#4E7C1F',
  violet: '#6D46C8',
  blue: '#2A5FA8',
  pink: '#B03A70',
}

/** Готовые наборы: админ выбирает один и сразу видит результат. */
export const PRESETS: { id: string; name: string; hint: string; dark: ThemePalette; light: ThemePalette }[] = [
  {
    id: 'classic',
    name: 'Konkin — заводская',
    hint: 'Тёплый оранжевый на графите',
    dark: DARK_DEFAULT,
    light: LIGHT_DEFAULT,
  },
  {
    id: 'clinical',
    name: 'Клиническая',
    hint: 'Холодный синий, нейтральный фон',
    dark: {
      bg: '#0b0f14', panel: '#141a21', panel2: '#1a222b', line: '#28323d',
      text: '#e8eef5', muted: '#8fa0b3',
      orange: '#5ea9e0', mint: '#5cc9a7', lime: '#9ad46f',
      violet: '#a99bea', blue: '#7fb6e8', pink: '#e29ab8',
    },
    light: {
      bg: '#F2F6FA', panel: '#FFFFFF', panel2: '#FAFCFE', line: '#D6E0EA',
      text: '#0F1620', muted: '#54636F',
      orange: '#1F6FA8', mint: '#17795A', lime: '#4A7A1E',
      violet: '#5B45B8', blue: '#1F5C96', pink: '#A84070',
    },
  },
  {
    id: 'warm',
    name: 'Тёплая лаборатория',
    hint: 'Мягкий графит и медь',
    dark: {
      bg: '#12100e', panel: '#1c1916', panel2: '#241f1a', line: '#3a322a',
      text: '#f3ede6', muted: '#b0a294',
      orange: '#e8a45c', mint: '#8fbfa5', lime: '#b9cf86',
      violet: '#c2a8e0', blue: '#a3bcd6', pink: '#dda8bd',
    },
    light: {
      bg: '#FAF6F1', panel: '#FFFFFF', panel2: '#FDFAF6', line: '#E5DACE',
      text: '#191410', muted: '#6B5D50',
      orange: '#B96A1E', mint: '#2A7256', lime: '#54761F',
      violet: '#6A4BB0', blue: '#2F5F8E', pink: '#A84A6E',
    },
  },
  {
    id: 'mono',
    name: 'Графит',
    hint: 'Строгая монохромная схема',
    dark: {
      bg: '#0c0d0f', panel: '#151719', panel2: '#1c1f22', line: '#2e3237',
      text: '#f0f2f4', muted: '#9aa1a9',
      orange: '#d8dde2', mint: '#a9c4b6', lime: '#c2cfae',
      violet: '#b8b2c9', blue: '#aab8c6', pink: '#c9b0b8',
    },
    light: {
      bg: '#F4F5F7', panel: '#FFFFFF', panel2: '#FAFBFC', line: '#DCDFE4',
      text: '#101214', muted: '#5A6068',
      orange: '#24292E', mint: '#276A56', lime: '#4F6B2A',
      violet: '#514B6B', blue: '#2F4C68', pink: '#7A4457',
    },
  },
]

/** Привести произвольный объект из базы к палитре: недостающее — из заводской. */
export function normalizePalette(raw: unknown, fallback: ThemePalette): ThemePalette {
  const result = { ...fallback }
  if (!raw || typeof raw !== 'object') return result
  const source = raw as Record<string, unknown>
  for (const key of Object.keys(fallback) as (keyof ThemePalette)[]) {
    const value = source[key]
    if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
      result[key] = value
    }
  }
  return result
}

/** Проверка цвета из поля ввода. */
export function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}
