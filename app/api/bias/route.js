// app/api/bias/route.js
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import {
  computeATR, computeVWAP, computeRSI, computeADX,
  rollingSlope, regressionRange, computeMomentumScore
} from '../../../lib/indicators'
import {
  computeMacroBias, computeMicroBias, conflictAnalysis,
  classifyORB, classifyDayType,
} from '../../../lib/bias'

const SYMBOLS = { NQ: 'NQ=F', ES: 'ES=F' }

// ─── Session configuration — single source of truth ───────────────────────
// All times in America/New_York (ET). Spain time is derived dynamically via Intl.
const SESSION = {
  tz:              'America/New_York',
  cashOpenHour:    9,   // NYSE/CME regular session open: 9:30 ET
  cashOpenMin:     30,
  analysisEndHour: 11,  // bias evaluation window closes at 11:30 ET
  analysisEndMin:  30,
  orbBars:         1,   // number of 30-min bars that form the Opening Range
}

// ─── Yahoo Finance v3 (lazy import avoids module-level crash) ──────────────
async function getYF() {
  const mod = await import('yahoo-finance2')
  // v3: named export YahooFinance, must be instantiated
  const YF = mod.YahooFinance ?? mod.default
  return typeof YF === 'function' && YF.prototype ? new YF() : YF
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function normalizeQuote(q) {
  const ts = q.date instanceof Date
    ? q.date.getTime()
    : q.date ? new Date(q.date).getTime()
      : q.timestamp ? q.timestamp * 1000 : null
  return {
    timestamp: ts,
    open: q.open ?? q.regularMarketOpen ?? null,
    high: q.high ?? q.regularMarketDayHigh ?? null,
    low: q.low ?? q.regularMarketDayLow ?? null,
    close: q.close ?? q.regularMarketPrice ?? null,
    volume: q.volume ?? q.regularMarketVolume ?? null,
  }
}

async function fetchBars(symbol, interval = '30m', days = 58) {
  const yf = await getYF()
  const result = await yf.chart(
    symbol,
    { interval, period1: daysAgo(days), period2: new Date(), includePrePost: true },
    { validateResult: false }
  )
  return (result?.quotes ?? []).map(normalizeQuote)
    .filter(q => q.timestamp && q.open && q.high && q.low && q.close)
}

async function fetchDailyBars(symbol) {
  const yf = await getYF()
  const result = await yf.chart(
    symbol,
    { interval: '1d', period1: daysAgo(60), period2: new Date() },
    { validateResult: false }
  )
  return (result?.quotes ?? []).map(normalizeQuote)
    .filter(q => q.timestamp && q.open && q.close)
}

// ─── Overnight 18:00 ET (prev day) – cash open (9:30 ET) ──────────────────
// refDateET: 'YYYY-MM-DD' ET date of the day whose overnight we want.
function overnightRange(bars, refDateET) {
  const [y, mo, da] = refDateET.split('-').map(Number)
  const prevDay = new Date(y, mo - 1, da - 1)
  const prevDateET = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`
  const cashOpenMins = SESSION.cashOpenHour * 60 + SESSION.cashOpenMin

  const src = bars.filter(b => {
    const dt = new Date(b.timestamp)
    const dateET = dt.toLocaleDateString('en-CA', { timeZone: SESSION.tz })
    const h = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: SESSION.tz }))
    const m = parseInt(dt.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: SESSION.tz }))
    return (dateET === prevDateET && h >= 18)
      || (dateET === refDateET && (h * 60 + m) < cashOpenMins)
  })
  const use = src.length >= 2 ? src : bars.slice(-10)
  return { high: Math.max(...use.map(b => b.high)), low: Math.min(...use.map(b => b.low)), bars: use.length }
}

// ─── ORB — SESSION.orbBars × 30-min bars starting at 9:30 ET cash open ────
function openingRange(bars, atr) {
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: SESSION.tz })
  const orbStartMins = SESSION.cashOpenHour * 60 + SESSION.cashOpenMin
  const orbEndMins   = orbStartMins + SESSION.orbBars * 30

  let src = bars.filter(b => {
    const dt = new Date(b.timestamp)
    if (dt.toLocaleDateString('en-CA', { timeZone: SESSION.tz }) !== todayET) return false
    const h = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: SESSION.tz }))
    const m = parseInt(dt.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: SESSION.tz }))
    const mins = h * 60 + m
    return mins >= orbStartMins && mins < orbEndMins
  })
  if (!src.length) return { high: null, low: null, quality: 'N/A', note: 'Cash session not open yet (9:30 ET)', signal: 'NEUTRAL', status: 'N/A', range: null, ratio: null }

  const high = Math.max(...src.map(b => b.high))
  const low = Math.min(...src.map(b => b.low))
  const price = bars.at(-1).close
  return { high, low, ...classifyORB({ orbHigh: high, orbLow: low, price, atr }) }
}

// ─── Wilson binomial 95% CI ────────────────────────────────────────────────
function binomialCI95(k, n) {
  if (n === 0) return { lo: 0, hi: 100, margin: 50 }
  const p = k / n, z = 1.96, z2 = z * z
  const denom  = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom
  return {
    lo:     Math.round(Math.max(0, center - margin) * 1000) / 10,
    hi:     Math.round(Math.min(1, center + margin) * 1000) / 10,
    margin: Math.round(margin * 1000) / 10,
  }
}

// ─── Full-pipeline backtest ────────────────────────────────────────────────
// Runs the EXACT same indicator/signal pipeline as the live analyzeSymbol call.
// Look-ahead guard: signal is computed using only bars strictly before 9:30 ET.
// Outcome: direction of open→close return in the 9:30–11:30 ET window.
// True-Conflict days (system said stand aside) and noise days (move < 0.05%)
// are excluded from accuracy and counted separately.
// Data limit: Yahoo Finance 30-min history covers ~60 calendar days.
function runBacktest(allBars) {
  const byDate = {}
  for (const b of allBars) {
    const key = new Date(b.timestamp).toLocaleDateString('en-CA', { timeZone: SESSION.tz })
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(b)
  }

  const dates = Object.keys(byDate).sort()
  const results = []
  let noiseDays = 0, conflictDays = 0

  const cashOpenMins    = SESSION.cashOpenHour * 60 + SESSION.cashOpenMin
  const analysisEndMins = SESSION.analysisEndHour * 60 + SESSION.analysisEndMin

  for (let di = 3; di < dates.length; di++) {
    try {
      const date    = dates[di]
      const dayBars = byDate[date]

      // Outcome: 9:30–11:30 ET window
      const cashBars = dayBars.filter(b => {
        const dt = new Date(b.timestamp)
        const h  = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: SESSION.tz }))
        const m  = parseInt(dt.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: SESSION.tz }))
        const mins = h * 60 + m
        return mins >= cashOpenMins && mins < analysisEndMins
      })
      if (cashBars.length < 2) continue

      const openP   = cashBars[0].open
      const closeP  = cashBars[cashBars.length - 1].close
      const movePct = Math.abs(closeP - openP) / openP * 100

      if (movePct < 0.05) { noiseDays++; continue }

      const actual = closeP > openP ? 'BULLISH' : 'BEARISH'

      // Signal input: last 3 full days + today's bars strictly before 9:30 ET
      const preBars = dates.slice(Math.max(0, di - 3), di)
        .flatMap(d => byDate[d])
        .concat(dayBars.filter(b => {
          const dt = new Date(b.timestamp)
          const h  = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: SESSION.tz }))
          const m  = parseInt(dt.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: SESSION.tz }))
          return h * 60 + m < cashOpenMins
        }))

      if (preBars.length < 30) continue

      // Same pipeline as analyzeSymbol (no look-ahead)
      const atrArr   = computeATR(preBars)
      const atr      = atrArr.at(-1) || 1
      const vwapArr  = computeVWAP(preBars)
      const vwap     = vwapArr.at(-1)
      const rsiArr   = computeRSI(preBars)
      const rsi      = rsiArr.at(-1) ?? null
      const { adx, plusDI, minusDI } = computeADX(preBars)
      const slopeShort  = rollingSlope(preBars, 10).at(-1) ?? 0
      const slopeMedium = rollingSlope(preBars, 24).at(-1) ?? 0
      const reg  = regressionRange(preBars, atr)
      const on   = overnightRange(preBars, date)
      const price = preBars.at(-1).close
      const mo    = computeMomentumScore(preBars, vwapArr, atrArr, rsiArr)

      const macro    = computeMacroBias({ regTrend: reg.trend, adx, plusDI, minusDI, price, vwap, onHigh: on.high, onLow: on.low, slopeMedium })
      // ORB is NEUTRAL at signal time: the 9:30 bar hasn't closed yet
      const micro    = computeMicroBias({ moDir: mo.direction, moIntensity: mo.signalIntensity, orbSignal: 'NEUTRAL', rsi, price, vwap, slopeShort })
      const conflict = conflictAnalysis({ macroDir: macro.direction, macroScore: macro.score, microDir: micro.direction, microScore: micro.score, adx })

      let predicted
      if (conflict.level === 'TRUE CONFLICT') { conflictDays++; continue }
      else if (conflict.level === 'MICRO DOMINATES') predicted = micro.direction
      else predicted = macro.direction

      results.push({
        date, predicted, actual,
        correct:  predicted === actual,
        movePct:  Math.round(movePct * 1000) / 1000,
        open: openP, close: closeP,
      })
    } catch (_) { continue }
  }

  if (results.length === 0) return { error: 'not enough data', accuracy: null, ci: null, last10: [] }

  const n       = results.length
  const correct = results.filter(r => r.correct).length
  const accuracy  = Math.round(correct / n * 1000) / 10
  const ci        = binomialCI95(correct, n)

  const strongDays = results.filter(r => r.movePct >= 0.1)
  const strongAcc  = strongDays.length ? Math.round(strongDays.filter(r => r.correct).length / strongDays.length * 1000) / 10 : null
  const bullDays   = results.filter(r => r.actual === 'BULLISH')
  const bearDays   = results.filter(r => r.actual === 'BEARISH')
  const bullAcc    = bullDays.length ? Math.round(bullDays.filter(r => r.correct).length / bullDays.length * 1000) / 10 : null
  const bearAcc    = bearDays.length ? Math.round(bearDays.filter(r => r.correct).length / bearDays.length * 1000) / 10 : null

  let streak = 0
  for (let i = n - 1; i >= 0; i--) {
    if (results[i].correct) streak++; else break
  }

  return {
    totalDays: n, correct, accuracy, ci,
    strongAcc, bullAcc, bearAcc, streak,
    noiseDays, conflictDays,
    avgMove:   Math.round(results.reduce((a, r) => a + r.movePct, 0) / n * 100) / 100,
    last10:    results.slice(-10),
    note:      'Data limit: ~60 calendar days (Yahoo Finance 30-min). Evaluation: 9:30–11:30 ET open→close.',
  }
}

// ─── Main per-symbol analysis ──────────────────────────────────────────────
async function analyzeSymbol(name, symbol) {
  const [bars, daily] = await Promise.all([fetchBars(symbol), fetchDailyBars(symbol)])
  if (bars.length < 50) throw new Error(`Not enough bars for ${symbol}: ${bars.length}`)

  const price = bars.at(-1).close
  const atrArr = computeATR(bars)
  const atr = atrArr.at(-1) || 1
  const vwapArr = computeVWAP(bars)
  const vwap = vwapArr.at(-1)
  const rsiArr = computeRSI(bars)
  const rsi = rsiArr.at(-1) || 50
  const { adx, plusDI, minusDI } = computeADX(bars)
  const slopeShort = rollingSlope(bars, 10).at(-1) || 0
  const slopeMedium = rollingSlope(bars, 24).at(-1) || 0
  const reg = regressionRange(bars, atr)
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: SESSION.tz })
  const on = overnightRange(bars, todayET)
  const orb = openingRange(bars, atr)
  const prev = daily.at(-2) || daily.at(-1)
  const gap = Math.round((bars[0].open - prev.close) * 100) / 100
  const gapPct = Math.round(gap / prev.close * 10000) / 100
  const buf = (prev.high - prev.low) * 0.001
  const sweep = price > prev.high + buf ? 'HIGH SWEEP' : price < prev.low - buf ? 'LOW SWEEP' : 'NONE'
  const dayType = classifyDayType({ onHigh: on.high, onLow: on.low, atr, adx, prevHigh: prev.high, prevLow: prev.low })
  const mo = computeMomentumScore(bars, vwapArr, atrArr, rsiArr)
  const macro = computeMacroBias({ regTrend: reg.trend, adx, plusDI, minusDI, price, vwap, onHigh: on.high, onLow: on.low, slopeMedium })
  const micro = computeMicroBias({ moDir: mo.direction, moIntensity: mo.signalIntensity, orbSignal: orb.signal, rsi, price, vwap, slopeShort })
  const conflict = conflictAnalysis({ macroDir: macro.direction, macroScore: macro.score, microDir: micro.direction, microScore: micro.score, adx })
  const backtest = runBacktest(bars)
  const r = v => Math.round((v ?? 0) * 100) / 100

  return {
    name, symbol,
    price: r(price), atr: r(atr), vwap: r(vwap),
    vwapDistPct: vwap != null ? Math.round((price - vwap) / vwap * 10000) / 100 : null,
    rsi: Math.round(rsi * 10) / 10,
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(plusDI * 10) / 10, minusDI: Math.round(minusDI * 10) / 10,
    prevHigh: prev.high, prevLow: prev.low, prevClose: prev.close,
    gap, gapPct, sweep,
    overnightHigh: r(on.high), overnightLow: r(on.low), overnightBars: on.bars,
    probHigh: reg.high, probLow: reg.low, regTrend: reg.trend, trendStrength: reg.strength,
    slopeShort, slopeMedium,
    dayType: dayType.type, dayProb: dayType.prob, dayScores: dayType.scores,
    orb: { high: orb.high, low: orb.low, range: orb.range, status: orb.status, signal: orb.signal, quality: orb.quality, qualityNote: orb.note, atrRatio: orb.ratio },
    momentum: { direction: mo.direction, signalIntensity: mo.signalIntensity, topFeature: mo.topFeature },
    macro: { direction: macro.direction, bullPct: macro.bullPct, score: macro.score },
    micro: { direction: micro.direction, bullPct: micro.bullPct, score: micro.score },
    conflict, backtest,
  }
}

// ─── Route handler ─────────────────────────────────────────────────────────
export async function GET() {
  try {
    const [nq, es] = await Promise.all([
      analyzeSymbol('NQ', SYMBOLS.NQ),
      analyzeSymbol('ES', SYMBOLS.ES),
    ])
    return Response.json({ status: 'ok', timestamp: new Date().toISOString(), data: { NQ: nq, ES: es } })
  } catch (err) {
    console.error('[/api/bias]', err)
    return Response.json({ status: 'error', message: String(err?.message ?? err) }, { status: 500 })
  }
}
