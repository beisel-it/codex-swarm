import { describe, expect, it } from 'vitest'

import { mockDashboardData } from './mock-data.js'
import { deriveBoardModel } from './view-model.js'

describe('deriveBoardModel', () => {
  it('surfaces blocked work, pending approvals, failed validations, and fleet issues', () => {
    const model = deriveBoardModel(mockDashboardData, 'run-beta')

    expect(model.stats.find((card) => card.label === 'Blocked')?.value).toBe('0')
    expect(model.stats.find((card) => card.label === 'Approvals')?.value).toBe('1')
    expect(model.stats.find((card) => card.label === 'Failed checks')?.value).toBe('1')
    expect(model.stats.find((card) => card.label === 'Fleet alerts')?.value).toBe('2')
    expect(model.alerts.some((alert) => alert.label.includes('approval pending'))).toBe(true)
    expect(model.alerts.some((alert) => alert.label.includes('failed'))).toBe(true)
    expect(model.alerts.some((alert) => alert.label.includes('degraded'))).toBe(true)
  })
})
