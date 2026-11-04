export function uid(): string {
  // Если браузер даёт crypto.randomUUID (https или localhost) — используем его
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Запасной вариант: генерируем UUID v4 вручную.
  // Формат обязателен: колонки id в Supabase имеют тип uuid,
  // и произвольная строка не подойдёт.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')

  return [
    hex(8),
    hex(4),
    '4' + hex(3),
    ((Math.floor(Math.random() * 4) + 8).toString(16)) + hex(3),
    hex(12),
  ].join('-')
}