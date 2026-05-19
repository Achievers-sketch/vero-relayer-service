# Vero Relayer Service

A lightweight Node.js service that listens for GitHub webhook events and relays qualifying pull request activity onto the Stellar blockchain. It is the on-chain settlement layer for the **Wave Contribution Program** — a sprint-based open-source incentive model where maintainers post scoped issues and contributors earn verifiable on-chain records for their merged work.

---

## How It Works

```
GitHub PR merged
      │
      ▼
POST /github-webhook
      │
      ├─ action === "closed"?        ──✗──▶ skip
      ├─ pull_request.merged === true? ──✗──▶ skip
      └─ labels includes "wave-contribution"? ──✗──▶ skip
                │
                ▼
      registerTaskOnChain(pr.number)
                │
                ▼
      Stellar transaction submitted
      (manageData: vero:pr:<number>)
```

When a contributor's PR is merged and carries the `wave-contribution` label, the relayer captures the PR number and writes a `manageData` operation to Stellar, creating a tamper-proof record of the contribution.

---

## Quick Start

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
# Fill in STELLAR_SECRET_KEY and STELLAR_NETWORK
```

**3. Start the server**
```bash
npm start
# Server listening on port 3000
```

**4. Simulate a webhook (no GitHub needed)**
```bash
npm run simulate
# [webhook] PR #42 merged with wave-contribution label
# [stellar] Transaction submitted (simulated). Hash: 0x70722d3432
# [mock] Response: { ok: true, pr: 42 }
```

---

## Webhook Payload Contract

The service expects the standard GitHub `pull_request` event shape:

```json
{
  "action": "closed",
  "pull_request": {
    "number": 42,
    "merged": true,
    "labels": [
      { "name": "wave-contribution" }
    ]
  }
}
```

Any payload where `action` is not `closed`, `merged` is not `true`, or the label is absent is silently skipped with `{ "skipped": true }`.

---

## The Wave Program

The Wave Program works by having maintainers create scoped issues that contributors pick up during sprint cycles. Each sprint has a fixed window — typically two weeks — and a defined set of issues tagged `wave-contribution`. When a contributor's PR for one of those issues is merged, the relayer automatically registers the contribution on-chain.

### Types of work posted each sprint

| Category | Description |
|---|---|
| **Bug fixes** | Reproducible defects with a clear acceptance criterion — a failing test that must pass, or a described broken behaviour that must be resolved. |
| **New features** | Bounded feature additions scoped to a single module. Maintainers write the interface contract; contributors implement it. |
| **Documentation** | Missing or outdated docs, inline code comments, architecture diagrams, and usage examples. |
| **Testing** | New unit or integration tests for uncovered paths, edge cases, or regression scenarios. |
| **Refactors** | Isolated clean-up tasks — renaming, extracting helpers, removing dead code — with no behaviour change. |

Maintainers label qualifying issues `wave-contribution` before the sprint opens. Contributors fork, implement, and open a PR against `main`. On merge, this service fires automatically.

---

## Project Structure

```
vero-relayer-service/
├── index.js              # Express server + webhook route
├── stellar.js            # Blockchain registration utility
├── scripts/
│   └── mock-webhook.js   # Local simulation script
├── .env.example          # Required environment variables
└── package.json
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STELLAR_SECRET_KEY` | Yes | Signing key for the relayer account |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run simulate` | Fire a mock webhook at localhost:3000 |
