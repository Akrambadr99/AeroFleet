import { requireThat } from '../workspace/values'
export const workflowKey = "return-to-service"
export const workflowLabel = "Return to service"
export const ruleKind = "dependency"
export interface ReturnToServiceRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: ReturnToServiceRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured === record.limit, 'Technical-record revision does not match Approved record revision.')
  requireThat(record.evidence.trim().length >= 8, 'Return to service require traceable evidence.')
  requireThat(record.revision > 0, 'Return to service require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
