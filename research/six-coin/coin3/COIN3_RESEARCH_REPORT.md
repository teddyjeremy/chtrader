# Coin 3 — Pump bonding-curve reconstruction

Mint: `6r7D6ab6agnc5VcJxApia4HqbRikAeAEus2UYF9hpump`

## Market reconstruction
- Captured curve window: 2026-11-10 09:41:10–09:46:50 EAT; migration followed shortly after.
- Reconstructed direct curve trades: 315 (176 buys, 139 sells).
- Unique buyers: 75; unique sellers: 54; total traders: 76.
- Buy quote: 123.3385 SOL; sell quote: 96.1631 SOL; net quote flow: +27.1754 SOL.
- Creator: `8AcZBvDXSwayFvAy8sb5ZD3PwqVHbnwNb2F3Fp2pdQmt`. Initial buy approximately 2.964456 SOL for 96.45m tokens. No direct curve sell detected in the captured window; this does not rule out other creator wallets or later sales.

## Strict-rule paper replay
Two entries qualified:
| Entry | Signal (EAT) | Entry (EAT) | Exit (EAT) | Gross | Estimated net |
|---|---|---|---|---:|---:|
| 1 | 09:41:34 | 09:41:38 | 09:42:41 | +22.71% | +18.49% |
| 2 | 09:43:12 | 09:43:13 | 09:44:14 | +108.12% | +100.96% |

Sequential $1 compounding replay: $2.3812 ending equity before network costs (+138.12%). Fixed $1 notional per trade ends at $2.1945. Estimated costs: Pump fee 1.25% each side and slippage 0.5% each side; network/priority fees excluded.

## Interpretation
A large sell wave around 09:43:20 was absorbed, so a single whale sale is not a sufficient exit signal. Later flow showed exhaustion. The replay uses reconstructed one-second prices and simulated fills, not live execution.

## Files
- `coin3_1s_market_bars.csv`
- `coin3_strategy_60s_trail20_trades.csv`

## Limitations
This is one token and a small number of trades. Price bars and stop fills are reconstructed; quote availability, real market impact, network fees, and exact same-slot ordering are not fully simulated. This result is research evidence, not proof of a profitable strategy.
