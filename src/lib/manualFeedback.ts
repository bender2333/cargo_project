import type { Locale } from '../types'
import type { ValidationIssue } from './manualPlacement'

export type ManualOperation = 'move' | 'drop' | 'rotate' | 'delete'

export type ManualOperationNotice = {
  id: string
  operation: ManualOperation
  boxId?: string
  cargoId?: string
  reasonCode: ValidationIssue['type'] | 'quantity-limit' | 'missing-target'
  message: string
  createdAt: number
}

const issueMessages: Record<Locale, Record<ManualOperationNotice['reasonCode'], string>> = {
  en: {
    boundary: 'Operation rejected: the box exceeds the effective container bounds.',
    overlap: 'Operation rejected: the box overlaps another cargo box.',
    floating: 'Operation rejected: the box needs at least 50% base support.',
    'rotation-disabled': 'Operation rejected: this cargo cannot be rotated.',
    stacking: 'Operation rejected: the box is stacked on non-stackable cargo.',
    'quantity-limit': 'Operation rejected: all units of this cargo are already placed.',
    'missing-target': 'Operation rejected: no valid placement target was found.',
  },
  zh: {
    boundary: '操作未生效：货物超出有效货柜边界。',
    overlap: '操作未生效：货物与其他货物发生碰撞。',
    floating: '操作未生效：货物处于悬空状态，底面至少需要 50% 支撑。',
    'rotation-disabled': '操作未生效：该货物禁止旋转。',
    stacking: '操作未生效：货物堆叠在不可堆叠货物上。',
    'quantity-limit': '操作未生效：该货物数量已经全部放置。',
    'missing-target': '操作未生效：未找到有效放置目标。',
  },
}

export function createManualOperationNotice(input: {
  operation: ManualOperation
  boxId?: string
  cargoId?: string
  issues?: ValidationIssue[]
  reasonCode?: ManualOperationNotice['reasonCode']
  locale: Locale
  now?: number
}): ManualOperationNotice {
  const reasonCode = input.reasonCode ?? input.issues?.[0]?.type ?? 'missing-target'
  const message = issueMessages[input.locale][reasonCode] ?? input.issues?.[0]?.message ?? issueMessages[input.locale]['missing-target']
  return {
    id: `${input.operation}-${input.boxId ?? input.cargoId ?? 'target'}-${input.now ?? Date.now()}`,
    operation: input.operation,
    boxId: input.boxId,
    cargoId: input.cargoId,
    reasonCode,
    message,
    createdAt: input.now ?? Date.now(),
  }
}

export function manualOperationNoticeMessage(notice: ManualOperationNotice) {
  return notice.message
}
