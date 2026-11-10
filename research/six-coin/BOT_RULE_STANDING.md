# Bot rule standing — six-coin research snapshot

## Status
**Paper-only candidate rules. Not approved for live trading.** The current research set is small, uses reconstructed historical data, and has important execution-model limitations. The rules below are the latest candidate specification, not a proven profitable strategy.

## Entry candidate (frozen V1)
1. Pump.fun bonding curve only; do not enter after migration to PumpSwap.
2. Look back 60 seconds and require at least +20% impulse.
3. Require a 10–40% pullback from the recent high.
4. Require reclaim of the previous 5-second high by at least +1%.
5. In the last 2 seconds, buy quote must exceed sell quote by more than 3x.
6. Require at least 3 distinct buyers.
7. Seller count must be no more than half the buyer count.
8. Largest buyer share must be no more than 72%.
9. Enter only at the next completed 1-second close, and only after executable quote, slippage, impact, fee, and exit-route checks pass.
10. Never average down.

## Exit candidate (adaptive profit protection)
1. Initial hard stop: 5% below entry.
2. Activate trailing only after a completed bar confirms at least +10% favorable movement.
3. Wide runner trail: 40% below the previous completed high-water mark.
4. Ratchet gross-profit floors from the previous peak:
   - +10% peak: protect +5% gross.
   - +50% peak: protect +15% gross.
   - +100% peak: protect +40% gross.
   - +200% peak: protect +80% gross.
5. Effective stop is the highest of hard stop, trailing stop, and protected floor.
6. 300 seconds is a safety ceiling, not a planned fixed exit.
7. Exit before migration; do not carry a bonding-curve position into PumpSwap.
8. Do not exit solely because of one red candle or one large seller. No mandatory scale-outs in this candidate.

## Evidence and unresolved issues
- Coin 3: two strict-rule trades; estimated net +18.49% and +100.96%.
- Coin 4: strict rules generated no trade. A relaxed 0.5% pivot test generated one sensitivity-only trade (+60.08% estimated net), not a strict-rule result.
- Coin 5: five strict-rule paper trades; four losses, one win; $1 ended at $0.8002 (-19.98%). Strong short-window buying flow did not prevent hard-stop losses.
- Coin 6: one strict signal. A 40% trail without a floor hit the hard stop (-8.41% net); a 40% trail plus progressive floors produced +1.36% net in the tested replay. One trade only.
- Coin 1: one strict signal; adaptive exits hit the hard stop, approximately -8.30% net.
- Coin 2: zero strict entries under Coin 3 rules. A separate exploratory Candidate B replay was positive, but it is not a strict-rule validation.

A small second-stage exit comparison across eight entries found a 40% runner trail with cost-aware profit floors had a 62.5% win rate and +49.30% mean net return; the sample is tiny and includes one Coin 4 relaxed entry. This is exploratory and must not be treated as a reliable expectancy estimate.

## Current decision
Keep the frozen entry and adaptive exit as a **research candidate only**. Do not enable live trading. Next validation must:
- Re-run all six coins through the exact same versioned entry/exit implementation.
- Apply creator-wallet exit/cluster vetoes and persistent-flow checks before entry.
- Model actual token transfer taxes and quote-asset conversion costs.
- Simulate executable curve quotes, partial fills, failed transactions, priority fees, and migration-time exits.
- Test more tokens, avoid per-token rule tuning, and report out-of-sample results separately.

No profitability guarantee is implied.
