# Football Manager Simulation

Standalone fictional football management game inspired by the pace and decision simplicity of late-1980s management games.

## Current gate

Gate 1 — Match Lab.

The first build is a deterministic TypeScript match engine, kept separate from the browser interface and any persistence layer.

## First goals

- serialisable match inputs and outputs
- deterministic seeded randomness
- meaningful football event pipeline
- player contribution ledger and ratings
- headless simulation runner
- repeatable tests
- later, a simple text Match Lab interface

## Project boundary

This repository is dedicated only to Football Manager Simulation. It must not depend on, import from or share secrets, infrastructure or code with any other project.

## Development

```bash
npm install
npm test
npm run build
npm run simulate -- 1000
```

The simulation count defaults to 1,000 when omitted.
