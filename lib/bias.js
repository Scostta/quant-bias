// lib/bias.js
// Dual-layer macro/micro bias + conflict analysis

export function computeMacroBias({ regTrend, adx, plusDI, minusDI, price, vwap, onHigh, onLow, slopeMedium }) {
  let score = 0
  score += regTrend === 'UP' ? 3 : -3
  score += slopeMedium > 0   ? 2 : -2
  if (adx > 20) score += plusDI > minusDI ? 2 : -2
  score += price > vwap ? 1 : -1
  score += price > (onHigh + onLow) / 2 ? 1 : -1
  const maxS   = 9
  const bullPct = Math.round((score + maxS) / (2 * maxS) * 100)
  return { direction: score >= 0 ? 'BULLISH' : 'BEARISH', bullPct, score }
}

export function computeMicroBias({ mlDir, mlConf, orbSignal, rsi, price, vwap, slopeShort }) {
  let score = 0
  const mlW = 3 * (mlConf / 100)
  score += mlDir === 'BULLISH' ? mlW : -mlW
  if (orbSignal === 'BULLISH')      score += 2
  else if (orbSignal === 'BEARISH') score -= 2
  score += slopeShort > 0  ? 2 : -2
  score += price > vwap    ? 1 : -1
  if (rsi > 55)      score += 1
  else if (rsi < 45) score -= 1
  const maxS   = 9
  const bullPct = Math.round((score + maxS) / (2 * maxS) * 100)
  return { direction: score >= 0 ? 'BULLISH' : 'BEARISH', bullPct, score }
}

export function conflictAnalysis({ macroDir, macroScore, microDir, microScore, modelAcc, adx }) {
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
    if (modelAcc < 53) message += ' ⚠ ML signal low confidence.'
    if (adx < 18)      message += ' ⚠ ADX < 18 — choppy, avoid breakouts.'
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

  let s = 0
  if (rangeRatio < 0.4)      s += 40
  else if (rangeRatio < 0.6) s += 20
  if (adx > 25)      s += 30
  else if (adx > 20) s += 15
  scores['TREND DAY'] = Math.min(s, 85)

  s = 0
  if (rangeRatio > 1.0)      s += 40
  else if (rangeRatio > 0.7) s += 25
  if (adx < 20)      s += 30
  else if (adx < 25) s += 15
  scores['RANGE DAY'] = Math.min(s, 80)

  scores['NORMAL DAY'] = Math.max(0, Math.round(60 - Math.abs(rangeRatio - 0.65) * 40))

  s = 0
  if (onHigh > prevHigh * 1.002) s += 35
  if (onLow  < prevLow  * 0.998) s += 35
  scores['REVERSAL DAY'] = Math.min(s, 75)

  const best     = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return { type: best[0], prob: best[1], scores }
}

export function runBacktest(allBars) {
  // Group bars by date (ET)
  const byDate = {}
  for (const b of allBars) {
    const dt  = new Date(b.timestamp)
    const key = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(b)
  }

  const dates   = Object.keys(byDate).sort()
  const results = []

  for (let di = 1; di < dates.length; di++) {
    try {
      const date    = dates[di]
      const dayBars = byDate[date]

      // RTH bars 08:00–10:30 ET
      const rth = dayBars.filter(b => {
        const dt  = new Date(b.timestamp)
        const h   = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
        const m   = dt.toLocaleString('en-US', { minute: '2-digit', timeZone: 'America/New_York' })
        return h >= 8 && (h < 10 || (h === 10 && parseInt(m) <= 30))
      })

      if (rth.length < 3) continue

      const openP  = rth[0].open
      const closeP = rth[rth.length - 1].close
      const actual = closeP > openP ? 'BULLISH' : 'BEARISH'

      // Pre-08:00 bars for that day + all previous day bars
      const prevBars = dates
        .slice(Math.max(0, di - 3), di)
        .flatMap(d => byDate[d])
        .concat(dayBars.filter(b => {
          const h = parseInt(new Date(b.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
          return h < 8
        }))

      if (prevBars.length < 20) continue

      // Quick structural bias
      const pre48    = prevBars.slice(-48)
      const closes   = pre48.map(b => b.close)
      const last     = closes[closes.length - 1]
      const vwapPre  = pre48.reduce((a, b) => a + b.close * b.volume, 0) / (pre48.reduce((a, b) => a + b.volume, 0) || 1)
      const onMid    = (Math.max(...pre48.slice(-12).map(b => b.high)) + Math.min(...pre48.slice(-12).map(b => b.low))) / 2
      const slope    = closes.length >= 24 ? closes[closes.length - 1] - closes[closes.length - 24] : 0

      let sc = 0
      sc += slope > 0   ? 2 : -2
      sc += last > vwapPre ? 1 : -1
      sc += last > onMid ? 1 : -1

      const predicted = sc >= 0 ? 'BULLISH' : 'BEARISH'
      const movePct   = Math.round(Math.abs(closeP - openP) / openP * 10000) / 100

      results.push({ date, predicted, actual, correct: predicted === actual, movePct, open: openP, close: closeP })
    } catch (_) { continue }
  }

  if (results.length === 0) return { error: 'not enough data', accuracy: null, last10: [] }

  const total     = results.length
  const correct   = results.filter(r => r.correct).length
  const accuracy  = Math.round(correct / total * 1000) / 10
  const strongDays = results.filter(r => r.movePct > 0.1)
  const strongAcc  = strongDays.length ? Math.round(strongDays.filter(r => r.correct).length / strongDays.length * 1000) / 10 : null
  const bullDays   = results.filter(r => r.actual === 'BULLISH')
  const bearDays   = results.filter(r => r.actual === 'BEARISH')
  const bullAcc    = bullDays.length ? Math.round(bullDays.filter(r => r.correct).length / bullDays.length * 1000) / 10 : null
  const bearAcc    = bearDays.length ? Math.round(bearDays.filter(r => r.correct).length / bearDays.length * 1000) / 10 : null

  let streak = 0
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].correct) streak++; else break
  }

  return {
    totalDays: total, correct, accuracy, strongAcc, bullAcc, bearAcc,
    streak, avgMove: Math.round(results.reduce((a, r) => a + r.movePct, 0) / total * 100) / 100,
    last10: results.slice(-10),
  }
}
