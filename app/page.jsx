'use client'
import { useState, useEffect, useCallback } from 'react'

// ─── helpers ───────────────────────────────────────────────────────────────
const cc = v => {
  if (v === 'BULLISH' || v === 'UP' || v === 'BREAKOUT UP') return '#00e5a0'
  if (v === 'BEARISH' || v === 'DOWN' || v === 'BREAKOUT DOWN') return '#ff4d7a'
  if (typeof v === 'number') return v >= 0 ? '#00e5a0' : '#ff4d7a'
  return '#e0eaf2'
}
const fmt = (n, d = 2) => n != null ? Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
const fmtAge = s => s < 60 ? `hace ${s}s` : `hace ${Math.floor(s / 60)}m`

// Spain = Europe/Madrid  (CET/CEST automático)
const SPAIN_TZ = 'Europe/Madrid'
const ET_TZ = 'America/New_York'

const LEVEL_STYLE = {
  'STRONG': { color: '#00e5a0', bg: 'rgba(0,229,160,.1)', border: 'rgba(0,229,160,.4)' },
  'MODERATE': { color: '#38c6ff', bg: 'rgba(56,198,255,.1)', border: 'rgba(56,198,255,.4)' },
  'MACRO DOMINATES': { color: '#ffd166', bg: 'rgba(255,209,102,.1)', border: 'rgba(255,209,102,.4)' },
  'MICRO DOMINATES': { color: '#ffab40', bg: 'rgba(255,171,64,.1)', border: 'rgba(255,171,64,.4)' },
  'TRUE CONFLICT': { color: '#ff4d7a', bg: 'rgba(255,77,122,.1)', border: 'rgba(255,77,122,.4)' },
}
const CAL_STYLE = {
  'CLEAR': { color: '#00e5a0', border: 'rgba(0,229,160,.3)', bg: 'rgba(0,229,160,.04)' },
  'MEDIUM': { color: '#38c6ff', border: 'rgba(56,198,255,.3)', bg: 'rgba(56,198,255,.04)' },
  'HIGH': { color: '#ffab40', border: 'rgba(255,171,64,.3)', bg: 'rgba(255,171,64,.07)' },
  'EXTREME': { color: '#ff4d7a', border: 'rgba(255,77,122,.5)', bg: 'rgba(255,77,122,.08)' },
}

// ─── atoms ─────────────────────────────────────────────────────────────────
function Row({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.05)'
    }}>
      <span style={{ color: '#6b8599', fontSize: 11 }}>{label}</span>
      <span style={{ color: color || '#e0eaf2', fontSize: 12, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Sec({ title, children, noPad }) {
  return (
    <div style={{ padding: noPad ? '12px 0 0' : '14px 20px', borderBottom: '1px solid #162130' }}>
      {title && <div style={{
        fontSize: 9, letterSpacing: 2.5, color: '#4a6e85', marginBottom: 10,
        textTransform: 'uppercase'
      }}>{title}</div>}
      {children}
    </div>
  )
}

function SlopeBar({ label, value }) {
  const v = value || 0
  const pct = Math.min(Math.abs(v) / 3 * 50, 50)
  const col = v >= 0 ? '#00e5a0' : '#ff4d7a'
  // truncate display value to avoid overflow
  const display = v.toFixed ? v.toFixed(2) : v
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: '#4a6e85', width: 42, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: '#162130', position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 7, background: '#4a6e85' }} />
        <div style={{
          position: 'absolute', top: 0, height: '100%', background: col,
          left: v >= 0 ? '50%' : `${50 - pct}%`, width: `${pct}%`
        }} />
      </div>
      <span style={{ fontSize: 10, color: col, width: 44, textAlign: 'right', flexShrink: 0 }}>
        {v >= 0 ? '+' : ''}{display}
      </span>
    </div>
  )
}

function MLRing({ conf, direction }) {
  const circ = 2 * Math.PI * 22
  const col = direction === 'BULLISH' ? '#00e5a0' : '#ff4d7a'
  return (
    <div style={{ position: 'relative', width: 58, height: 58, flexShrink: 0 }}>
      <svg width="58" height="58" viewBox="0 0 58 58" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="29" cy="29" r="22" fill="none" stroke="#162130" strokeWidth="5" />
        <circle cx="29" cy="29" r="22" fill="none" stroke={col} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={`${conf / 100 * circ} ${circ}`} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: col, fontSize: 13, fontWeight: 700
      }}>{conf}%</div>
    </div>
  )
}

function StatBox({ value, label, color }) {
  return (
    <div style={{
      textAlign: 'center', padding: '10px 6px',
      background: 'rgba(255,255,255,.02)', border: '1px solid #162130'
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || '#e0eaf2', marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 9, color: '#4a6e85', letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

function LevelsViz({ d }) {
  const levels = [
    { p: d.probHigh, lbl: 'PRED HI', col: '#38c6ff' },
    { p: d.prevHigh, lbl: 'PDH', col: '#ffd166' },
    { p: d.overnightHigh, lbl: 'ONH', col: '#8aa8bf' },
    { p: d.price, lbl: '● PRICE', col: '#fff', bold: true },
    { p: d.vwap, lbl: 'VWAP', col: '#00e5a0' },
    { p: d.overnightLow, lbl: 'ONL', col: '#8aa8bf' },
    { p: d.prevLow, lbl: 'PDL', col: '#ffd166' },
    { p: d.probLow, lbl: 'PRED LO', col: '#38c6ff' },
  ].filter(x => x.p != null).sort((a, b) => b.p - a.p)
  const mx = Math.max(...levels.map(x => x.p))
  const mn = Math.min(...levels.map(x => x.p))
  const rng = mx - mn || 1
  return (
    <div style={{
      position: 'relative', height: 120, background: 'rgba(0,0,0,.25)',
      border: '1px solid #162130', marginTop: 10, overflow: 'hidden'
    }}>
      {levels.map(x => {
        const top = 100 - ((x.p - mn) / rng * 86 + 7)
        return (
          <div key={x.lbl} style={{
            position: 'absolute', left: 0, right: 0, top: `${top}%`,
            height: x.bold ? 2 : 1, background: x.col, opacity: x.bold ? 1 : .6
          }}>
            <span style={{
              position: 'absolute', left: 5, fontSize: 9, color: x.col,
              transform: 'translateY(-50%)', fontWeight: x.bold ? 700 : 400, whiteSpace: 'nowrap'
            }}>
              {x.p?.toLocaleString('es-ES')}
            </span>
            <span style={{
              position: 'absolute', right: 5, fontSize: 9, color: x.col,
              transform: 'translateY(-50%)', fontWeight: x.bold ? 700 : 400
            }}>
              {x.lbl}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BacktestPanel({ bt }) {
  if (!bt || bt.error || !bt.accuracy) return (
    <Sec title="◈ BACKTEST 14:30–16:30 ES">
      <div style={{ color: '#ffab40', fontSize: 11, padding: '4px 0' }}>⚠ {bt?.error || 'Sin datos'}</div>
    </Sec>
  )
  const ac = bt.accuracy >= 55 ? '#00e5a0' : bt.accuracy >= 50 ? '#ffab40' : '#ff4d7a'
  return (
    <Sec title={`◈ BACKTEST 14:30–16:30 ES (${bt.totalDays}d)`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
        <StatBox value={`${bt.accuracy}%`} label="ACCURACY" color={ac} />
        <StatBox value={bt.strongAcc ? `${bt.strongAcc}%` : '—'} label="STRONG" color={ac} />
        <StatBox value={bt.streak || 0} label="STREAK" color='#ffd166' />
        <StatBox value={`${bt.avgMove || '—'}%`} label="AVG MOVE" />
      </div>
      <Row label="BULL ACC" value={bt.bullAcc ? `${bt.bullAcc}%` : '—'}
        color={bt.bullAcc >= 55 ? '#00e5a0' : '#ffab40'} />
      <Row label="BEAR ACC" value={bt.bearAcc ? `${bt.bearAcc}%` : '—'}
        color={bt.bearAcc >= 55 ? '#00e5a0' : '#ffab40'} />
      <div style={{ marginTop: 10 }}>
        {(bt.last10 || []).slice().reverse().map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.04)'
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: r.correct ? '#00e5a0' : '#ff4d7a'
            }} />
            <span style={{ color: '#6b8599', width: 52, fontSize: 10 }}>{String(r.date).slice(5)}</span>
            <span style={{ width: 50, fontWeight: 700, color: cc(r.predicted), fontSize: 11 }}>
              {r.predicted?.slice(0, 4)}
            </span>
            <span style={{ color: r.actual === r.predicted ? '#6b8599' : '#ff4d7a', fontSize: 10 }}>
              →{r.actual?.slice(0, 4)}
            </span>
            <span style={{ marginLeft: 'auto', color: '#6b8599', fontSize: 10 }}>{r.movePct}%</span>
          </div>
        ))}
      </div>
    </Sec>
  )
}

// ─── Symbol page — full content ─────────────────────────────────────────────
function SymbolPage({ d }) {
  if (!d) return null
  const c = d.conflict || {}
  const lvl = LEVEL_STYLE[c.level] || LEVEL_STYLE['MODERATE']
  const mac = d.macro || {}
  const mic = d.micro || {}
  const ml = d.ml || {}
  const orb = d.orb || {}
  const bt = d.backtest
  const macCol = mac.direction === 'BULLISH' ? '#00e5a0' : '#ff4d7a'
  const micCol = mic.direction === 'BULLISH' ? '#00e5a0' : '#ff4d7a'
  const ORB_Q = { NORMAL: '#00e5a0', EXTENDED: '#ffab40', COMPRESSED: '#c084fc' }

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* ── ASSESSMENT ── */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #162130' }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: '#38c6ff', marginBottom: 4 }}>
          {d.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: cc(d.gap), letterSpacing: 1 }}>
            {d.price?.toLocaleString('es-ES')}
          </span>
          <span style={{ fontSize: 11, color: '#8aa8bf' }}>
            GAP {d.gap >= 0 ? '+' : ''}{d.gap} ({d.gapPct >= 0 ? '+' : ''}{d.gapPct}%)
          </span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 2,
            padding: '4px 12px', border: `1px solid ${lvl.border}`,
            background: lvl.bg, color: lvl.color
          }}>{c.level}</span>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: .5, marginBottom: 5,
          color: c.hasConflict ? '#ffab40' : '#00e5a0'
        }}>
          › {c.action}
        </div>
        <div style={{ fontSize: 11, color: '#8aa8bf', lineHeight: 1.7 }}>{c.message}</div>
      </div>

      {/* ── DUAL LAYER ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
        background: '#162130', borderBottom: '1px solid #162130'
      }}>
        {[
          {
            title: '◈ MACRO (sesión)', dir: mac.direction, pct: mac.bullPct, score: mac.score, col: macCol,
            rows: [['REG', d.regTrend, cc(d.regTrend)], ['ADX', d.adx, d.adx > 25 ? '#ffd166' : '#e0eaf2'], ['DI+/−', null]],
            slope: ['MED', d.slopeMedium]
          },
          {
            title: '◈ MICRO (scalp)', dir: mic.direction, pct: mic.bullPct, score: mic.score, col: micCol,
            rows: [['ML', ml.direction, cc(ml.direction)], ['ORB', orb.status?.replace('BREAKOUT ', 'B.'), cc(orb.signal)],
            ['ACC', `${ml.confidence}%`, ml.confidence > 60 ? '#00e5a0' : '#ffab40']],
            slope: ['SHORT', d.slopeShort]
          },
        ].map(layer => (
          <div key={layer.title} style={{ background: '#0b1620', padding: '14px 16px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2.5, color: '#4a6e85', marginBottom: 8 }}>{layer.title}</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: layer.col, marginBottom: 6 }}>
              {layer.dir}
            </div>
            <div style={{ height: 4, background: 'rgba(255,77,122,.15)', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${layer.pct}%`, background: layer.col, transition: 'width .8s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#6b8599', marginBottom: 10 }}>
              {layer.pct}% bull · {layer.score >= 0 ? '+' : ''}{typeof layer.score === 'number' ? Math.round(layer.score) : layer.score}
            </div>
            <SlopeBar label={layer.slope[0]} value={layer.slope[1]} />
            {layer.rows.map(([lbl, val, col]) =>
              lbl === 'DI+/−'
                ? <div key="di" style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.05)'
                }}>
                  <span style={{ color: '#6b8599', fontSize: 11 }}>DI+/−</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: '#00e5a0' }}>{d.plusDI}</span>
                    <span style={{ color: '#4a6e85' }}>/</span>
                    <span style={{ color: '#ff4d7a' }}>{d.minusDI}</span>
                  </span>
                </div>
                : <Row key={lbl} label={lbl} value={val} color={col} />
            )}
          </div>
        ))}
      </div>

      {/* ── DESKTOP: 2-col grid below dual layer ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>

        {/* LEFT col */}
        <div>
          {/* ML */}
          <Sec title="◈ ML MODEL">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <MLRing conf={ml.confidence} direction={ml.direction} />
              <div style={{ flex: 1 }}>
                <Row label="SEÑAL" value={ml.direction} color={cc(ml.direction)} />
                <Row label="TOP FEAT" value={ml.topFeature} color='#38c6ff' />
              </div>
            </div>
          </Sec>

          {/* DAY TYPE */}
          <Sec title="◈ TIPO DE DÍA">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: '#38c6ff', fontWeight: 700, fontSize: 14 }}>{d.dayType}</span>
              <span style={{ color: '#ffd166', fontWeight: 700, fontSize: 14 }}>{d.dayProb}%</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(d.dayScores || {}).map(([t, s]) => (
                <div key={t} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 8px', background: 'rgba(255,255,255,.02)', border: '1px solid #162130'
                }}>
                  <span style={{ fontSize: 10, color: t === d.dayType ? '#38c6ff' : '#6b8599' }}>
                    {t.replace(' DAY', '')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: t === d.dayType ? '#38c6ff' : '#e0eaf2' }}>{s}%</span>
                    <div style={{ width: 40, height: 3, background: '#162130', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${s}%`,
                        background: t === d.dayType ? '#38c6ff' : '#4a6e85'
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Sec>

          {/* ORB */}
          <Sec title="◈ OPENING RANGE BREAKOUT">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                padding: '2px 10px', fontSize: 10, letterSpacing: 1,
                border: `1px solid ${(ORB_Q[orb.quality] || '#4a6e85')}40`,
                color: ORB_Q[orb.quality] || '#4a6e85'
              }}>{orb.quality} ORB</span>
              <span style={{ fontSize: 10, color: '#6b8599' }}>{orb.qualityNote}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { v: orb.high?.toLocaleString('es-ES') || '—', l: 'ORB HIGH', c: '#00e5a0' },
                { v: orb.low?.toLocaleString('es-ES') || '—', l: 'ORB LOW', c: '#ff4d7a' },
                { v: orb.range || '—', l: 'RANGO pts', c: '#38c6ff' },
                { v: orb.status || '—', l: `${orb.atrRatio || '?'}×ATR`, c: cc(orb.signal) },
              ].map(x => <StatBox key={x.l} value={x.v} label={x.l} color={x.c} />)}
            </div>
          </Sec>
        </div>

        {/* RIGHT col */}
        <div>
          {/* INDICATORS */}
          <Sec title="◈ INDICADORES">
            <Row label="ATR(14)" value={d.atr} color='#38c6ff' />
            <Row label="RSI(14)" value={d.rsi} color={d.rsi > 70 ? '#ff4d7a' : d.rsi < 30 ? '#00e5a0' : '#e0eaf2'} />
            <Row label="VWAP" value={fmt(d.vwap)} />
            <Row label="vs VWAP" value={`${d.vwapDistPct >= 0 ? '+' : ''}${d.vwapDistPct}%`} color={cc(d.vwapDistPct)} />
            <Row label="ADX" value={d.adx} color={d.adx > 25 ? '#ffd166' : '#e0eaf2'} />
            <Row label="SWEEP" value={d.sweep}
              color={d.sweep !== 'NONE' ? (d.sweep?.includes('HIGH') ? '#ff4d7a' : '#00e5a0') : '#8aa8bf'} />
          </Sec>

          {/* KEY LEVELS */}
          <Sec title="◈ NIVELES CLAVE">
            <Row label="PRED HIGH" value={fmt(d.probHigh)} color='#38c6ff' />
            <Row label="PDH" value={fmt(d.prevHigh)} color='#ffd166' />
            <Row label="ON HIGH" value={`${fmt(d.overnightHigh)} (${d.overnightBars}b)`} color='#8aa8bf' />
            <Row label="VWAP" value={fmt(d.vwap)} color='#00e5a0' />
            <Row label="ON LOW" value={fmt(d.overnightLow)} color='#8aa8bf' />
            <Row label="PDL" value={fmt(d.prevLow)} color='#ffd166' />
            <Row label="PRED LOW" value={fmt(d.probLow)} color='#38c6ff' />
            <LevelsViz d={d} />
          </Sec>
        </div>
      </div>

      {/* BACKTEST — full width */}
      <BacktestPanel bt={bt} />
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function Page() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null, age: 0, ts: null })
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(false)

  // ── Reloj en hora española ──
  const [clock, setClock] = useState({ es: '', et: '' })
  useEffect(() => {
    const tick = () => {
      const es = new Intl.DateTimeFormat('es-ES', {
        timeZone: SPAIN_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date())
      const et = new Intl.DateTimeFormat('en-US', {
        timeZone: ET_TZ, hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date())
      setClock({ es, et })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Age counter ──
  useEffect(() => {
    if (!state.ts) return
    const id = setInterval(() =>
      setState(s => ({ ...s, age: Math.round((Date.now() - new Date(s.ts).getTime()) / 1000) }))
      , 1000)
    return () => clearInterval(id)
  }, [state.ts])

  const fetchData = useCallback(async (force = false) => {
    if (force) setLoading(true)
    try {
      const resp = await fetch(force ? '/api/bias?force=1' : '/api/bias', {
        cache: force ? 'no-store' : 'default'
      })
      const json = await resp.json()
      if (json.status === 'ok') {
        setState({ status: 'ok', data: json.data, error: null, age: 0, ts: json.timestamp || new Date().toISOString() })
      } else {
        setState(s => ({ ...s, status: 'error', error: json.message || 'Error desconocido' }))
      }
    } catch (e) {
      setState(s => ({ ...s, status: 'error', error: e.message }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(false) }, [fetchData])
  useEffect(() => {
    const id = setInterval(() => fetchData(false), 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  const syms = state.data ? Object.keys(state.data) : []
  const calData = state.data?.[syms[0]]?.calendar
  const calSt = CAL_STYLE[calData?.riskLevel] || CAL_STYLE['CLEAR']

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
        body { background: #050d15; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #050d15; }
        ::-webkit-scrollbar-thumb { background: #1a3048; border-radius: 2px; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', fontFamily: "'Courier New', monospace" }}>

        {/* ── HEADER ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 100, background: '#050d15',
          borderBottom: '1px solid #162130', padding: '10px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3 }}>
            <span style={{ color: '#38c6ff' }}>QUANT</span>
            <span style={{ color: '#e0eaf2' }}>BIAS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Clocks */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#e0eaf2', fontWeight: 700, letterSpacing: 1 }}>
                🇪🇸 {clock.es}
              </div>
              <div style={{ fontSize: 10, color: '#4a6e85' }}>ET {clock.et}</div>
              {state.ts && <div style={{ fontSize: 10, color: '#4a6e85' }}>{fmtAge(state.age)}</div>}
            </div>
            <button onClick={() => fetchData(true)} disabled={loading}
              style={{
                background: loading ? 'rgba(56,198,255,.05)' : 'transparent',
                border: '1px solid #2a4a62', color: loading ? '#38c6ff' : '#6b8599',
                padding: '6px 16px', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1,
                cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap'
              }}>
              {loading ? '...' : '↻ REFRESH'}
            </button>
          </div>
        </div>

        {/* ── CALENDAR BANNER ── */}
        {calData && (
          <div style={{
            padding: '10px 20px', borderBottom: `2px solid ${calSt.border}`,
            background: calSt.bg, display: 'flex', alignItems: 'flex-start', gap: 14
          }}>
            <div style={{
              fontSize: 12, fontWeight: 800, letterSpacing: 2, color: calSt.color,
              padding: '3px 10px', border: `1px solid ${calSt.border}`, flexShrink: 0
            }}>
              📅 {calData.riskLevel}
            </div>
            <div style={{ flex: 1, fontSize: 11, lineHeight: 1.7, color: '#8aa8bf' }}>
              {calData.warnings?.length
                ? calData.warnings.map((w, i) => (
                  <span key={i} style={{ marginRight: 16 }}>
                    <span style={{ color: w.impact === 'HIGH' ? '#ffab40' : '#38c6ff' }}>[{w.impact}]</span>
                    {' '}{w.time} — {w.event}
                  </span>
                ))
                : 'Sin eventos en la ventana 14:30–16:30 (hora España)'
              }
              {calData.shouldAvoid && (
                <span style={{ color: '#ff4d7a', fontWeight: 700, marginLeft: 12 }}>
                  ⛔ RIESGO EXTREMO
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {state.status === 'loading' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '60vh', gap: 18
          }}>
            <div style={{
              width: 44, height: 44, border: '3px solid #162130',
              borderTopColor: '#38c6ff', borderRadius: '50%', animation: 'spin 1s linear infinite'
            }} />
            <div style={{ fontSize: 11, letterSpacing: 2.5, color: '#4a6e85', textAlign: 'center', lineHeight: 2 }}>
              CONECTANDO<br />ANALIZANDO MERCADO...
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {state.status === 'error' && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: .3 }}>⚠</div>
            <div style={{ color: '#ffab40', fontSize: 13, letterSpacing: 1, marginBottom: 10 }}>ERROR</div>
            <div style={{ fontSize: 12, color: '#6b8599', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' }}>
              {state.error}
            </div>
            <button onClick={() => fetchData(true)}
              style={{
                marginTop: 20, background: 'transparent', border: '1px solid #2a4a62',
                color: '#38c6ff', padding: '8px 20px', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer'
              }}>
              REINTENTAR
            </button>
          </div>
        )}

        {/* ── TABS + CONTENT ── */}
        {state.status === 'ok' && state.data && (
          <>
            {/* Tab bar */}
            <div style={{
              display: 'flex', borderBottom: '1px solid #162130',
              background: '#050d15', position: 'sticky', top: 57, zIndex: 99
            }}>
              {syms.map((s, i) => (
                <div key={s} onClick={() => setTab(i)}
                  style={{
                    padding: '11px 32px', fontSize: 12, letterSpacing: 2.5, cursor: 'pointer',
                    color: tab === i ? '#38c6ff' : '#4a6e85',
                    borderBottom: `2px solid ${tab === i ? '#38c6ff' : 'transparent'}`,
                    transition: 'all .2s', userSelect: 'none'
                  }}>
                  {s}
                  {/* mini bias badge */}
                  {state.data[s] && (
                    <span style={{
                      marginLeft: 10, fontSize: 9, padding: '1px 6px',
                      background: state.data[s].macro?.direction === 'BULLISH' ? 'rgba(0,229,160,.12)' : 'rgba(255,77,122,.12)',
                      color: state.data[s].macro?.direction === 'BULLISH' ? '#00e5a0' : '#ff4d7a',
                      border: `1px solid ${state.data[s].macro?.direction === 'BULLISH' ? 'rgba(0,229,160,.3)' : 'rgba(255,77,122,.3)'}`
                    }}>
                      {state.data[s].macro?.direction?.slice(0, 4)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <SymbolPage d={state.data[syms[tab]]} />
          </>
        )}
      </div>
    </>
  )
}
