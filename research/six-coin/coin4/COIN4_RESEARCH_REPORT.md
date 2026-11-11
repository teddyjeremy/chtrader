# Coin 4 — Pump bonding-curve reconstruction

Mint: `BYurrzk6JV3YaqwwVDAq7rvZC7mBGY1xCTE8PG5dpump`

## Market reconstruction
- Quote asset: AAPLx (Apple xStock), not SOL or a USD stablecoin.
- Curve window: 2026-11-10 09:58:05–10:08:09 EAT; PumpSwap pool creation at approximately 10:08:10.
- Reconstructed successful curve trades: 1,615 (1,035 buys, 580 sells).
- Unique buyers: 514; unique sellers: 259; traders: 521.
- Buy quote: 110.26154219 AAPLx; sell quote: 82.85832379 AAPLx; net quote flow: +27.40321840 AAPLx.
- First-to-last price multiple: 13.29x; maximum sequence drawdown: -19.86%.
- Creator sold its recorded initial allocation in two sells within 11 seconds. This is limited to the identified creator wallet and observed window.

## Entry-rule test
The strict Coin 3 entry rule generated 0 trades across 11 grouped structural episodes. This correctly left the $1 paper balance unchanged under the strict rule.

A relaxed 0.5% pivot-reclaim sensitivity produced one trade:
- Signal: 10:06:04 EAT; entry: 10:06:05; exit: 10:07:05.
- The setup reclaimed +0.8304%, below the strict +1% requirement.
- Estimated net return: +60.08%; MFE +85.70%; MAE -2.53%.
- This is a sensitivity result only and must not be represented as a strict-rule trade.

## Costs and caveats
Replay assumes 1.25% Pump fee and 0.5% slippage each side; network fees excluded. AAPLx USD proxy was $352.01 and is not an exact launch-time executable conversion. Reserve reconstruction was fitted from cumulative curve ATA deltas rather than direct historical bonding-curve snapshots. The relaxed result is one trade and is not statistically meaningful.

## Files
- `coin4_1s_market_bars.csv`
- `coin4_relaxed_pivot_sensitivity_trade.csv`

This is historical paper research only, not evidence of live profitability.
