# Profit-protecting runner exit research

The same eight historical entry instances from Coins 3–5 were replayed with different exit configurations: two Coin 3 strict entries, one Coin 4 relaxed 0.5%-pivot sensitivity entry, and five Coin 5 strict entries.

| Strategy | Trades | Wins | Mean net | Median net | Worst | Best | Mean hold |
|---|---:|---:|---:|---:|---:|---:|---:|
| Wide 40% trail, no floor | 8 | 4 | +89.92% | +48.58% | −9.79% | +333.59% | 124.25s |
| Cost-aware 40% trail + floors | 8 | 5 | +49.30% | +2.13% | −9.79% | +159.65% | 95.88s |
| 300s / 20% baseline | 8 | 4 | +46.65% | +7.01% | −9.79% | +159.65% | 81.25s |
| Cost-aware + 10% scale-outs | 8 | 5 | +44.48% | +4.17% | −9.79% | +141.17% | 95.88s |

The cost-aware candidate protected Coin 5 trade 3 from an estimated −4.43% net exit under the 20% trail to about +0.34% net. It preserved the large runners in this sample. The Coin 4 case is not a strict entry, and several runner exits coincide with data-end or max-hold boundaries. This is a small, selected sample, not a performance forecast.

Candidate schedule: 5% hard stop; activate after +10% peak; 40% wide trail; floors +5% at +10%, +15% at +50%, +40% at +100%, +80% at +200%; 300-second safety ceiling; exit before migration. Costs must be calculated from actual quote asset and execution conditions.
