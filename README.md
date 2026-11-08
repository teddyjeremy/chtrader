# chtrader

Deterministic Solana meme-coin research and paper-trading system. No ML/LLM trading decisions.

## Current state

- October 2026 Helius Parsed Events collector scaffolded.
- Coverage: Pump bonding curve, PumpSwap, and Jupiter-routed swaps.
- Strategy hypothesis documented in [docs/STRATEGY_V0.md](docs/STRATEGY_V0.md).
- Paper-only. No wallet signing, order submission, or live trading code exists.

## Configure

1. Add a GitHub Actions repository secret named `HELIUS_API_KEY`.
2. Open Actions → October 2026 Solana research → Run workflow.
3. Start with `max_pages=5` to validate plan access, returned records, and credit usage. Increase only after inspecting the first artifact.
4. Download the artifact `chtrader-october-2026-research`.

Never paste the key into source code, commit it, print it, or include it in an artifact.

## Local run

Node.js 22+:

```bash
npm install
# Set HELIUS_API_KEY in your shell, not in a committed file.
npm run typecheck
npm run research:october
```

## Important research caveats

- Helius Parsed Events Scan is used instead of the older Enhanced Transactions API.
- The collector pages using Helius pagination tokens and writes raw parsed records as JSONL.
- The current program set is not a complete DEX census. Jupiter-routed swaps can overlap direct PumpSwap activity.
- This first pass does not itself provide historical pool reserves, full OHLCV, executable quotes, or a complete token lifecycle. Those must be enriched before strategy profitability can be evaluated.
- The research workflow never signs or sends transactions.
