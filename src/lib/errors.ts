// Общие тексты для действий с нарядами.
//
// Зачем: одинаковые строки повторялись в OrderCard и OrdersTable по четыре раза.
// Если решим поменять формулировку — править теперь в одном месте.

/** Текст ошибки из исключения: message, если он есть, иначе запасное слово. */
export function errorText(e: unknown, fallback = 'Не получилось. Попробуйте ещё раз.'): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** Подтверждение удаления наряда — одинаковое в карточке и в таблице. */
export function confirmDeleteOrder(number?: number): boolean {
  const what = number ? `наряд №${number}` : 'наряд'
  return confirm(
    `Удалить ${what}? Он исчезнет из базы и из аналитики. ` +
      `Если работа уже сдана — лучше убрать в архив: там наряд сохранится.`,
  )
}
