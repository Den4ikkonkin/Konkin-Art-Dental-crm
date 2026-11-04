// Типы файлов Google Drive — отдельно, чтобы клиентский код не тянул серверные модули.
export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime: string
  webViewLink?: string
}
