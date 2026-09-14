import { requireThat } from '../workspace/values'
export const workflowKey = "flight-assignment"
export const workflowLabel = "Flight assignment conflicts"
export const ruleKind = "capacity"
export interface FlightAssignmentRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: FlightAssignmentRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Required flight hours exceed Available aircraft hours.')
  requireThat(record.evidence.trim().length >= 8, 'Flight assignment conflicts require traceable evidence.')
  requireThat(record.revision > 0, 'Flight assignment conflicts require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
