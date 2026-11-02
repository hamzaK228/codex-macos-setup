# Frontend architecture

The client is a distributed system with a hostile network and a user watching. Most "frontend bugs" are state ownership or data-fetching decisions made too late.

## Rendering mode

Choose per route, not per project.

| Mode | Use when | Cost |
|---|---|---|
| CSR | Authenticated app shells, dashboards behind a login | Empty first paint, SEO irrelevant |
| SSR | First paint and SEO matter, data is per-request | Server load, hydration, cache rules |
| SSG | Content changes on deploy | Rebuild to change content |
| ISR / revalidate | Content changes on a timer, large catalogs | Staleness window to document |
| Streaming + suspense | Slow data, fast shell | More moving parts, error boundaries per region |

Whatever you pick: define what renders on the server, what hydrates, and where the data came from. A hydration mismatch is a symptom of computing different things in two places.

## Where state lives

Ask "who is the source of truth for this value?" and put it there, once.

| Kind of state | Home | Never |
|---|---|---|
| Server data (records, lists) | Server; client holds a cache | Copy it into a global store by hand |
| Selection, filters, pagination, tab | URL | Component state that dies on refresh |
| Form draft | Local form state, persisted if long | Global store |
| Ephemeral UI (open, hovered, focus) | Component local | URL or global |
| Session identity, entitlements | Server-provided, cached at boot | Local storage as truth |
| Cross-page client preference (theme) | Local storage + cookie | Server as authority for a client choice |

Rules: one owner per value; derived values are computed, not stored; a store is for state shared by distant components, not a convenience bag.

## Data fetching and caching

- A server-state cache (React Query, SWR, Apollo, TanStack) owns fetching, deduplication, retries, staleness, and background refresh. Write the invalidation map when you add a mutation: which keys does this write touch?
- Race conditions: cancel or ignore stale responses (request id or abort signal). "Last write wins" by arrival order is a bug users see as flicker and wrong data.
- Optimistic updates need a rollback path and a visible failure, or they are a lie.
- Polling is fine; subscriptions are for when polling is measurably too slow or too expensive.
- Errors are states, not exceptions: every fetch has loading, empty, error, and success as designed UI.

## Forms

Validate on submit and on blur, not on every keystroke. Preserve input on error. Disable double-submit and make the write idempotent anyway. Server validation is the authority; client validation is courtesy.

## Security on the client

- **Tokens**: `HttpOnly`, `Secure`, `SameSite=Lax/Strict` cookies for sessions. Tokens in `localStorage` are readable by any XSS; if you must, accept that trade explicitly and keep XSS defenses strong.
- **XSS**: escape by default in your framework; `dangerouslySetInnerHTML` and equivalents get sanitization and a review. A CSP that forbids inline script is worth more than a hundred lint rules.
- **CSRF**: cookie-based auth needs `SameSite` plus a CSRF token or an origin check on state-changing requests.
- **CORS**: explicit origin allowlist, credentials only where required, no wildcard with credentials.
- **Third parties**: every script is code you execute. Vendor scripts get a CSP allowance, a review, and a removal date.

## Bundles and code splitting

Budget first: a number for initial JS on the slowest target device. Then: route-level splitting, lazy-load heavy widgets, check what a dependency costs before adding it, keep the critical path free of charts, editors, and date libraries. Measure with the built bundle and real throttling, not a dev build on a fast laptop.

## Repository and microfrontends

- Monorepo is a default, not a decision: Nx or Turborepo for task graph and caching, package boundaries mirroring module boundaries, one shared UI layer.
- Microfrontends only with independent deploy teams and a real coordination cost; otherwise they buy runtime integration cost for organizational freedom you do not need.
- A design system shared across apps is a package with a version and a changelog, not a folder people copy.

## Done when

Every piece of state has a named owner, every mutation names the caches it invalidates, the loading/empty/error states exist, and the initial JS fits the budget.
