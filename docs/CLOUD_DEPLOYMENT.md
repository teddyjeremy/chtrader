# Cloud deployment plan

## Runtime layout

- Google Cloud Run runs the TypeScript bot and market-data consumer.
- Cloud SQL PostgreSQL stores market events, token lifecycle, every decision (including rejected setups), paper positions, closed trades, strategy versions and service health.
- Secret Manager stores the Helius credential and API authentication secrets.
- Vercel hosts the Next.js dashboard only. It must not run the trading loop.
- GitHub Actions deploys Cloud Run using GitHub OIDC / Workload Identity Federation, not a downloaded service-account key.

## Non-negotiable safety defaults

- Paper mode only. No wallet key, transaction signing or real-money execution code.
- One open position initially.
- Persist open positions and restore them before processing new events after a restart.
- Record all decisions and feature snapshots; never discard rejected tokens.
- No entry when market data is stale, state is unverified, or a conservative exit simulation is unavailable.

## Google Cloud resources required

A Google Cloud project with Cloud Run, Cloud SQL Admin, Secret Manager, Artifact Registry and IAM Credentials APIs enabled; a PostgreSQL instance; a least-privilege runtime service account; a Secret Manager secret named HELIUS_API_KEY; and a GitHub Workload Identity Federation provider restricted to this repository and deployment branch.

## Vercel configuration required

Create a Vercel project from this repository with the dashboard directory as its root. Configure server-only BOT_API_URL and BOT_DASHBOARD_TOKEN environment variables. Never expose the dashboard token through a NEXT_PUBLIC variable.

## Release gates

Typecheck and tests; database migrations; restart recovery; Helius decoder validation against known Pump transactions; quote/exit simulation; chronological backtest and walk-forward validation; then a sustained paper-trading period. This deployment does not authorize live trading.
