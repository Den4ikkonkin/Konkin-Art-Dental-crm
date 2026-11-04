# Google Drive для файлов пациентов

Аккаунт: konkinartdental@gmail.com

## Как это работает
- Корневая папка «Konkin Art Dental — пациенты» создаётся сама при первой загрузке.
- Для каждого пациента создаётся отдельная папка с его именем.
- Кнопка «Загрузить файлы» в карточке пациента кладёт файлы в его папку.
- Приложение видит только свои папки и файлы (область доступа `drive.file`).

## Шаг 1. Включить Drive API
1. Откройте https://console.cloud.google.com/ и войдите под konkinartdental@gmail.com.
2. Создайте проект «Konkin Art Dental».
3. «APIs & Services» → «Library» → найдите **Google Drive API** → «Enable».

## Шаг 2. Экран согласия OAuth
1. «APIs & Services» → «OAuth consent screen».
2. User type: **External**. Заполните название приложения и свою почту.
3. «Scopes» можно пропустить.
4. «Test users» → добавьте konkinartdental@gmail.com.
5. Нажмите **«Publish app»** (Publish status → In production).
   Это важно: в статусе Testing refresh token живёт всего 7 дней.
   Для области drive.file подтверждение Google не требуется.

## Шаг 3. Создать OAuth-клиент
1. «APIs & Services» → «Credentials» → «Create credentials» → «OAuth client ID».
2. Application type: **Web application**.
3. В «Authorized redirect URIs» добавьте: `https://developers.google.com/oauthplayground`
4. Нажмите Create. Сохраните **Client ID** и **Client secret**.

## Шаг 4. Получить refresh token
1. Откройте https://developers.google.com/oauthplayground
2. Шестерёнка справа вверху → поставьте галочку «Use your own OAuth credentials» → вставьте Client ID и Client secret.
3. Слева в списке API найдите **Drive API v3** и выберите scope `https://www.googleapis.com/auth/drive.file`.
4. Нажмите «Authorize APIs» и войдите под konkinartdental@gmail.com.
5. Нажмите «Exchange authorization code for tokens».
6. Скопируйте **Refresh token**.

## Шаг 5. Прописать в .env.local
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
# необязательно, если хотите использовать готовую папку:
# GOOGLE_DRIVE_ROOT_ID=...
```
Затем перезапустите сервер (`npm run dev`).

## Шаг 6. Проверка
Откройте любого пациента → «Файлы» → «Загрузить файлы». Файл должен появиться в Google Drive в папке с именем пациента.

## Безопасность
- Client secret и refresh token хранятся только на сервере, в браузер не попадают.
- Маршруты `/api/drive/*` работают только для вошедших в приложение пользователей.
- Не публикуйте `.env.local`.
