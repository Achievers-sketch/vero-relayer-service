# Vero Relayer — Architecture & Wave Program Plan

---

## Pipeline Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GitHub                               │
│  PR merged + "wave-contribution" label                      │
│         │                                                   │
│         ▼                                                   │
│   GitHub Webhook (POST)                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               Vero Relayer Service (Node.js)                │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  index.js    │───▶│  stellar.js  │───▶│  Stellar Net │  │
│  │  (Express)   │    │  (TX builder)│    │  (manageData)│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  Filter: action=closed, merged=true, label=wave-contribution│
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Stellar Blockchain                        │
│   Account: relayer keypair (STELLAR_SECRET_KEY)             │
│   Operation: manageData                                     │
│   Key:   vero:pr:<number>                                   │
│   Value: "registered"                                       │
│   Network: testnet | mainnet                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Configurations

| Environment | Network | Notes |
|---|---|---|
| Local dev | testnet | Use `.env` with test keypair |
| CI/staging | testnet | Secrets injected via env vars |
| Production | mainnet | Requires funded relayer account |

---

## The Wave Program

The Wave Program works by having maintainers create scoped issues that contributors pick up during sprint cycles. Each sprint runs for two weeks. At the start of each sprint, maintainers tag a set of issues `wave-contribution` — these become the active bounty pool. Contributors fork the repo, pick an issue, implement a solution, and open a PR against `main`. When the PR is merged, this relayer fires and writes the contribution on-chain.

### Types of Work Posted Each Sprint

**Bug Fixes**
Reproducible defects with a clear acceptance criterion. The issue must include either a failing test that the fix must make pass, or a precise description of the broken behaviour and the expected outcome. Vague reports are not eligible.

**New Features**
Bounded additions scoped to a single module or file. Maintainers write the interface contract (function signature, input/output shape, edge cases) before the sprint opens. Contributors implement against that contract — no scope creep.

**Documentation**
Missing or outdated content: README sections, inline JSDoc comments, architecture diagrams, usage examples, and environment setup guides. Each doc issue specifies exactly which file and section needs work.

**Testing**
New unit or integration tests for uncovered code paths, edge cases, or regression scenarios. Issues specify the target module and the scenario to cover. Tests must pass in CI to qualify.

**Refactors**
Isolated clean-up tasks with no behaviour change — renaming symbols for clarity, extracting repeated logic into helpers, removing dead code, or improving error messages. A passing test suite before and after is the acceptance criterion.

---

## End of Sprint

At the close of each sprint, the on-chain `manageData` entries serve as the immutable record of who contributed what. This record is used to calculate contributor scores, issue rewards, and inform the next sprint's issue selection.
