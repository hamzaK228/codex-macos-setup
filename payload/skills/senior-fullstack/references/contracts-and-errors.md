# Contracts and errors

A contract is the shape crossing a boundary. Boundaries are where systems rot: the wrong field leaks, a validation lives on the wrong side, an error loses its meaning.

## Map, do not leak

Each hop has its own model, and they are not the same object:

```
row (persistence) → entity (domain, invariants) → DTO (wire) → view model (client)
```

- Never serialize a database row to the client: it leaks internal columns, couples the schema to the API, and turns every migration into a breaking change.
- Never let the wire shape become the domain object either: it imports transport concerns into business rules.
- Translate explicitly, even when the shapes are identical today. The translation is the seam that lets them diverge.

## Validate at the edge, trust inside

Parse once, at the boundary where data enters the system: HTTP handler, queue consumer, form submit, webhook.

- Reject unknown fields or ignore them deliberately — never silently mass-assign request bodies onto models.
- Normalize (trim, lowercase email, parse ids, coerce dates) at parse time so every layer below sees one shape.
- Return field-level errors the client can render.
- Types are compile-time; validation is runtime. Both, at the edge.

## Error taxonomy

Decide the taxonomy once, and derive the transport from it:

| Kind | Meaning | HTTP | Client behaviour |
|---|---|---|---|
| Validation | Input is malformed | 400 | Show field errors |
| Unauthenticated | No or expired identity | 401 | Re-auth, then retry |
| Forbidden | Identity lacks the right | 403 | Explain, hide the action |
| Not found / hidden | Absent, or not visible to this actor | 404 | Empty state |
| Conflict | State moved under you | 409 | Reload, merge, retry |
| Rate limited | Too many requests | 429 | Back off with `Retry-After` |
| Dependency unavailable | Downstream failed | 502/503 | Retry with backoff or degrade |
| Bug | Invariant or assumption broken | 500 | Report with a correlation id |

Rules: one error envelope across the API (`code`, human `message`, optional `details`, `requestId`); a machine-readable `code` clients branch on; no stack traces or SQL to the client; log the full failure server-side with the same `requestId`.

## Idempotency

Any write that a client may retry (payments, submissions, webhooks) takes an idempotency key. Store the key with the response; a repeat returns the first result rather than acting twice. Unique constraints are the backstop — they turn a double-submit into a 409 instead of a duplicate row.

## Pagination and lists

- Cursor pagination for anything that grows or is written concurrently; offset pagination only for small, stable, admin-style sets.
- Stable sort key (created_at, id) that the cursor encodes; never sort on a mutable column.
- Filters are explicit and indexed; a list endpoint that accepts arbitrary ordering invites a table scan.
- Cap page size server-side and return `nextCursor`.

## N+1 and over-fetching

A list of N rows that each triggers a query is a latency bug that grows with success. Batch or join, always. In GraphQL, a dataloader per request is the standard fix; in REST, expand or embed deliberately and document it. Return the fields the screen needs, not the whole model — payload size is a user-visible latency.

## Failure and time

Every request carries a deadline; every dependency call is bounded by it. Retries are for idempotent operations only, with exponential backoff and jitter. A partial failure either degrades explicitly ("reviews unavailable") or fails the whole operation — silent omission is the worst option.

## Versioning

Additive changes ship freely: new optional fields, new endpoints. Breaking changes get a version, a migration window, and a deprecation notice. Removing a field is a coordinated two-deploy event, not a refactor.

## Done when

Every boundary has an explicit mapped type, every error maps to the taxonomy, every retryable write has a key, and no internal row reaches the client.
