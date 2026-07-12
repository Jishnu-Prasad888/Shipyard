export type ServerHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown'

export interface ServerHealth {
  status: ServerHealthStatus
  version?: string
  db?: string
  redis?: string
  message?: string
}

export interface ServerSyncStatus {
  lastSyncAt?: number
  totalEvents?: number
  queueDepth?: number
}

export interface SyncOperation {
  id: string
  operation: string
  table: string
  recordId: string
  data: any
  timestamp?: number
}

export interface PushSyncResult {
  success: boolean
  message?: string
  syncedIds?: string[]
}

const requireUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('Server URL is required')
  return trimmed.replace(/\/+$/, '')
}

const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  const text = await response.text()

  let parsed: any = {}
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = {}
    }
  }

  if (!response.ok) {
    const message = parsed?.message || response.statusText || 'Request failed'
    throw new Error(message)
  }

  return parsed as T
}

export const getServerHealth = async (baseUrl: string): Promise<ServerHealth> => {
  const base = requireUrl(baseUrl)
  try {
    return await getJson<ServerHealth>(`${base}/health`)
  } catch (error) {
    console.warn('Server health check failed', error)
    throw error instanceof Error ? error : new Error('Server health check failed')
  }
}

export const getServerSyncStatus = async (baseUrl: string): Promise<ServerSyncStatus> => {
  const base = requireUrl(baseUrl)
  try {
    return await getJson<ServerSyncStatus>(`${base}/sync/status`)
  } catch (error) {
    console.warn('Server sync status failed', error)
    throw error instanceof Error ? error : new Error('Server sync status failed')
  }
}

export const pushSyncOperations = async (
  baseUrl: string,
  operations: SyncOperation[],
  clientId?: string
): Promise<PushSyncResult> => {
  const base = requireUrl(baseUrl)

  if (!operations.length) {
    return { success: true, message: 'No operations to push', syncedIds: [] }
  }

  try {
    return await getJson<PushSyncResult>(`${base}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientId ? { 'X-Client-Id': clientId } : {})
      },
      body: JSON.stringify({ operations, clientId })
    })
  } catch (error) {
    console.warn('Server sync push failed', error)
    throw error instanceof Error ? error : new Error('Server sync push failed')
  }
}
