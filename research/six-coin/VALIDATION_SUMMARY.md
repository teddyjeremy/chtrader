# Six-coin historical entry and adaptive-exit validation

All values are paper-replay estimates, not live fills. Costs generally include 1.25% Pump fee and 0.5% slippage on each side; network/priority fees and tips are excluded. Coin-specific transfer taxes and quote-asset differences apply.

| Coin | Strict entries | Main outcome under cost-aware adaptive exit | Qualification |
|---|---:|---|---|
| 1 | 1 | −8.30% net | Strict entry failed; no exit variant rescued it. |
| 2 | 0 | No strict trade | Candidate B exploratory replay: +99.88% at migration boundary, not a strict-rule result or verified fill. |
| 3 | 2 | +3.92%, +101.60% net | Two strict entries; one protected trade and one runner. |
| 4 | 0 | No strict trade | Relaxed 0.5% pivot sensitivity: +157.15%; exploratory only. |
| 5 | 5 | −9.21%, −9.79%, +0.34%, −9.21%, +159.65% net | Three losses, two wins; entry quality remains the limiting factor. |
| 6 | 1 | +1.36% net with floors vs −8.41% without | One strict entry; only a single-trade observation. |

## Coin 6 reconstruction

- Mint: `2NFDhipSmrn3GaU7UK6jPvYxbveBUvNs6ec71r2ipump`.
- Quote asset: SOL.
- 4,192 reconstructed direct curve trades: 2,199 buys and 1,993 sells.
- 766 unique buyers, 545 unique sellers, 782 unique traders.
- Buy quote flow 780.5390 SOL; sell quote flow 715.8613 SOL; net +64.6778 SOL.
- Curve activity: 2026-11-10 07:38:44–08:01:36 EAT.
- One strict signal at 07:40:58 EAT; entry at 07:40:59 EAT.
- Signal: +95.73% 60-second impulse, 12.04% pullback, +6.73% pivot reclaim, 9.71x buy/sell quote ratio, 12 buyers, 4 sellers; largest buyer share 51.24%.
- Maximum favourable excursion +11.57%; maximum adverse excursion −5.12%.
- Progressive +5% gross floor triggered after the +10% peak threshold, yielding +1.36% modeled net after assumed fees/slippage. Without that floor the trade hit the hard stop and modeled −8.41% net.
- 156 structural candidate seconds failed one or more strict filters. Rejection reasons overlap: pivot 151, buy/sell ratio 114, seller count 98, concentration 91, buyer count 76.

## Conclusions

1. Preserve strict entry rules; do not lower thresholds to force trades.
2. The wide 40% trail alone is not enough protection for a weak move that peaks near +10–12%.
3. Progressive floors improved Coin 6's one replay, but this is not universal proof.
4. Wide trailing and longer holding preserve genuine runners; migration exits must be implemented before curve closure.
5. The next stage is a separate bad-coin selection/rejection system. It has not yet been validated by this work.
