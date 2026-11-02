# Architecture shapes

Pick the smallest shape that satisfies the binding constraint. Every step up in shape buys one property and spends several.

| Shape | Fits when | Costs | Exit path |
|---|---|---|---|
| Modular monolith | Default for a product with one team or a small one | Shared runtime blast radius; one deploy train | Extract a module along the seam it already has |
| Services | Independent deploy cadence, scaling, or ownership is real | Network failure modes, distributed transactions, tracing burden | Merge back if the seams were wrong |
| Event-driven | Fan-out, long-running work, decoupled producers and consumers | Eventual consistency, replay, idempotency, dead letters | Consume synchronously while one consumer exists |
| Serverless | Spiky or unpredictable load, low ops appetite | Cold start, execution limits, per-request price at sustained load | Lift handlers into a container |
| CQRS | Read and write models genuinely diverge: search, dashboards, audit | Two models, projection lag, rebuild procedure | Collapse to one model if reads are cheap |
| Read replica / queue | Reads or writes outgrow one node, shape otherwise fine | Replica lag, ordering, retries | Remove when the pressure is gone |

## Rules that survive any shape

- **Boundaries before distribution.** A module boundary you cannot hold inside one process will not hold across a network. Write the interface, enforce the import rule, then move it out if it earns it.
- **One database until independent failure is real.** Separate schemas with module-owned tables are cheaper than distributed transactions. A shared database is fine; a shared table is not.
- **Every remote call gets:** a timeout, a retry with backoff and jitter, an idempotency key, and a defined behaviour when the call fails. A call without these is a hang waiting for a network partition.
- **No dual writes.** Writing to the database and publishing an event are two writes; wrap them in a transactional outbox and let a relay publish. Consumers act at least once, so they deduplicate on an event or idempotency key.
- **Events are public API.** Version the schema, keep additive changes, never rename a field in place, and keep a dead-letter queue with a written replay procedure.
- **Projections rebuild.** A CQRS read model must be reconstructible from its source of truth by a documented command, and its lag must be visible.
- **A service you cannot describe in one sentence** is a folder, not a service.
- **Stateful work goes to a queue** when the user should not wait; it stays synchronous when the user needs the answer to continue.

## Choosing the edge protocol

| Need | Reach for | Note |
|---|---|---|
| Resource CRUD, cacheable reads | REST over HTTP | Cache by URL; conditional requests |
| Aggregating several sources, clients with varied shapes | GraphQL | Cost limits, persisted queries, dataloader |
| Internal service-to-service, typed, low latency | gRPC | Deadlines and streaming are first-class |
| Server push, live updates | SSE | One-way, reconnects for free, proxy-friendly |
| Bidirectional, low latency | WebSockets | Own reconnection, auth on connect, fan-out cost |

## Done when

The shape names the constraint that justifies it, each hop's failure mode has a handling site, and the exit path is written down.
