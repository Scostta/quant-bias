# QuantBias

> Dashboard de bias cuantitativo para scalping de futuros **NQ** y **ES**  
> Ventana operativa: **14:30 – 16:30 hora España** (08:00 – 10:30 ET)

PWA instalable en móvil · Sin servidor local · Sin API key · Datos Yahoo Finance

---

## Cómo leerlo antes de las 14:30

Sigue siempre este orden de lectura:

```
1. ¿Hay riesgo de calendario?     → Si es EXTREME, no operas
2. ¿Qué dice el CONFLICT LEVEL?   → Es el veredicto principal
3. ¿Macro y micro coinciden?       → Si sí, más tamaño
4. ¿Dónde está el precio vs VWAP y niveles?  → Define la entrada
5. ¿Qué tipo de día es?            → Define si buscas breakout o fade
6. ¿Cómo está el backtest?         → Si la racha es positiva, más confianza
```

---

## 1. CONFLICT LEVEL

**Lo primero que miras.** Combina macro y micro en un veredicto accionable.

| Estado | Qué significa | Qué hacer |
|--------|---------------|-----------|
| `STRONG` | Ambas capas alineadas con fuerza | Operar en esa dirección con tamaño normal |
| `MODERATE` | Alineadas pero sin convicción alta | Esperar confirmación de entrada |
| `MACRO DOMINATES` | Estructura macro clara, micro va en contra | Ignorar micro, operar en dirección macro |
| `MICRO DOMINATES` | Momentum puntual contra la estructura | Se puede scalpar, stops muy ajustados |
| `TRUE CONFLICT` | Ambas capas opuestas con igual fuerza | **No operar** — esperar resolución |

---

## 2. MACRO BIAS — Tendencia de sesión

Analiza la estructura de fondo de las últimas ~24 horas.  
**Score de −9 a +9.** Por encima de +6 o por debajo de −6 es señal fuerte.

### REG — Regresión lineal (48 barras · ~24h)
Dirección de la tendencia predominante. `UP` o `DOWN`.  
Es la señal con **más peso** en el score macro. Si apunta arriba, la estructura de fondo es alcista.

### ADX — Fuerza de tendencia
Mide la **intensidad** del movimiento, sin importar la dirección. Siempre se lee junto a DI+/DI−.

| Valor | Interpretación |
|-------|----------------|
| < 20 | Mercado lateral — evitar breakouts |
| 20–25 | Tendencia débil |
| > 25 | Tendencia definida ✓ *(aparece en dorado)* |
| > 35 | Tendencia muy fuerte |

### DI+ / DI−
Indican la **dirección** del movimiento dominante. Lo que importa es la diferencia entre ambos:

- **DI+ > DI−** → movimiento dominante alcista
- **DI− > DI+** → movimiento dominante bajista

Un ADX > 25 con DI+ muy por encima de DI− es una de las señales más fiables del sistema.

### MED Slope — Pendiente media (24 barras · ~12h)
Visualizado como una barra: el centro es cero.  
Cuanto más a la derecha, más inclinada la tendencia al alza. Si MED Slope es positivo y ADX > 25, confirma tendencia alcista establecida en múltiples períodos.

---

## 3. MICRO BIAS — Señal de scalp

Analiza el momentum de las últimas horas.  
**Score de −9 a +9.**

### ML — Machine Learning
Modelo que analiza 5 features técnicos y produce una señal de dirección con porcentaje de confianza.

| Feature | Qué mide |
|---------|----------|
| `vwap_dist` | Distancia del precio al VWAP, normalizada por ATR |
| `ret3` | Retorno de las últimas 3 barras (~90 minutos) |
| `ret12` | Retorno de las últimas 12 barras (~6 horas) |
| `rsi_dev` | Cuánto se aleja el RSI del nivel neutro 50 |
| `price_pos` | Posición del precio dentro del rango de las últimas 16 barras |

El **ring** muestra la confianza: 50% = neutro, 80%+ = señal fuerte.  
El **TOP FEAT** indica cuál de los 5 factores está empujando más la señal ese día.

### ORB — Opening Range Breakout
Estado del precio respecto al rango de la primera barra de las 14:30.

| Calidad | Condición | Implicación |
|---------|-----------|-------------|
| `NORMAL` | Rango 0.25–1.5×ATR | Breakouts fiables, operar en dirección del breakout |
| `EXTENDED` | Rango > 1.5×ATR | Apertura muy volátil — mayor probabilidad de fade |
| `COMPRESSED` | Rango < 0.25×ATR | Rango estrecho — breakout explosivo probable |

El estado del precio puede ser `BREAKOUT UP`, `BREAKOUT DOWN` o `INSIDE RANGE`.

### SHORT Slope — Pendiente corta (10 barras · ~5h)
Igual que MED pero solo las últimas 5 horas. Captura el momentum más inmediato.  
Si SHORT y MED apuntan en la misma dirección, la tendencia es coherente en múltiples timeframes — señal más fiable.

### ACC — Confianza del ML

| Valor | Interpretación |
|-------|----------------|
| > 65% | Señal con peso real |
| 55–65% | Señal moderada |
| < 55% | Señal débil — no confiar mucho en el ML ese día |

---

## 4. INDICADORES

### ATR(14) — Average True Range
Cuánto mueve el instrumento normalmente en una barra de 30 minutos.  
Es la **unidad de medida** del sistema: todos los rangos y stops se expresan en múltiplos de ATR.

**Uso práctico:**
- Stop razonable = **0.5 – 1 × ATR** desde la entrada
- Si el precio se mueve más de 2×ATR desde apertura, está extendido — reducir expectativas

### RSI(14)

| Valor | Interpretación |
|-------|----------------|
| > 70 | Sobrecomprado — posibles fades |
| 55–70 | Momentum alcista |
| 45–55 | Zona neutral — sin señal del RSI |
| 30–45 | Momentum bajista |
| < 30 | Sobrevendido — posibles rebotes |

### VWAP — Volume Weighted Average Price
**El nivel más importante del análisis intradía.** Precio medio ponderado por volumen del día. Los institucionales tienen aquí su referencia principal.

- **Precio > VWAP** → compradores en control, buscar longs en pullbacks al VWAP
- **Precio < VWAP** → vendedores en control, buscar shorts en rebotes al VWAP
- Las reversiones al VWAP son de las operaciones más fiables de toda la sesión

### vs VWAP (%)
Distancia porcentual del precio al VWAP. Valores extremos = extensión, posible vuelta:

| Instrumento | Extensión moderada | Extensión fuerte |
|-------------|-------------------|------------------|
| NQ | ±0.3% | ±0.5% |
| ES | ±0.2% | ±0.4% |

### SWEEP — Barrido de liquidez
Si el precio ha tocado y superado el máximo o mínimo del día anterior:

- `HIGH SWEEP` → barrió el PDH. Si el precio revierte después, señal bajista fuerte (cazó stops de compradores)
- `LOW SWEEP` → barrió el PDL. Si revierte, señal alcista fuerte (cazó stops de vendedores)
- `NONE` → sin sweep, mercado dentro del rango previo

> Un sweep seguido de reversión es una de las mejores entradas del sistema. No busques la entrada en el momento del sweep, sino en la reversión confirmada.

---

## 5. NIVELES CLAVE

| Nivel | Descripción | Cómo usarlo |
|-------|-------------|-------------|
| **PRED HIGH** | Proyección estadística del máximo del día (regresión + ATR) | Zona de resistencia probable, frenar longs cerca |
| **PRED LOW** | Proyección estadística del mínimo del día | Zona de soporte probable, frenar shorts cerca |
| **PDH** | Previous Day High — máximo del día anterior | Resistencia clave. Romperlo con volumen = señal alcista |
| **PDL** | Previous Day Low — mínimo del día anterior | Soporte clave. Perderlo = señal bajista |
| **ONH** | Overnight High (18:00 ET – 08:29 ET) | Primera resistencia del día, ~22:00–14:29 España |
| **ONL** | Overnight Low (18:00 ET – 08:29 ET) | Primer soporte del día |
| **VWAP** | Precio medio ponderado del día | Nivel dinámico más importante, actúa como imán |

El **gráfico de niveles** los muestra todos a escala real: de un vistazo ves dónde está el precio en relación a todos simultáneamente y cuánto espacio hay hasta cada nivel.

---

## 6. TIPO DE DÍA

Clasifica la estructura más probable de la jornada. El **porcentaje** es la confianza del modelo. Define completamente cómo operar.

| Tipo | Comportamiento esperado | Estrategia |
|------|------------------------|------------|
| `TREND DAY` | El precio va en una dirección toda la sesión sin mirar atrás | Comprar pullbacks, **no** intentar fades contra la tendencia |
| `RANGE DAY` | Oscila entre máximo y mínimo bien definido | Comprar en soporte, vender en resistencia, tomar profits rápido |
| `NORMAL DAY` | Tendencia moderada con consolidaciones intermedias | La más frecuente. Combinar ambas estrategias según contexto |
| `REVERSAL DAY` | Abre con fuerza en una dirección y gira completamente | Cuidado con seguir la apertura. Esperar la vuelta confirmada |

---

## 7. BACKTEST

Muestra qué tan bien ha acertado el bias en los **últimos 30 días** en la ventana 14:30–16:30.

| Métrica | Descripción |
|---------|-------------|
| **ACCURACY** | % de días que la dirección predicha coincidió con la real |
| **STRONG** | Accuracy solo en días con movimiento > 0.1% (los días que importan) |
| **STREAK** | Racha actual de aciertos consecutivos |
| **AVG MOVE** | Movimiento medio diario en esa ventana |
| **BULL ACC** | Accuracy específico en días alcistas |
| **BEAR ACC** | Accuracy específico en días bajistas |

Los **puntos** al final muestran los últimos 10 días: 🟢 acertó dirección · 🔴 falló

**Cómo interpretar el accuracy:**
- **> 57%** sostenido → el modelo tiene edge estadístico real ese instrumento
- **50–57%** → edge marginal, operar con menos confianza en el bias
- **< 50% durante 2 semanas** → reducir el peso que le das al bot, el mercado está en régimen difícil

---

## 8. CALENDARIO ECONÓMICO

Eventos económicos americanos que coinciden con la ventana 14:30–16:30 (±30 minutos).

| Nivel | Eventos típicos | Qué hacer |
|-------|-----------------|-----------|
| `CLEAR` | Sin eventos relevantes | Operar con normalidad |
| `MEDIUM` | Datos secundarios, discursos menores | Reducir tamaño ligeramente |
| `HIGH` | IPC, empleo, ventas minoristas, PPI | Reducir tamaño, stops más amplios |
| `EXTREME` | NFP, FOMC, CPI principal, PIB | Considerar **no operar** ese día |

Los eventos aparecen en **hora España** con su nivel de impacto.

---

## Setup e instalación

### Desarrollo local
```bash
npm install
npm run dev
# → http://localhost:3000
```

### Deploy en Vercel
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TU_USUARIO/quant-bias.git
git push -u origin main
# → vercel.com → Add New Project → importar repo → Deploy
```

### Instalar como app en móvil
- **iPhone (Safari):** Botón compartir ↑ → "Añadir a pantalla de inicio"
- **Android (Chrome):** Menú ⋮ → "Añadir a pantalla de inicio"

### Cache y refresh
- Datos cacheados **15 minutos** automáticamente en Vercel
- **↻ REFRESH** fuerza recálculo inmediato (~10–20s)

---

## Estructura del proyecto

```
quant-bias/
  app/
    api/bias/route.js   ← API: descarga datos + análisis completo
    page.jsx            ← Dashboard PWA
    layout.jsx          ← PWA meta tags
    globals.css
  lib/
    indicators.js       ← ATR, VWAP, RSI, ADX, slopes, ML lightweight
    bias.js             ← Dual-layer macro/micro, conflict, ORB, backtest
  public/
    manifest.json       ← PWA manifest
```

---

## Notas importantes

- El bot **no es una señal automática**. Es una herramienta de contexto. Confirma siempre con price action antes de entrar.
- Los datos de **Yahoo Finance** pueden tener retrasos de 15 minutos en futuros. No uses el precio para timing exacto de entrada.
- El **backtest** es orientativo, no garantía de rendimiento futuro.