# Coin 5 — Pump bonding-curve reconstruction

Mint: `Cg1g9zBvydiuvCuqiLy5XrmR2LXyU54FGUHhzGVApump`

## Market reconstruction
- Token: Unpredictable Coin (UNPC).
- Quote asset: PreStocks / POLYMARKET PreStocks, not SOL or a USD stablecoin.
- Curve window: 2026-11-10 09:00:57–09:15:21 EAT; PumpSwap migration at approximately 09:15:21.
- Reconstructed successful curve trades: 2,025 (1,112 buys, 913 sells).
- Unique buyers: 551; unique sellers: 386; traders: 564.
- Buy quote: 301.296206284 PreStocks; sell quote: 232.335645192; net quote flow: +68.960561092.
- First-to-last price multiple: 10.43x; max peak-to-trough drawdown: -63.63%.
- Identified creator sold 100% of its recorded allocation in three sells within about three seconds of creation. This is a strong creator-exit warning for this token.

## Strict-entry paper replay
Five sequential paper trades, one position at a time:
| Trade | Entry (EAT) | Exit (EAT) | Net return | Exit |
|---|---|---|---:|---|
| 1 | 09:02:27 | 09:02:28 | -10.81% | hard stop |
| 2 | 09:02:49 | 09:02:59 | -9.81% | hard stop |
| 3 | 09:03:02 | 09:03:51 | -11.85% | hard stop |
| 4 | 09:09:47 | 09:09:54 | -11.96% | hard stop |
| 5 | 09:10:12 | 09:11:12 | +28.19% | 60s time stop |

Starting equity $1.00; ending equity $0.8002049; net -19.98%; win rate 20%. Main replay includes an observed approximately 1% buy-side transfer haircut. Conservative 1% both-side haircut sensitivity ended at $0.7610 (-23.90%). Fees assumed 1.25% each side plus 0.5% slippage each side; network fees excluded.

## Interpretation
Strong 2-second buy flow alone was not enough: one setup had 34 buyers and no sellers but still hit the hard stop. Creator-exit detection, persistence across multiple windows, wallet concentration/turnover, and quote-asset-specific transfer costs should be evaluated as pre-entry vetoes.

## Files
- `coin5_1s_market_bars.csv`
- `coin5_paper_trades_1pct_buy_tax.csv`

## Limitations
One token, five trades, reconstructed 1-second OHLC and approximate stop fills. Quote-asset USD proxy was not exact at launch. No real orders or network costs were included. This is a negative historical test, not a live-performance claim.
