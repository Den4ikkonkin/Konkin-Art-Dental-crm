// Значения по умолчанию.
//
// Зачем это нужно: ключ anon и адрес проекта Supabase — ПУБЛИЧНЫЕ. Они по
// определению попадают в браузер, а доступ ограничивают RLS-политики в базе.
// Поэтому их можно держать прямо в коде: приложение заработает даже если
// .env.local не прочитался (например, сервер был запущен раньше файла, или
// Turbopack закэшировал старую сборку в папке .next).
//
// Переменные окружения имеют приоритет: если в .env.local указано другое —
// используется оно. Здесь лежит только запасной вариант.
//
// ВАЖНО: service_role и пароли сюда класть нельзя. Только публичные значения.

export const FALLBACK_SUPABASE_URL = 'https://lrxipoykesieabacdcfn.supabase.co'

export const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyeGlwb3lrZXNpZWFiYWNkY2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODYyMTksImV4cCI6MjEwNTc2MjIxOX0.aQJh0dmU_9OuNvyAGPF-zkykR8BClhYzm5W50D1aehM'
