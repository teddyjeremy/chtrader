# Coin 1 and Coin 2 — adaptive holding and profit protection

## Coin 1
- Strict entry count: 1.
- Entry 10:43:14 EAT; exit 10:44:06 EAT.
- Maximum favourable movement: +1.89%; maximum adverse movement: −14.30%.
- All tested exits hit the initial hard stop; modeled net result −8.30%.
- Interpretation: entry-quality failure. Adaptive exits cannot rescue a move that never activates the profit trail.

## Coin 2
- Strict Coin 3-rule entries: 0 across 103 structural candidate seconds.
- A separate Candidate B from an earlier, different pre-entry gate was replayed only as an exploratory exit test.
- 20% trail: +69.07% modeled net after 77 seconds.
- 40% runner trail: +99.88% modeled net after 200 seconds at the migration boundary.
- The migration-boundary price is the last curve-bar proxy, not a verified executable fill. This is not a strict-entry win.

## Limitations
Historical paper estimates only; one-second OHLC, unknown intrasecond ordering, no exact $1 fills, and modeled fees/slippage. The sample is too small to establish universal parameters.
