# ADR 0001: Deep Runtime Module Boundaries

## Status
Accepted

## Context
Telemetry JSON hydration, PUBG compound-match interpretation, Discord match presentation, and
adapter construction previously leaked across services and made cached/live or automatic/manual
paths diverge.

## Decision
- `TelemetryRepository` owns the versioned JSON cache format and returns hit/miss/corrupt results.
- `MatchInterpreter` is the only PUBG compound-match mapper.
- `MatchPresentationService` owns match enrichment and embed rendering.
- `createApplication` owns one validated config, one Prisma client, one PUBG client, and the concrete
  collaborator graph.
- `MatchMonitorService` retains polling; Discord remains the only summary destination.

## Consequences
Domain consumers receive hydrated values, SDK mapping changes are local, presentation tests use a
public seam, and startup policy is visible. Constructors are more explicit, and new adapters must be
wired in the composition root.
