# Coin 6 — full entry and adaptive exit validation

## Reconstruction
- Mint: `2NFDhipSmrn3GaU7UK6jPvYxbveBUvNs6ec71r2ipump`
- Quote asset: SOL
- Successful reconstructed curve trades: **4,192** (2,199 buys, 1,993 sells)
- Unique buyers/sellers/traders: 766 / 545 / 782
- Buy/sell quote flow: 780.539003 / 715.861250 SOL; net +64.677752 SOL
- Curve activity: 2026-11-10 07:38:44–08:01:36 EAT
- Failed candidate curve instructions: 3,624

## Entry rules
1. Prior 60-second impulse at least +20%.
2. Pullback 10–40% from the recent high.
3. Reclaim the preceding 5-second high by at least 1%.
4. Last 2 seconds buy quote greater than 3x sell quote.
5. At least 3 unique buyers; sellers no more than half buyers.
6. Largest buyer share no more than 72%.
7. Enter at next completed 1-second close, using a real executable quote in live execution.

Accepted strict signals: **1**. Rejected structural candidates: **156**. Sequential entries: **1**. No thresholds were relaxed to force trades.

## Exit configurations replayed on the same entry
- 5% hard stop.
- 60s, 180s and 300s holding ceilings with 20% trail.
- 180s and 300s 30% trail with optional 8-second weakness/distribution/structure exit.
- 300s wide 40% runner trail.
- Cost-aware 40% runner trail with gross floors: +5% at +10% peak, +15% at +50%, +40% at +100%, +80% at +200%.
- 180s staged tightening and combined runner/weakness/floor variant.

| Exit configuration | Modeled net | Hold | Result |
|---|---:|---:|---|
| 60s / 20% trail | −8.41% | 28s | Hard stop |
| 180s / 20% trail | −8.41% | 28s | Hard stop |
| 300s / 20% trail | −8.41% | 28s | Hard stop |
| 300s / 40% trail, no floor | −8.41% | 28s | Hard stop |
| 300s / 40% + progressive floors | **+1.36%** | 14s | +5% gross floor |

Signal details: +95.73% impulse, 12.04% pullback, 9.71x buy/sell quote ratio, 12 buyers, 4 sellers, 51.24% largest buyer share. Maximum favourable movement was +11.57%; maximum adverse movement was −5.12%.

## Interpretation
- The floor improved this one replay by exiting after a +10% peak rather than allowing a hard-stop loss.
- A 40% trail without a floor did not protect the small early gain.
- One trade is not enough to validate the rule across all tokens.
- The optional 8-second weakness exit did not trigger first.
- The exit price is a 1-second OHLC stop simulation, not a verified live fill.

## Costs and limitations
- Modeled Pump fee 1.25% and slippage 0.5% each side.
- Network fees, priority fees and tips excluded.
- One-second OHLC cannot resolve intrasecond ordering.
- Same-slot transaction ordering may be approximate.
- No actual $1 transaction was sent.
