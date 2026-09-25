import type { Symptom } from '../db/db'

/**
 * How far nerve-type symptoms reach down the leg (lower back) or arm (neck). Moving back towards the spine
 * ("centralising") is usually a good sign with a disc problem; spreading further down is worth telling a physio.
 */
const SCALES = {
  leg: ['Back only', 'Buttock or hip', 'Thigh', 'Below the knee', 'Foot or toes'],
  arm: ['Neck only', 'Shoulder blade', 'Upper arm', 'Below the elbow', 'Hand or fingers'],
} as const

/** The scale for an injury's body region, if its symptoms can travel down a limb. */
export function reachScale(region: string | undefined): readonly string[] | undefined {
  return region === 'Lower back' ? SCALES.leg : region === 'Neck' || region === 'Upper back' ? SCALES.arm : undefined
}
export const limbOf = (region: string | undefined) => (region === 'Lower back' ? 'leg' : 'arm')
/** Symptom types that can travel. */
export const REACH_TYPES = ['pain', 'numbness', 'tingling', 'burning', 'weakness']

export const reachLabel = (region: string | undefined, reach: number | undefined) => (reach === undefined ? undefined : reachScale(region)?.[reach])

export type ReachTrend = 'centralising' | 'spreading' | 'steady'

/** The latest few entries against the few before them (by time): half a step or more either way is a trend. */
export function reachTrend(symptoms: Pick<Symptom, 'reach' | 'recordedAt' | 'deletedAt'>[]): ReachTrend | undefined {
  const r = symptoms.filter((s) => !s.deletedAt && s.reach !== undefined).sort((a, b) => a.recordedAt - b.recordedAt).map((s) => s.reach!)
  const n = Math.min(3, Math.floor(r.length / 2))
  if (!n) return undefined
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const diff = mean(r.slice(-n)) - mean(r.slice(-2 * n, -n))
  return diff >= 0.5 ? 'spreading' : diff <= -0.5 ? 'centralising' : 'steady'
}
