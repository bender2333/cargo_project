import type { Locale, PackingDiagnostic, UnplacedCargo } from '../types'

const unplacedReasonMessages: Record<Locale, Record<string, string>> = {
  zh: {
    'exceeds-dimensions': '超出货柜尺寸',
    'exceeds-payload': '超过最大载重',
    'no-space': '没有剩余装载空间',
    'manual-not-placed': '尚未在手动排布中放置',
  },
  en: {
    'exceeds-dimensions': 'Exceeds container dimensions',
    'exceeds-payload': 'Exceeds maximum payload',
    'no-space': 'No remaining loading space',
    'manual-not-placed': 'Not placed in the manual arrangement',
  },
}

const zhDiagnosticMessages: Record<string, string> = {
  'boundary-check': '边界检查失败：至少一个已装箱体超出有效货柜。',
  'weight-check': '载重检查失败：已装货物超过最大载重。',
  'overlap-check': '重叠检查失败：至少一组已装箱体发生重叠。',
  'support-check': '支撑检查失败：堆叠货物缺少明确支撑。',
  'stacking-check': '堆叠检查失败：货物被放在不可堆叠项目上。',
  'support-check-warning': '支撑检查提醒：部分箱体只有部分支撑。',
  'optimization-suggestion-warning': '优化建议：检查未装入货物、柜型、预留间隙、载重限制或堆叠规则。',
  'optimization-suggestion-info': '优化建议：当前方案没有明显合规阻塞。',
  'stack-capacity-limit': '堆叠容量提示：未装货物主要受不可堆叠或容量 1 货物过多限制。',
}

export function formatDiagnosticMessage(diagnostic: PackingDiagnostic, locale: Locale): string {
  if (diagnostic.id.startsWith('unplaced-') && diagnostic.code) {
    const reason = unplacedReasonMessages[locale][diagnostic.code] ?? diagnostic.code
    const params = diagnostic.params ?? {}
    const label = String(params.label ?? '')
    const name = String(params.name ?? '')
    const quantity = String(params.quantity ?? '')
    return locale === 'zh'
      ? `${label} ${name}：${quantity} 未装入，原因：${reason}。`
      : `${label} ${name}: ${quantity} unplaced because ${reason}.`
  }

  if (locale === 'en') return diagnostic.message
  const baseId = diagnostic.id.split(':', 1)[0]
  const severityKey = `${baseId}-${diagnostic.severity}`
  return zhDiagnosticMessages[severityKey] ?? zhDiagnosticMessages[baseId] ?? '存在未通过的合规诊断。'
}

export function formatUnplacedCargoMessage(entry: UnplacedCargo, locale: Locale): string {
  const reason = unplacedReasonMessages[locale][entry.reasonCode] ?? entry.reason
  return locale === 'zh'
    ? `${entry.name} × ${entry.quantity}：${reason}`
    : `${entry.name} x ${entry.quantity}: ${reason}`
}
