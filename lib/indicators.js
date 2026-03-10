// lib/indicators.js
// All technical indicators ported from Python bias_bot_v3

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

export function computeVWAP(bars) {
  let cumTV = 0, cumV = 0
  return bars.map(b => {
    cumTV += b.close * b.volume
    cumV  += b.volume
    return cumV > 0 ? cumTV / cumV : b.close
  })
}

export function computeRSI(bars, period = 14) {
  const closes = bars.map(b => b.close)
  const deltas = closes.map((c, i) => i === 0 ? 0 : c - closes[i - 1])

  return closes.map((_, i) => {
    if (i < period) return null
    const slice = deltas.slice(i - period + 1, i + 1)
    const gains = slice.filter(d => d > 0).reduce((a, b) => a + b, 0) / period
    const losses = slice.filter(d => d < 0).reduce((a, b) => a + Math.abs(b), 0) / period
    if (losses === 0) return 100
    const rs = gains / losses
    return 100 - (100 / (1 + rs))
  })
}

export function computeADX(bars, period = 14) {
  const atr = computeATR(bars, period)
  const plusDMs  = []
  const minusDMs = []

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { plusDMs.push(0); minusDMs.push(0); continue }
    const up   = bars[i].high - bars[i - 1].high
    const down = bars[i - 1].low - bars[i].low
    plusDMs.push(up > down && up > 0 ? up : 0)
    minusDMs.push(down > up && down > 0 ? down : 0)
  }

  const plusDI  = plusDMs.map((_, i) => {
    if (!atr[i] || i < period - 1) return null
    const avgPDM = plusDMs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    return 100 * avgPDM / atr[i]
  })
  const minusDI = minusDMs.map((_, i) => {
    if (!atr[i] || i < period - 1) return null
    const avgMDM = minusDMs.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    return 100 * avgMDM / atr[i]
  })
  const dx = plusDI.map((pdi, i) => {
    if (pdi === null || minusDI[i] === null) return null
    const sum = pdi + minusDI[i]
    return sum === 0 ? 0 : 100 * Math.abs(pdi - minusDI[i]) / sum
  })
  const adx = dx.map((_, i) => {
    if (i < period * 2 - 2) return null
    const slice = dx.slice(i - period + 1, i + 1).filter(v => v !== null)
    return slice.length === 0 ? null : slice.reduce((a, b) => a + b, 0) / slice.length
  })

  const last = bars.length - 1
  return {
    adx:     adx[last]     ?? 20,
    plusDI:  plusDI[last]  ?? 20,
    minusDI: minusDI[last] ?? 20,
  }
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

// Lightweight ML substitute: weighted logistic score
// Uses 5 features with historically meaningful weights
// Returns { direction, confidence, topFeature }
export function mlBiasLightweight(bars, vwapArr, atrArr, rsiArr) {
  const n = bars.length
  if (n < 30) return { direction: 'NEUTRAL', confidence: 50, topFeature: 'insufficient data' }

  const close   = bars.map(b => b.close)
  const lastClose = close[n - 1]
  const lastVWAP  = vwapArr[n - 1]
  const lastATR   = atrArr[n - 1] || 1
  const lastRSI   = rsiArr[n - 1] || 50

  // Feature 1: VWAP distance normalised by ATR
  const vwapDist = (lastClose - lastVWAP) / lastATR  // positive = above VWAP

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

  // Sigmoid to get probability
  const prob = 1 / (1 + Math.exp(-score * 0.8))
  const direction  = prob >= 0.5 ? 'BULLISH' : 'BEARISH'
  const confidence = Math.round(Math.max(0.5, Math.min(0.82, Math.abs(prob - 0.5) * 2 + 0.5)) * 100)

  const features = [
    { name: 'vwap_dist', val: Math.abs(vwapDist)  },
    { name: 'ret3',      val: Math.abs(ret3) * 100 },
    { name: 'ret12',     val: Math.abs(ret12) * 50 },
    { name: 'rsi_dev',   val: Math.abs(rsiDev)     },
    { name: 'price_pos', val: Math.abs(pricePos)   },
  ]
  const topFeature = features.sort((a, b) => b.val - a.val)[0].name

  return { direction, confidence, topFeature }
}
