import { requireThat } from '../workspace/values'
export const workflowKey = "deferred-defect"
export const workflowLabel = "Deferred defect control"
export const ruleKind = "threshold"
export interface DeferredDefectRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: DeferredDefectRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Defect severity exceed Maximum deferrable severity.')
  requireThat(record.evidence.trim().length >= 8, 'Deferred defect control require traceable evidence.')
  requireThat(record.revision > 0, 'Deferred defect control require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
