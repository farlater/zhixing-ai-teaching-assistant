export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: options?.body instanceof FormData ? options.headers : { 'content-type': 'application/json', ...options?.headers }
  })
  if (!response.ok) {
    let message = `请求失败（${response.status}）`
    try { message = (await response.json()).error || message } catch { /* ignore */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json()
}

export const post = <T>(url: string, body?: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(body || {}) })
export const patch = <T>(url: string, body: unknown) => api<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
export const remove = (url: string) => api<void>(url, { method: 'DELETE' })

export const questionTypeLabel: Record<string, string> = {
  single: '单选题', multiple: '多选题', truefalse: '判断题', blank: '填空题', short: '解答题'
}

export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'
