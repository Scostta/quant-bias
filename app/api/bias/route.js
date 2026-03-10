// app/api/bias/route.js
export const runtime = 'nodejs'
export const revalidate = 900

import {
  computeATR, computeVWAP, computeRSI, computeADX,
  rollingSlope, regressionRange, mlBiasLightweight
} from '../../../lib/indicators'
import {
  computeMacroBias, computeMicroBias, conflictAnalysis,
  classifyORB, classifyDayType, runBacktest
} from '../../../lib/bias'

const SYMBOLS = { NQ: 'NQ=F', ES: 'ES=F' }

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
    volume: q.volume ?? q.regularMarketVolume ?? 1,
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

// ─── Overnight 18:00–08:29 ET ──────────────────────────────────────────────
function overnightRange(bars) {
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const src = bars.filter(b => {
    const dt = new Date(b.timestamp)
    const dateET = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const hStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' })
    const h = parseInt(hStr)
    return (dateET < todayET && h >= 18) || (dateET === todayET && h < 8)
  })
  const use = src.length >= 2 ? src : bars.slice(-10)
  return { high: Math.max(...use.map(b => b.high)), low: Math.min(...use.map(b => b.low)), bars: use.length }
}

// ─── ORB first RTH bar ─────────────────────────────────────────────────────
function openingRange(bars, atr) {
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  let src = bars.filter(b => {
    const dt = new Date(b.timestamp)
    const dateET = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const h = parseInt(dt.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    const m = parseInt(dt.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: 'America/New_York' }))
    return dateET === todayET && h === 8 && m >= 30
  })
  if (!src.length) src = bars.filter(b => new Date(b.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayET).slice(0, 1)
  if (!src.length) return { high: null, low: null, quality: 'N/A', note: 'No ORB bars yet', signal: 'NEUTRAL', status: 'N/A', range: null, ratio: null }

  const high = Math.max(...src.map(b => b.high))
  const low = Math.min(...src.map(b => b.low))
  const price = bars.at(-1).close
  return { high, low, ...classifyORB({ orbHigh: high, orbLow: low, price, atr }) }
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
  const on = overnightRange(bars)
  const orb = openingRange(bars, atr)
  const prev = daily.at(-2) || daily.at(-1)
  const gap = Math.round((bars[0].open - prev.close) * 100) / 100
  const gapPct = Math.round(gap / prev.close * 10000) / 100
  const buf = (prev.high - prev.low) * 0.001
  const sweep = price > prev.high + buf ? 'HIGH SWEEP' : price < prev.low - buf ? 'LOW SWEEP' : 'NONE'
  const dayType = classifyDayType({ onHigh: on.high, onLow: on.low, atr, adx, prevHigh: prev.high, prevLow: prev.low })
  const ml = mlBiasLightweight(bars, vwapArr, atrArr, rsiArr)
  const macro = computeMacroBias({ regTrend: reg.trend, adx, plusDI, minusDI, price, vwap, onHigh: on.high, onLow: on.low, slopeMedium })
  const micro = computeMicroBias({ mlDir: ml.direction, mlConf: ml.confidence, orbSignal: orb.signal, rsi, price, vwap, slopeShort })
  const conflict = conflictAnalysis({ macroDir: macro.direction, macroScore: macro.score, microDir: micro.direction, microScore: micro.score, modelAcc: 55, adx })
  const backtest = runBacktest(bars)
  const r = v => Math.round((v ?? 0) * 100) / 100

  return {
    name, symbol,
    price: r(price), atr: r(atr), vwap: r(vwap),
    vwapDistPct: Math.round((price - vwap) / vwap * 10000) / 100,
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
    ml: { direction: ml.direction, confidence: ml.confidence, topFeature: ml.topFeature },
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
