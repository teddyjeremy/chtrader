# Risk assessment data contract

The pure analyzers in `src/bot/risk-analyzers.ts` turn normalized Helius/RPC observations into explicit evidence. They do **not** fetch chain data themselves and are not yet connected to a live feed or dashboard. Do not describe the risk checks as live until those adapters and persistence are implemented.

## Required inputs and interpretation

- **Bonding curve:** record real and virtual SOL reserves separately, token reserves, timestamp, and the source slot/signature. These are curve reserves, not locked LP.
- **After migration:** identify the actual pool and its program; calculate pool liquidity and exit capacity; inspect LP tokens or concentrated-liquidity position ownership, burn destination, locker program, unlock timestamp, and authorities. A missing lock record is unknown, not locked.
- **Holder distribution:** fetch token supply and all token accounts, aggregate balances by owner, and explicitly classify burn, pool, and program-controlled accounts. Report top 1/5/10/20 owner percentages plus creator, creator-linked, insider, and suspected-cluster current holdings. Use the same supply denominator and raw integer amounts before converting to percentages.
- **Bundle heuristics:** preserve wallet, signature, slot, timestamp, token amount, and funding source. Same-transaction and common-funder links are stronger evidence; same-slot timing alone is only a weak signal and must not be labelled proof of a bundle. Keep acquired supply separate from current holdings; current holdings must come from a fresh balance snapshot.
- **Other risk observations:** mint/freeze authority state, creator sell percentage, largest-holder selling, buy/sell ratio, unique buyers, failed transaction rate, volume concentration, and observed liquidity withdrawals. Every value needs an observation time and provenance.

## Entry policy

- Explicit high-risk evidence rejects the candidate.
- Missing, stale, partial, or contradictory evidence leaves it in `watch`; unknown is never converted to safe.
- Curve-only strategy rejects migrated/migrating markets until a separate migrated-pool strategy is implemented.
- Holder concentration and cluster thresholds in `rules.ts` are conservative initial hypotheses, not research-validated constants. Tune them against the October dataset and paper results before considering live execution.

## Known limitations

1. Helius parsed transaction history is not a complete current holder snapshot. Pair it with RPC token-account and supply queries.
2. Wallet clustering is heuristic. Shared funder can be an exchange or service; label confidence and preserve raw evidence for review.
3. LP lock/burn verification is program-specific. Never infer a lock from curve reserves or pool existence.
4. The current paper engine and dashboard are not yet wired to these assessments. The live Helius adapter, durable storage, API, dashboard, deployment, and end-to-end tests remain outstanding.
