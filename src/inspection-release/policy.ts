import { requireThat } from '../workspace/values'
export const workflowKey = "inspection-release"
export const workflowLabel = "Inspection release"
export const ruleKind = "qualification"
export interface InspectionReleaseRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: InspectionReleaseRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Inspector authorization score fall below Minimum authorization score.')
  requireThat(record.evidence.trim().length >= 8, 'Inspection release require traceable evidence.')
  requireThat(record.revision > 0, 'Inspection release require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
