# Data modelling

The schema is the part of the system that outlives every framework you will ever remove.

## Start at the grain

Say what one row means in one sentence: "one subscription per customer per month". Ambiguous grain is the source of duplicate rows, wrong totals, and migrations nobody wants. Normalize to third normal form first; denormalize only on measurement.

## Keys

- Surrogate primary key (integer or UUID) for identity; a natural key (email, slug, external id) gets a **unique constraint**, not the primary key.
- UUIDv7 or ULID where ids are exposed or generated client-side; sequential integers leak volume and invite enumeration.
- Foreign keys in the database, not only in the ORM. Cascades are explicit: `RESTRICT` by default, `CASCADE` only where the child has no independent meaning.
- Composite uniqueness for the real business rule: `unique (customer_id, month)` beats a check in code.

## Invariants

Every invariant has one enforcement point. Prefer the database for anything a second writer could violate.

| Invariant | Enforce with |
|---|---|
| Non-null, format, range | Column type, `check`, `not null` |
| Uniqueness | Unique index |
| Belongs to the same tenant | Composite foreign key carrying `tenant_id` |
| Sum equals the lines | Transaction + `select ... for update`, or a generated/derived value |
| State machine (draft → paid → shipped) | `check` on the enum plus a guarded update (`where status = 'draft'`) |

A guarded update (`update ... where id = $1 and status = 'draft' returning *`) is a compare-and-swap; it is the cheapest correctness you will ever buy.

## Transactions and isolation

- One transaction per business action; never hold one open across a network call or user think-time.
- Default read-committed is fine for most writes. Use `repeatable read` or `serializable` when a decision reads several rows and then writes; expect and handle serialization failures with a retry.
- Lock ordering matters: always touch rows in a deterministic order to avoid deadlocks.
- Optimistic concurrency for user edits: a `version` column in the `where` clause, and a 409 the client can resolve.
- Pessimistic locks only for short, contended, critical sections.

## Indexes

- Index the columns you filter and sort on, in the order of the predicate: equality first, then range, then order.
- A composite index answers the leftmost prefixes; a separate index per column is usually waste.
- Partial indexes for soft-deleted rows and rare statuses.
- Every index costs write throughput. Read the query plan for the slowest paths; do not guess.

## Migrations

Ship as **expand → backfill → migrate → contract**, so old and new code coexist:

1. Expand: add nullable column/table/index `concurrently`. Deploy code that writes both.
2. Backfill: batched, idempotent, resumable, rate-limited; never one giant `update`.
3. Migrate: reads move to the new shape. Deploy.
4. Contract: drop the old column/index in a later deploy.

Rules: every migration is reversible or has a written forward-fix; no destructive change in the same deploy as the code that stops using it; migrations run before the app boots and are idempotent under retry; long locks on big tables are outages.

## Soft delete and history

`deleted_at` only when recovery or audit is a product requirement — otherwise it is a permanent tax on every query and every unique index. When you keep history, keep an append-only audit table, not a mutable `updated_by`.

## Tenancy

`tenant_id` on every row that belongs to a tenant, carried in every foreign key, and present in every query through a shared access layer. A missing `tenant_id` filter is the most common cross-tenant leak in fullstack systems.

## Time

Store UTC, `timestamptz` not `timestamp`. Never derive business logic from the server's local clock; pass the client's zone where the business day matters. Timestamps for events are facts; timestamps for display are formatting.

## Done when

The grain is one sentence, every invariant names its enforcer, the migration plan is expand/contract, and the hot queries have a plan you have read.
