# Testing strategy

Tests are a risk allocation, not a coverage number. Spend them where a bug would be expensive and hard to see.

## Layers, by what they can catch

| Layer | Catches | Cost | Keep it |
|---|---|---|---|
| Unit | Branching logic, pure transforms, parsers, pricing | Milliseconds | Fast, no I/O, behaviour-named |
| Contract | A hop's shape and compatibility (producer ↔ consumer) | Fast | One per boundary, both directions |
| Integration | Real SQL, transactions, constraints, joins, auth scoping | Seconds, needs a database | Every risky query and invariant |
| E2E | The wiring: routing, forms, session, redirects | Slow, flaky | One per critical user journey |
| Load | Saturation point, p95 at concurrency, queue drain | Minutes, an environment | Before launch and before scaling changes |

## Put the test where the bug would live

- A bug that only a database can produce (constraint, cascade, transaction, isolation) needs a test against a real database. A mocked repository proves nothing.
- A bug in mapping (row → DTO) needs a contract test, not an E2E.
- A bug in orchestration across three services needs one integration test with fakes at the HTTP seam.
- A bug in layout or a race needs a browser test or a manual check — do not pretend a unit test covers it.

Rule of thumb: **the lower the layer, the cheaper the failure to diagnose**, so push each assertion as low as it can still fail.

## Assertions

Assert observable behaviour and outcomes, not internals. A test that asserts a mock was called locks in an implementation and passes while the feature is broken. Prefer: given this input and state, this output and these rows exist.

Name tests by the behaviour and the condition: "rejects a second submit with the same idempotency key", not "test createOrder 2".

## Fixtures and data

- Factories with sensible defaults and explicit overrides; each test states only what matters to it.
- Per-test isolation: transaction rollback or truncation, never a shared mutable seed that couples test order.
- Seed data for demos and E2E lives in a versioned file, not a developer's local database.
- Time, randomness, and ids are injected or frozen — otherwise the test is a slow flake generator.

## Flakiness

A flaky test is a broken test. Causes, in order of frequency: shared state, real time and timeouts, unawaited async work, network, ordering assumptions, animation and viewport in E2E. Fix or delete; a quarantined flake with no owner is worse than no test because it trains people to ignore red.

## Migrations

Test the migration, not only the schema: apply from the previous release's schema, run the backfill, then assert the invariant holds and the old code still works. A migration that only passes on an empty database is untested.

## Load and failure

- A load test with production-shaped traffic, run long enough to see queue drain and memory growth.
- A failure drill: kill a dependency, saturate a queue, expire a lock. Confirm the system degrades as designed and the alarms fire.

## Coverage

Coverage is a flashlight, not a target. Look at the uncovered branches in money, auth, and state transitions. Chasing a percentage produces assertion-free tests that cost maintenance and catch nothing.

## Done when

Each risky invariant fails a test when broken (verify by breaking it once), the failure path is exercised, and the suite runs fast enough that people actually run it.
