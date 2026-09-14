import { requireThat } from '../workspace/values'
export const workflowKey = "aircraft-grounding"
export const workflowLabel = "Aircraft grounding"
export const ruleKind = "freshness"
export interface AircraftGroundingRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: AircraftGroundingRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Telemetry age (minutes) exceed Maximum telemetry age.')
  requireThat(record.evidence.trim().length >= 8, 'Aircraft grounding require traceable evidence.')
  requireThat(record.revision > 0, 'Aircraft grounding require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
