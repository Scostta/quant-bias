// lib/bias.js
// Dual-layer macro/micro bias + conflict analysis

export function computeMacroBias({ regTrend, adx, plusDI, minusDI, price, vwap, onHigh, onLow, slopeMedium }) {
  let score = 0
  score += regTrend === 'UP' ? 3 : -3
  score += slopeMedium > 0   ? 2 : -2
  if (adx != null && adx > 20 && plusDI != null && minusDI != null) score += plusDI > minusDI ? 2 : -2
  if (vwap != null) score += price > vwap ? 1 : -1
  score += price > (onHigh + onLow) / 2 ? 1 : -1
  const maxS   = 9
  const bullPct = Math.round((score + maxS) / (2 * maxS) * 100)
  return { direction: score >= 0 ? 'BULLISH' : 'BEARISH', bullPct, score }
}

export function computeMicroBias({ moDir, moIntensity, orbSignal, rsi, price, vwap, slopeShort }) {
  let score = 0
  const moW = 3 * (moIntensity / 100)
  score += moDir === 'BULLISH' ? moW : -moW
  if (orbSignal === 'BULLISH')      score += 2
  else if (orbSignal === 'BEARISH') score -= 2
  score += slopeShort > 0  ? 2 : -2
  if (vwap != null) score += price > vwap ? 1 : -1
  if (rsi != null && rsi > 55)      score += 1
  else if (rsi != null && rsi < 45) score -= 1
  const maxS   = 9
  const bullPct = Math.round((score + maxS) / (2 * maxS) * 100)
  return { direction: score >= 0 ? 'BULLISH' : 'BEARISH', bullPct, score }
}

export function conflictAnalysis({ macroDir, macroScore, microDir, microScore, adx }) {
  const hasConflict = macroDir !== microDir
  let level, action, message

  if (!hasConflict) {
    if (Math.abs(macroScore) >= 6 && Math.abs(microScore) >= 6) {
      level   = 'STRONG'
      action  = 'TRADE WITH TREND'
      message = `Both layers aligned ${macroDir}. High conviction.`
    } else {
      level   = 'MODERATE'
      action  = 'BIAS EXISTS — WAIT FOR ENTRY'
      message = `Both layers lean ${macroDir} with moderate confidence.`
    }
  } else {
    const ma = Math.abs(macroScore), mi = Math.abs(microScore)
    if (ma > mi + 2) {
      level   = 'MACRO DOMINATES'
      action  = `FADE MICRO / WAIT FOR MACRO ENTRY (${macroDir})`
      message = `Macro ${macroDir} structural. Micro ${microDir} likely counter-trend bounce.`
    } else if (mi > ma + 2) {
      level   = 'MICRO DOMINATES'
      action  = `SCALP ${microDir} — TIGHT STOPS — MACRO HEADWIND`
      message = `Micro ML ${microDir} (momentum). Macro ${macroDir}. Move possible vs structure.`
    } else {
      level   = 'TRUE CONFLICT'
      action  = 'STAND ASIDE — WAIT FOR RESOLUTION'
      message = `Macro (${macroDir}) and micro (${microDir}) equally split.`
    }
    if (adx != null && adx < 18) message += ' ⚠ ADX < 18 — choppy, avoid breakouts.'
  }

  return { hasConflict, level, action, message }
}

export function classifyORB({ orbHigh, orbLow, price, atr }) {
  const range = orbHigh - orbLow
  const ratio = range / (atr || 1)
  let quality, note, signal

  if (ratio > 1.5) {
    quality = 'EXTENDED'
    note    = `${range.toFixed(0)}pts > 1.5×ATR — fades more probable`
  } else if (ratio < 0.25) {
    quality = 'COMPRESSED'
    note    = `${range.toFixed(0)}pts < 0.25×ATR — explosive breakout risk`
  } else {
    quality = 'NORMAL'
    note    = `Healthy range (${ratio.toFixed(2)}×ATR)`
  }

  if (price > orbHigh)      signal = 'BULLISH'
  else if (price < orbLow)  signal = 'BEARISH'
  else                       signal = 'NEUTRAL'

  const status = price > orbHigh ? 'BREAKOUT UP' : price < orbLow ? 'BREAKOUT DOWN' : 'INSIDE RANGE'

  return { quality, note, signal, status, range: Math.round(range * 100) / 100, ratio: Math.round(ratio * 100) / 100 }
}

export function classifyDayType({ onHigh, onLow, atr, adx, prevHigh, prevLow }) {
  const onRange    = onHigh - onLow
  const rangeRatio = onRange / (atr || 1)
  const scores     = {}
  const adxVal     = adx ?? 0

  let s = 0
  if (rangeRatio < 0.4)         s += 40
  else if (rangeRatio < 0.6)    s += 20
  if (adxVal > 25)      s += 30
  else if (adxVal > 20) s += 15
  scores['TREND DAY'] = Math.min(s, 85)

  s = 0
  if (rangeRatio > 1.0)         s += 40
  else if (rangeRatio > 0.7)    s += 25
  if (adxVal < 20)      s += 30
  else if (adxVal < 25) s += 15
  scores['RANGE DAY'] = Math.min(s, 80)

  scores['NORMAL DAY'] = Math.max(0, Math.round(60 - Math.abs(rangeRatio - 0.65) * 40))

  s = 0
  if (onHigh > prevHigh * 1.002) s += 35
  if (onLow  < prevLow  * 0.998) s += 35
  scores['REVERSAL DAY'] = Math.min(s, 75)

  const best     = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return { type: best[0], prob: best[1], scores }
}

