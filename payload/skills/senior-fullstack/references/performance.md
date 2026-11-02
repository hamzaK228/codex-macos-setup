# Performance

Performance is a budget, not an aspiration. Capacity under load belongs to [scalability](scalability.md); this file is about making one request or one page fast for one user.

## Budget first

Write the numbers down before touching code: p95 latency for the endpoint, initial JS in KB, LCP and INP targets on a mid-tier phone over 4G, memory ceiling for the process. Without a budget, every optimization is a guess and every regression is invisible.

Reference targets: LCP under 2.5 s, INP under 200 ms, CLS under 0.1 at p75 on real devices. An API that renders a screen has a 300–500 ms budget, not because it is a law but because the screen has one.

## Measure before changing

- Frontend: Lighthouse or WebPageTest for field-like conditions, the Performance panel for main-thread work, the Network panel for waterfalls and payload.
- Backend: `EXPLAIN ANALYZE` for the query, tracing for the request, a profiler for the CPU.
- Production: real-user metrics and p95/p99 — the median hides the users who leave.

Fix in order of measured cost. The biggest win in most fullstack systems is one query or one waterfall, not one micro-optimization.

## Frontend

- **Critical path**: HTML, then CSS, then the JS needed for first paint. Everything else is deferred, lazy, or loaded on interaction.
- **Waterfalls**: the classic shape is page → JS → API → data → render. Server-side fetch or preload collapses it. Parallelize independent fetches; serialize only real dependencies.
- **Images**: correct dimensions, modern formats, lazy below the fold, explicit width/height to avoid layout shift, no oversized hero.
- **Fonts**: `font-display: swap`, subset, preload the one weight used above the fold.
- **Hydration**: keep the interactive island small; a heavy client component at the root makes every route a client app.
- **Re-renders**: measure with the profiler, then fix the actual cause — a dependency array, a context value recreated per render, state placed too high.
- **Long lists**: virtualize past a few hundred rows.
- **Memory leaks**: listeners and subscriptions without cleanup, intervals in effects, detached DOM from retained closures, growing caches. Reproduce with the memory timeline over minutes, not seconds.

## Backend

- **N+1 and over-fetching**: batch or join; select only the columns used; paginate.
- **Indexes and plans**: the query plan is the ground truth. `seq scan` on a large table in a hot path is the bug.
- **Payload**: compress, avoid returning blobs inline, stream large responses.
- **Connection pooling**: size it to the database's limit, not the app's desire; a pool too large is slower under load.
- **Serialization cost**: a large JSON payload costs CPU on both ends; project before serializing.
- **Caching**: after the query is fixed, not instead of fixing it ([scalability](scalability.md)).
- **Async off the request path**: email, PDFs, exports, webhooks.

## Regressions

A performance budget that is not enforced is a comment. Add a check where the team already looks: a bundle-size limit in CI, a query-count assertion in an integration test, a Lighthouse budget on the critical route, a p95 alert on the endpoint. Catch the regression in the PR that caused it.

## Done when

The budget exists as a number, the measurement is before/after with the same method, and a check would fail if the next change doubled the cost.
