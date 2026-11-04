'use client'

// Ворота приложения: пока нет входа — показываем экран авторизации,
// дальше отдаём страницу вместе с боковым меню.

import { ShieldAlert } from 'lucide-react'
import { useStore } from './Store'
import Shell from './Shell'
import AuthGate from './AuthGate'
import FirstLoginPassword from './FirstLoginPassword'

export default function Gate({ children }: { children: React.ReactNode }) {
  const { session, ready, configured, profile, mustChangePassword } = useStore()

  if (!configured) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1><ShieldAlert size={20} className="inline-icon" /> Не настроено подключение</h1>

          <p className="alert" role="alert">
            Приложение не смогло определить адрес и ключ Supabase.
          </p>

          <ol className="muted small config-steps">
            <li>Файл <code>.env.local</code> должен лежать в той же папке, где <code>package.json</code>.</li>
            <li>После любой правки файла остановите сервер: <code>Ctrl+C</code> в терминале.</li>
            <li>Запустите заново: <code>npm run dev</code>. Переменные читаются только при старте.</li>
            <li>Если правили файл в VS Code — сохраните его: <code>Cmd+S</code>. Без сохранения на диске старый текст.</li>
          </ol>
        </div>
      </div>
    )
  }

  if (!ready) return <div className="empty boot">Загрузка рабочего пространства…</div>
  if (!session) return <AuthGate />

  // Заблокированная учётка не должна работать, даже если сессия ещё жива
  // в браузере: сервер уже запретил обновление токена, здесь — понятный экран.
  if (profile && profile.status === 'archived') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1><ShieldAlert size={20} className="inline-icon" /> Доступ закрыт</h1>
          <p className="muted">
            Эта учётная запись перемещена в архив. Данные и файлы сохранены,
            доступ к системе закрыт. Обратитесь к администратору лаборатории.
          </p>
        </div>
      </div>
    )
  }

  if (mustChangePassword) return <FirstLoginPassword />

  return <Shell>{children}</Shell>
}
