# Football Manager Simulation

Standalone fictional football management game inspired by the pace and decision simplicity of late-1980s management games.

## Current gate

Gate 1 — Match Lab is complete. Gate 2 competition groundwork is now in place.

The repository contains a deterministic TypeScript match engine, text-based Match Lab interfaces, and a competition layer. The competition layer provides seeded fixtures, a league table, and a deterministic season runner while keeping the match engine separate from interface and persistence concerns.

## First goals

- serialisable match inputs and outputs
- deterministic seeded randomness
- meaningful football event pipeline
- player contribution ledger and ratings
- headless simulation runner
- repeatable tests
- text Match Lab interfaces for individual matches and match series
- deterministic double round-robin fixtures, league tables, and season simulation

## Project boundary

This repository is dedicated only to Football Manager Simulation. It must not depend on, import from or share secrets, infrastructure or code with any other project.

## Development

```bash
npm install
npm test
npm run build
npm run simulate -- 1000
npm run season
npm run play
npm run play:series
npm run evidence
npm run golden:print
```

The simulation count defaults to 1,000 when omitted.
