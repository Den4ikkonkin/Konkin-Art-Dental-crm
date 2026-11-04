# Деплой на Vercel

Инструкция для CRM Konkin Art Dental. Порядок важен: если задеплоить
раньше времени, приложение поднимется, но войти будет нельзя.

---

## 1. Подготовка Supabase

Перед деплоем база должна быть готова. В SQL Editor по порядку:

```
0007_profiles.sql
0008_crm_entities.sql
0009_rls.sql
0010_data_migration.sql
0011_status_machine.sql
0012_fix_rls_recursion.sql   -- обязательна, иначе политика patients зациклится
0013_theme.sql               -- палитра для администратора
0014_accounts_setup.sql      -- учётки: admin, врачи, техники
```

Затем проверки:

```
supabase/tests/rls_check.sql
```

В конце должно появиться: `Все проверки RLS пройдены`.

### 1.1 Настройки аутентификации

Supabase → Authentication → Providers → Email:

- **Email** — включён
- **Confirm email** — выключить. Учётки создаются вручную, письма
  отправлять некуда, а без подтверждения вход не пройдёт.
- **Enable Sign Ups** — выключить. Самостоятельная регистрация не нужна.

Supabase → Authentication → URL Configuration:

- **Site URL**: `https://ваш-домен.vercel.app`
- **Redirect URLs**: `https://ваш-домен.vercel.app/**`

Если оставить `localhost`, после деплоя вход будет уводить на локальный адрес.

---

## 2. Переменные окружения

В Vercel → Project → Settings → Environment Variables. Значения брать
из `.env.local` локально — **в репозиторий они не попадают**.

| Имя | Тип | Обязательна | Где взять |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | да | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | да | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | да | Supabase → Settings → API |
| `GOOGLE_CLIENT_ID` | Secret | нет | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Secret | нет | Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | Secret | нет | OAuth Playground |
| `CRON_SECRET` | Secret | нет | Сгенерировать случайную строку |

Ставь значения для всех трёх окружений: **Production**, **Preview**,
**Development**. Иначе превью-деплои будут падать без переменных.

### Про ключи

`SUPABASE_SERVICE_ROLE_KEY` обходит все RLS-политики. Он используется
только в `/api/admin/users` и бэкапе, в браузер не попадает. Никогда
не добавляй ему префикс `NEXT_PUBLIC_` — с ним ключ уйдёт в клиент.

### Перевыпустите скомпрометированные ключи

В присланном архиве был `.env.local` с `SERVICE_ROLE_KEY`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` и `CRON_SECRET`.
Файл пересылался — считайте эти значения публичными:

1. Supabase → Settings → API → **Reset** у `service_role`
2. Google Cloud Console → Credentials → перевыпустить secret
3. Заново пройти OAuth и получить новый refresh token
4. Придумать новый `CRON_SECRET`

После сброса старые значения перестанут работать — обнови их и в Vercel.

---

## 3. Деплой

### Вариант А: через сайт

1. Залей проект в GitHub (`node_modules` и `.next` в `.gitignore`).
2. Vercel → **Add New** → **Project** → выбери репозиторий.
3. Framework определится как **Next.js** автоматически.
4. Добавь переменные окружения из таблицы выше.
5. **Deploy**.

### Вариант Б: через CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

---

## 4. После деплоя — проверить

### 4.1 Приложение поднялось

Открой `https://ваш-домен.vercel.app` — должен появиться экран входа.

### 4.2 Переменные прочитались

```
https://ваш-домен.vercel.app/api/env-check
```

Ответ показывает, какой адрес Supabase видит приложение. Если там
`config` вместо `env` — переменные не подхватились, проверь их и
пересобери проект (Redeploy).

### 4.3 Вход работает

Логин `admin`, пароль заданный в `0014_accounts_setup.sql`
(по умолчанию `konkin2026`). Если пишет «Неверный логин или пароль»:

```sql
select p.login, p.role, p.status, u.email,
       (select count(*) from auth.identities i where i.user_id = u.id) as identity
from public.profiles p
join auth.users u on u.id = p.user_id
order by p.login;
```

Должно быть 9 строк, у каждой `identity = 1`. Ноль в этой колонке —
Supabase не найдёт пользователя, даже с верным паролем.

### 4.4 Данные видны

Войди под `denis` — должны быть все старые наряды и пациенты.
Если список пуст, а в базе строки есть — не выполнена
`0012_fix_rls_recursion.sql`.

### 4.5 Цвета сохраняются

Войди под `admin` → «Оформление» → выбери набор → «Сохранить для всех».
Обнови страницу в другом браузере — цвета должны остаться.
Если пишет «таблица app_theme не создана» — не выполнена `0013_theme.sql`.

---

## 5. Домен

Vercel → Settings → Domains → Add. После привязки домена
**обязательно** обнови `Site URL` и `Redirect URLs` в Supabase,
иначе вход сломается.

---

## 6. Что стоит знать

**Регион.** В `vercel.json` указан `fra1` (Франкфурт) — ближайший
к России из доступных. Supabase-проект выбери в том же регионе,
иначе каждый запрос будет ходить через полмира.

**Функции.** Продление сессии и загрузка файлов работают в Node.js
runtime. Edge runtime здесь не подходит: Supabase-клиент и Google API
требуют Node.

**Лимиты бесплатного плана.** 100 ГБ трафика и 10 секунд на функцию.
Загрузка крупных файлов через `/api/drive/upload` может не уложиться.
Ограничение в коде — 25 МБ на файл.

**Cron-бэкапы.** Если добавляешь `crons` в `vercel.json`, помни: на
бесплатном плане разрешён только один запуск в сутки, и только на
пути, начинающемся с `/api/`.

**Откат.** Vercel хранит все деплои. Deployments → нужная версия →
**Promote to Production**. Откат мгновенный, база не затрагивается.

---

## 7. Частые ошибки

| Симптом | Причина | Решение |
|---|---|---|
| Белый экран, в консоли `Failed to fetch` | Нет переменных Supabase | Добавить в Vercel, Redeploy |
| «Не настроено подключение» | Переменные не прочитались | `/api/env-check`, проверить имена |
| Вход уводит на localhost | `Site URL` в Supabase | Поставить домен Vercel |
| «Неверный логин или пароль» при верном пароле | Нет `auth.identities` | Перезапустить `0014_accounts_setup.sql` |
| Пустые списки после входа | Рекурсия RLS | Выполнить `0012_fix_rls_recursion.sql` |
| `404` на `/patients/new` | Старая сборка | Redeploy |
| Ошибка `relation "app_theme" does not exist` | Нет миграции | Выполнить `0013_theme.sql` |
| Сборка падает на `next build` | Не хватает памяти | Убрать `output: standalone`, если включён |

---

## 8. Финальный чек-лист

- [ ] Миграции 0007–0014 выполнены
- [ ] `rls_check.sql` показывает «все проверки пройдены»
- [ ] Confirm email выключен
- [ ] Sign Ups выключены
- [ ] `Site URL` указывает на домен Vercel
- [ ] Семь переменных добавлены в Production и Preview
- [ ] Скомпрометированные ключи перевыпущены
- [ ] `/api/env-check` показывает источник `env`
- [ ] Вход под `admin` и `denis` работает
- [ ] Денис видит старые наряды
- [ ] Цвета сохраняются и видны в другом браузере
- [ ] Домен привязан, `Site URL` обновлён
