#!/usr/bin/env python3
"""Проверка целостности src/app/mobile.css.

Скобки могут сойтись и при потерянной середине, поэтому проверяем
наличие маркера из каждой из 15 секций. Если хоть один отсутствует —
файл неполный.
"""
import sys

REQUIRED = {
    '1  Основа (кнопки/панели)':   '.btn, .btn.small {',
    '2  Заголовок страницы':       '.page-heading { display: block',
    '3  Верхняя панель':           '.topbar-title > div { display: none',
    '4  Карточки нарядов':         'grid-template-rows: auto auto auto',
    '4  Карточка: один столбец':   'grid-template-columns: minmax(0, 1fr) !important',
    '4  Дуга 88px':                '.oc-teeth { height: 88px',
    '5  Таблицы':                  'overscroll-behavior-x: contain',
    '6  Фильтры/статус':           '.status-select {',
    '7  Очередь 2 в ряд':          '.queue-grid { display: grid',
    '8  Календарь':                'aspect-ratio: 1 / 1',
    '9  Пациенты':                 '.patient-actions { display: grid',
    '10 Меню «⋯»':                 '.mmenu-list {',
    '11 Форма: конструкции+FDI':   '.designer-grid {',
    '11 Сохранение липкое':        'position: sticky; bottom: 0',
    '12 Контраст WCAG':            '72%',
    '13 Метрики':                  '.metric > span',
    '14 Узкие экраны':             '@media (max-width: 380px)',
    '15 Альбомная ориентация':     'orientation: landscape',
}

path = sys.argv[1] if len(sys.argv) > 1 else 'src/app/mobile.css'

try:
    s = open(path, encoding='utf-8').read()
except FileNotFoundError:
    print(f'НЕТ ФАЙЛА: {path}')
    sys.exit(1)

opens, closes = s.count('{'), s.count('}')
missing = [(name, marker) for name, marker in REQUIRED.items() if marker not in s]

print(f'файл:   {path}')
print(f'строк:  {len(s.splitlines())}')
print(f'скобки: {{ = {opens}   }} = {closes}')
print(f'баланс: {"OK" if opens == closes else "СЛОМАНО"}')

if missing:
    print(f'\nОТСУТСТВУЮТ СЕКЦИИ ({len(missing)}):')
    for name, marker in missing:
        print(f'  ✗ {name}')
    print('\nФАЙЛ НЕПОЛНЫЙ — переустановите его из карточки в чате.')
    sys.exit(1)

if opens != closes:
    print('\nФАЙЛ ОБРЕЗАН — не хватает закрывающих скобок.')
    sys.exit(1)

print(f'\n✓ Все {len(REQUIRED)} маркеров на месте, файл полный.')
