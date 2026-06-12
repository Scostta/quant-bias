// lib/indicators.js
// All technical indicators ported from Python bias_bot_v3

// Returns the Globex session key (YYYY-MM-DD of the session's start date in ET).
// A Globex session for NQ/ES starts at 18:00 ET: bars before 18:00 ET belong to
// the session that opened the previous calendar day at 18:00.
function getGlobexSessionKey(ts) {
  const dt = new Date(ts)
  const etHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).format(dt))
  if (etHour >= 18) {
    return dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  }
  // Before 18:00 ET → belongs to the session that started yesterday
  const [y, m, d] = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number)
  const prev = new Date(y, m - 1, d - 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
}

export function computeATR(bars, period = 14) {
  const tr = bars.map((b, i) => {
    if (i === 0) return b.high - b.low
    const prevClose = bars[i - 1].close
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose))
  })
  // Rolling mean
  return tr.map((_, i) => {
    if (i < period - 1) return null
    const slice = tr.slice(i - period + 1, i + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  })
}

// Session-anchored VWAP — resets at 18:00 ET (Globex open).
// Uses typical price (high+low+close)/3. Bars with null/zero volume are excluded;
// if an entire session has no real volume the VWAP stays null for those bars.
export function computeVWAP(bars) {
  const sessions = new Map()
  return bars.map(b => {
    if (!b.timestamp) return null
    const key = getGlobexSessionKey(b.timestamp)
    if (!sessions.has(key)) sessions.set(key, { cumTV: 0, cumV: 0 })
    const s = sessions.get(key)
    if (b.volume != null && b.volume > 0) {
      const typical = (b.high + b.low + b.close) / 3
      s.cumTV += typical * b.volume
      s.cumV  += b.volume
    }
    return s.cumV > 0 ? s.cumTV / s.cumV : null
  })
}

// RSI with Wilder's smoothing (RMA, alpha = 1/period).
// Seeded with the simple average of the first `period` up/down moves.
// Returns null for bars before the seed window completes.
export function computeRSI(bars, period = 14) {
  const closes = bars.map(b => b.close)
  const n = closes.length
  const result = new Array(n).fill(null)
  if (n <= period) return result

  const deltas = closes.map((c, i) => i === 0 ? 0 : c - closes[i - 1])

  // Seed: simple average of first `period` changes (indices 1..period)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    if (deltas[i] > 0) avgGain += deltas[i]
    else               avgLoss += Math.abs(deltas[i])
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss)

  // Wilder's RMA for subsequent bars
  for (let i = period + 1; i < n; i++) {
    const d    = deltas[i]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return result
}

// ADX with full Wilder smoothing (no simple-average shortcut).
// Wilder's smoothed TR, +DM, -DM seeded with the sum of the first `period`
// values; ADX seeded with simple mean of the first `period` DX values.
// Returns null for all three when there is insufficient data.
export function computeADX(bars, period = 14) {
  const n = bars.length
  const adxStart = period * 2 - 1  // first bar where ADX can be computed

  if (n < adxStart + 1) return { adx: null, plusDI: null, minusDI: null }

  const tr = [], plusDM = [], minusDM = []
  for (let i = 0; i < n; i++) {
    if (i === 0) { tr.push(bars[0].high - bars[0].low); plusDM.push(0); minusDM.push(0); continue }
    const up   = bars[i].high - bars[i - 1].high
    const down = bars[i - 1].low - bars[i].low
    tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)))
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
  }

  // Seed: sum of first `period` values (Wilder's initialisation, not average)
  let smTR  = tr.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let smPDM = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let smMDM = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0)

  const pDI = new Array(n).fill(null)
  const mDI = new Array(n).fill(null)
  const dxArr = new Array(n).fill(null)

  if (smTR > 0) {
    pDI[period] = 100 * smPDM / smTR
    mDI[period] = 100 * smMDM / smTR
    const s = pDI[period] + mDI[period]
    dxArr[period] = s === 0 ? 0 : 100 * Math.abs(pDI[period] - mDI[period]) / s
  }

  for (let i = period + 1; i < n; i++) {
    smTR  = smTR  - smTR  / period + tr[i]
    smPDM = smPDM - smPDM / period + plusDM[i]
    smMDM = smMDM - smMDM / period + minusDM[i]
    if (smTR > 0) {
      pDI[i] = 100 * smPDM / smTR
      mDI[i] = 100 * smMDM / smTR
      const s = pDI[i] + mDI[i]
      dxArr[i] = s === 0 ? 0 : 100 * Math.abs(pDI[i] - mDI[i]) / s
    }
  }

  // Seed ADX with the simple mean of DX from index `period` to `adxStart`
  const dxSeed = dxArr.slice(period, adxStart + 1).filter(v => v !== null)
  if (dxSeed.length === 0) return { adx: null, plusDI: pDI[n - 1], minusDI: mDI[n - 1] }

  let adx = dxSeed.reduce((a, b) => a + b, 0) / dxSeed.length
  for (let i = adxStart + 1; i < n; i++) {
    if (dxArr[i] !== null) adx = (adx * (period - 1) + dxArr[i]) / period
  }

  return { adx, plusDI: pDI[n - 1], minusDI: mDI[n - 1] }
}

export function rollingSlope(bars, window = 10) {
  const closes = bars.map(b => b.close)
  return closes.map((_, i) => {
    if (i < window) return null
    const y = closes.slice(i - window, i)
    const x = Array.from({ length: window }, (_, k) => k)
    const n = window
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((a, k) => a + k * y[k], 0)
    const sumX2 = x.reduce((a, k) => a + k * k, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    // Normalise to bps/bar
    return (slope / (closes[i] || 1)) * 10000
  })
}

export function regressionRange(bars, atrVal) {
  const n = Math.min(48, bars.length)
  const slice = bars.slice(-n)
  const y = slice.map(b => b.close)
  const x = Array.from({ length: n }, (_, i) => i)

  const sumX  = x.reduce((a, b) => a + b, 0)
  const sumY  = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((a, i) => a + i * y[i], 0)
  const sumX2 = x.reduce((a, i) => a + i * i, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  const residuals = y.map((yi, i) => yi - (slope * i + intercept))
  const stdRes = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n)
  const band   = Math.max(atrVal, stdRes * 1.5)
  const pred   = slope * n + intercept

  return {
    high:     Math.round((pred + band) * 100) / 100,
    low:      Math.round((pred - band) * 100) / 100,
    trend:    slope > 0 ? 'UP' : 'DOWN',
    strength: Math.round(Math.abs(slope) / (y[y.length - 1] || 1) * 10000 * 100) / 100,
    slopeMedium: null, // filled by caller
  }
}

// Momentum score — weighted logistic composite of 5 price/momentum features.
// NOT a trained ML model. "signalIntensity" is a raw 0-100 scale: 0 = no
// conviction, 100 = maximum conviction. Do NOT label this as ML or a model.
// Returns { direction, signalIntensity, topFeature }
export function computeMomentumScore(bars, vwapArr, atrArr, rsiArr) {
  const n = bars.length
  if (n < 30) return { direction: 'NEUTRAL', signalIntensity: 0, topFeature: 'insufficient data' }

  const close   = bars.map(b => b.close)
  const lastClose = close[n - 1]
  const lastVWAP  = vwapArr[n - 1]
  const lastATR   = atrArr[n - 1] || 1
  const lastRSI   = rsiArr[n - 1] || 50

  // Feature 1: VWAP distance normalised by ATR (0 if VWAP unavailable)
  const vwapDist = lastVWAP != null ? (lastClose - lastVWAP) / lastATR : 0

  // Feature 2: Short-term return (last 3 bars)
  const ret3  = (lastClose - close[n - 4]) / close[n - 4]

  // Feature 3: Medium-term return (last 12 bars)
  const ret12 = (lastClose - close[n - 13]) / close[n - 13]

  // Feature 4: RSI deviation from 50
  const rsiDev = (lastRSI - 50) / 50

  // Feature 5: Price position in 16-bar range
  const hi16 = Math.max(...bars.slice(-16).map(b => b.high))
  const lo16  = Math.min(...bars.slice(-16).map(b => b.low))
  const pricePos = (lo16 === hi16) ? 0.5 : (lastClose - lo16) / (hi16 - lo16) - 0.5

  // Weighted score (weights tuned empirically for short-term momentum)
  const score =
    vwapDist  * 2.5 +
    ret3      * 800 +
    ret12     * 400 +
    rsiDev    * 1.5 +
    pricePos  * 2.0

  // Sigmoid then normalise to 0-100 intensity (no artificial cap)
  const prob            = 1 / (1 + Math.exp(-score * 0.8))
  const direction       = prob >= 0.5 ? 'BULLISH' : 'BEARISH'
  const signalIntensity = Math.round(Math.abs(prob - 0.5) * 200)  // 0 = neutral, 100 = max

  const features = [
    { name: 'vwap_dist', val: Math.abs(vwapDist)  },
    { name: 'ret3',      val: Math.abs(ret3) * 100 },
    { name: 'ret12',     val: Math.abs(ret12) * 50 },
    { name: 'rsi_dev',   val: Math.abs(rsiDev)     },
    { name: 'price_pos', val: Math.abs(pricePos)   },
  ]
  const topFeature = features.sort((a, b) => b.val - a.val)[0].name

  return { direction, signalIntensity, topFeature }
}
