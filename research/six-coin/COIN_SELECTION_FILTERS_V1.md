# Coin-level selection filters v1 — research candidate

**Status: paper-only, provisional. This is not a profitability claim.**

## Objective

The entry trigger and exit manager are not enough by themselves. The selection layer must distinguish a token that is temporarily showing buying pressure from one where demand can sustain a recovery. It must also avoid permanently blacklisting a token when a later, genuinely strong setup appears.

## Evidence from the current Coin 1–5 research

| Coin | Strict-rule result | Evidence relevant to selection |
|---|---:|---|
| 1 | One trade, -8.30% net | Whole-curve net quote flow was -17.85 SOL. The entry showed +22.98% impulse, 17.01% pullback, 3.14x buy/sell and 6 buyers/3 sellers, but only +1.89% MFE before a -14.30% MAE. |
| 2 | Zero strict entries | Whole-curve net quote flow was +16.13 SOL. A separate Candidate B replay was profitable, but it was exploratory and is not a strict-rule result. |
| 3 | Two strict winners | Net quote flow was +27.18 SOL. Estimated net returns were +18.49% and +100.96%. No direct creator curve sale was detected in the captured window; this does not prove there were no related wallets or later sales. |
| 4 | Zero strict entries | Creator sold 100% of the recorded initial allocation within 11 seconds. A relaxed 0.5% pivot sensitivity produced one profitable exploratory trade, not a strict-rule result. |
| 5 | Five baseline trades, four losses and one win | Baseline replay ended at -19.98%. Creator sold 100% of the recorded initial allocation within 3 seconds. The fifth setup was much stronger than the first four: +38.46% impulse and +12.52% pivot reclaim, versus +20.03% to +29.29% impulse and +1.80% to +5.42% pivot reclaim on the first four. |

Coin 5's later cost-aware runner replay is an important qualification: its three hard-stop losses remained, one earlier loss was improved to approximately break-even, and its fifth trade was preserved as a large runner. Therefore, **do not permanently blacklist every token whose creator sells**. The goal is to quarantine weak setups and allow strong post-distribution recovery setups to requalify.

## Candidate filter A — creator-exit quarantine with recovery

The rolling 60-second creator-sale check is insufficient. Coin 5's creator sold out at launch, but the strategy's entries came more than a minute later; Coin 4's relaxed candidate came several minutes after the creator's exit. A rolling window forgets those events.

Track cumulative creator sales against the recorded initial allocation from launch until migration:

- If the creator has sold more than 25% of the recorded initial allocation, put the token into **creator-exit quarantine**.
- Do not enter while quarantined unless a fresh recovery setup passes all of:
  - impulse at least 35%;
  - pivot reclaim at least 8%;
  - confirmed higher low;
  - all three persistent buying-pressure windows pass;
  - all existing liquidity, quote-asset, tax, exit-route and execution-cost checks pass.
- The 25%, 35% and 8% values are provisional research thresholds. They are not proven optima.
- Missing creator identity, initial allocation or complete launch-to-now sale history means WATCH, never an assumed zero sale.
- A new creator sale inside the rolling 60-second window remains an immediate veto.

This is designed to filter Coin 5's weak early setups while preserving its fifth, much stronger runner candidate. It would also leave Coin 4's relaxed 0.83% pivot candidate quarantined. Coin 3 had no direct creator sale in the observed curve window and is unaffected by this quarantine rule.

## Candidate filter B — rolling quote-flow deterioration

Coin 1's whole-curve net quote flow was negative, but whole-curve totals are hindsight and must never be used as an entry feature. Instead, calculate net quote flow over completed 30-second and 60-second windows **ending before the candidate signal**.

Test a veto when both rolling windows are negative, or when the 60-second flow is negative and price is making lower highs. Do not reject solely because one window is negative. Coin 5 had positive whole-curve net quote inflow (+68.96 PreStocks) and still produced a losing baseline replay, so positive aggregate flow alone is not sufficient.

## Candidate filter C — quote-asset and execution eligibility

Only consider a quote asset when its mint, decimals, conversion to SOL, transfer tax in both directions and executable sell route are verified and fresh. The Coin 5 archive showed an approximately 1% buy-side quote-transfer haircut. Coin 4 used AAPLx and Coin 5 used PreStocks; neither should be treated as if it were SOL or a USD stablecoin.

If the deployment is intended to trade SOL-denominated Pump.fun curves only, restrict eligibility to SOL/WSOL. Otherwise, support non-SOL quote assets only through verified conversion and tax metadata.

## What the data says not to do

- Do not loosen the 1% pivot rule globally. Coin 5 produced the same nine qualifying signal-seconds at 1.0% and 0.5%; lowering the threshold did not fix its losing baseline.
- Do not trust a single two-second buy/sell ratio. Coin 5 had a signal with 34 buyers and zero sellers that still hit the hard stop.
- Do not use buyer count alone. The first four Coin 5 entries had apparently strong flow but failed.
- Do not use whole-token lifecycle volume, net flow or later creator sales as if they were known at entry.
- Do not permanently blacklist a creator-exit token without testing whether a strong recovery can be traded safely.

## Required validation before promoting filters

Replay the same candidate entries with each filter independently and in combination. For every coin, report:

1. baseline entries, rejected entries and accepted entries;
2. winners rejected by each filter;
3. losses avoided by each filter;
4. net PnL after venue fees, token and quote transfer taxes, slippage, priority fees, tips and network costs;
5. maximum drawdown and sequential equity;
6. whether every feature was available before the candidate signal.

Split validation by token, not by individual trade. Tune on one group of tokens and test on untouched tokens. Keep the current entry/exit rules as the baseline. Do not promote these candidate thresholds until the filter improves out-of-sample net results without deleting the major runners.

**No live trading approval. The Helius/RPC producer must supply complete creator lifecycle history and verified execution data before the new lifecycle guard can be considered operational.**
