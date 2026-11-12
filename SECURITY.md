# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/strixagents/Strix/security/advisories/new)
instead of opening a public issue. Include steps to reproduce and the impact you see.

We aim to acknowledge reports within a few days.

## Scope

- The web app and its API routes (`app/api/*`)
- The CLI (`bin/strix.mjs`) and MCP server (`bin/strix-mcp.mjs`)

Strix never asks users to sign transactions and never holds keys or funds. Its safety checks
(scorecard, Contract X-ray, Rug Radar) are warning systems, not guarantees — a token passing them
can still be risky.
