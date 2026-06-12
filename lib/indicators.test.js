// lib/indicators.test.js
import { describe, it, expect } from 'vitest'
import { computeVWAP, computeRSI, computeADX } from './indicators.js'

// Build a timestamp at a fixed date/time in Eastern Standard Time (UTC-5).
// January 2024 is always in EST (no DST), making this deterministic.
function estTs(day, hour, min = 0) {
  return new Date(
    `2024-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-05:00`
  ).getTime()
}

describe('computeVWAP — session-anchored VWAP', () => {
  it('resets at the 18:00 ET Globex boundary between two sessions', () => {
    const bars = [
      // Session 1 opens Jan 15 at 18:00 ET
      { timestamp: estTs(15, 18, 0),  open: 100, high: 102, low:  98, close: 101, volume: 1000 },
      { timestamp: estTs(15, 18, 30), open: 101, high: 104, low: 100, close: 103, volume: 2000 },
      // Session 2 opens Jan 16 at 18:00 ET — VWAP must start from zero here
      { timestamp: estTs(16, 18, 0),  open: 200, high: 202, low: 199, close: 201, volume:  500 },
      { timestamp: estTs(16, 18, 30), open: 201, high: 203, low: 200, close: 202, volume:  500 },
    ]
    const vwap = computeVWAP(bars)

    // Session 1 — bar 0
    const tp0 = (102 + 98 + 101) / 3
    expect(vwap[0]).toBeCloseTo(tp0, 4)

    // Session 1 — bar 1: weighted accumulation within the session
    const tp1 = (104 + 100 + 103) / 3
    const exp1 = (tp0 * 1000 + tp1 * 2000) / 3000
    expect(vwap[1]).toBeCloseTo(exp1, 4)

    // Session 2 — bar 2: MUST reset; only this bar contributes
    const tp2 = (202 + 199 + 201) / 3
    expect(vwap[2]).toBeCloseTo(tp2, 4)

    // Session 2 — bar 3: accumulated only within session 2
    const tp3 = (203 + 200 + 202) / 3
    const exp3 = (tp2 * 500 + tp3 * 500) / 1000
    expect(vwap[3]).toBeCloseTo(exp3, 4)
  })

  it('bars with null volume are excluded from the accumulation', () => {
    const bars = [
      { timestamp: estTs(15, 18, 0),  open: 100, high: 102, low: 98, close: 101, volume: null },
      { timestamp: estTs(15, 18, 30), open: 101, high: 104, low: 100, close: 103, volume: 1000 },
    ]
    const vwap = computeVWAP(bars)

    // First bar has no volume → no accumulation → null VWAP
    expect(vwap[0]).toBeNull()

    // Second bar has volume → VWAP = its own typical price
    const tp = (104 + 100 + 103) / 3
    expect(vwap[1]).toBeCloseTo(tp, 4)
  })

  it('returns null for every bar when the whole session has no volume', () => {
    const bars = [
      { timestamp: estTs(15, 18, 0),  open: 100, high: 102, low: 98, close: 101, volume: null },
      { timestamp: estTs(15, 18, 30), open: 101, high: 104, low: 100, close: 103, volume: null },
    ]
    const vwap = computeVWAP(bars)
    expect(vwap[0]).toBeNull()
    expect(vwap[1]).toBeNull()
  })

  it('bars in the same day before 18:00 ET belong to the previous session', () => {
    const bars = [
      // Jan 16 morning (before 18:00 ET) → same session as Jan 15 evening
      { timestamp: estTs(15, 18, 0),  open: 100, high: 101, low:  99, close: 100, volume: 1000 },
      { timestamp: estTs(16,  9, 30), open: 100, high: 102, low:  99, close: 101, volume: 1000 },
      // Jan 16 at 18:00 ET → new session
      { timestamp: estTs(16, 18, 0),  open: 200, high: 202, low: 199, close: 200, volume:  500 },
    ]
    const vwap = computeVWAP(bars)

    // Bars 0 and 1 are in the same session
    const tp0 = (101 + 99  + 100) / 3
    const tp1 = (102 + 99  + 101) / 3
    const exp1 = (tp0 * 1000 + tp1 * 1000) / 2000
    expect(vwap[1]).toBeCloseTo(exp1, 4)

    // Bar 2 starts a new session — must reset
    const tp2 = (202 + 199 + 200) / 3
    expect(vwap[2]).toBeCloseTo(tp2, 4)
  })
})

// ─── RSI (Wilder) ───────────────────────────────────────────────────────────
function makeCloseBars(closes) {
  return closes.map((c, i) => ({ open: c, high: c, low: c, close: c, volume: 1000, timestamp: i * 1800000 }))
}

describe('computeRSI — Wilder smoothing', () => {
  it('returns null for bars before the seed window', () => {
    const bars = makeCloseBars(Array.from({ length: 14 }, (_, i) => 100 + i))
    const rsi = computeRSI(bars, 14)
    for (let i = 0; i < 14; i++) expect(rsi[i]).toBeNull()
  })

  it('returns 100 when all moves are up (no losses)', () => {
    const bars = makeCloseBars(Array.from({ length: 20 }, (_, i) => 100 + i))
    const rsi = computeRSI(bars, 14)
    expect(rsi[14]).toBe(100)
    expect(rsi[19]).toBe(100)
  })

  it('returns 0 when all moves are down (no gains)', () => {
    const bars = makeCloseBars(Array.from({ length: 20 }, (_, i) => 200 - i))
    const rsi = computeRSI(bars, 14)
    expect(rsi[14]).toBe(0)
    expect(rsi[19]).toBe(0)
  })

  it('returns ~50 for equal alternating up/down moves at seed', () => {
    // 15 closes: flat start then 7 up, 7 down (indices 1-14)
    const closes = [100, 101, 102, 103, 104, 105, 106, 107, 106, 105, 104, 103, 102, 101, 100]
    const rsi = computeRSI(makeCloseBars(closes), 14)
    // Wilder seed: 7 gains of 1, 7 losses of 1 → avgGain = avgLoss → RSI = 50
    expect(rsi[14]).toBeCloseTo(50, 5)
  })

  it('RSI stays in [0, 100] range for arbitrary data', () => {
    const closes = [100, 102, 98, 103, 99, 104, 100, 105, 101, 106, 102, 107, 103, 108, 104, 109, 105, 110, 106, 111]
    const rsi = computeRSI(makeCloseBars(closes), 14)
    for (const v of rsi.filter(v => v !== null)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

// ─── ADX (Wilder) ───────────────────────────────────────────────────────────
describe('computeADX — Wilder smoothing', () => {
  it('returns null for insufficient data', () => {
    const bars = makeCloseBars(Array.from({ length: 25 }, (_, i) => 100 + i))
    // period=14 requires 2*14-1=27 bars minimum
    const result = computeADX(bars, 14)
    expect(result.adx).toBeNull()
  })

  it('returns numeric values when data is sufficient', () => {
    const bars = makeCloseBars(Array.from({ length: 50 }, (_, i) => 100 + i))
    const result = computeADX(bars, 14)
    expect(result.adx).not.toBeNull()
    expect(result.adx).toBeGreaterThanOrEqual(0)
    expect(result.plusDI).not.toBeNull()
    expect(result.minusDI).not.toBeNull()
  })

  it('DI+ > DI- for a strongly rising bar sequence', () => {
    // All closes rising → +DM dominant → DI+ should exceed DI-
    const bars = makeCloseBars(Array.from({ length: 60 }, (_, i) => 100 + i * 0.5))
    const result = computeADX(bars, 14)
    expect(result.plusDI).toBeGreaterThan(result.minusDI)
  })
})
