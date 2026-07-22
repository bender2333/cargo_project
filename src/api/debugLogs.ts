import { fetchWithAuth } from './client'

type RecentLogsDto = {
  path: string
  count: number
  lines: string[]
}

function isRecentLogsDto(value: unknown): value is RecentLogsDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const dto = value as Record<string, unknown>
  return typeof dto.path === 'string'
    && dto.path.trim().length > 0
    && Number.isInteger(dto.count)
    && Number(dto.count) >= 0
    && Array.isArray(dto.lines)
    && dto.lines.every((line) => typeof line === 'string')
    && dto.count === dto.lines.length
}

export async function readRecentServerLogs(): Promise<string[]> {
  const response = await fetchWithAuth('/api/_debug/recent-logs?limit=120')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('服务器日志响应格式无效：服务器响应不是有效 JSON')
  }

  if (!isRecentLogsDto(data)) throw new Error('服务器日志响应格式无效')
  return data.lines
}
