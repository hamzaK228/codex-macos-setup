# Scalability

Scaling is a sequence of cheap fixes that you apply in order, stopping as soon as the numbers are fine.

## Find the limit before choosing the fix

Write one sentence with a number: "the dashboard query takes 900 ms at p95 and we need 300 ms"; "this endpoint saturates at 200 rps on one instance". No number, no optimization. Load-test with a shape that matches production (read/write ratio, payload sizes, concurrency), not a hammer of identical requests.

## The cheap ladder

Apply in this order; each step is roughly an order of magnitude cheaper than the next.

1. **Delete work.** Remove the query, the field, the round trip. Cheapest and most overlooked.
2. **Index and fix the query plan.** The single highest-leverage backend change in most systems.
3. **Cache.**
4. **Batch and parallelize** independent calls; remove waterfalls.
5. **Move work off the request** into a queue, with a status the client can poll or subscribe to.
6. **Add replicas** for read pressure.
7. **Partition or shard** the data.
8. **Rearchitect** the shape.

## Caching

Every cache is a copy with a lifetime you choose. Name all four layers before adding one:

| Layer | Scope | Invalidate by |
|---|---|---|
| Browser | one user, one device | `Cache-Control`, ETag, versioned URLs |
| CDN / edge | everyone, per URL or per user with care | purge on deploy, short TTL, `stale-while-revalidate` |
| Application (Redis) | shared across instances | TTL + explicit delete on write, or write-through |
| Database | query plan, buffer pool | indexes, `explain analyze` |

Rules:

- **Cache keys must include everything that changes the answer**: tenant, user, locale, permissions, feature flags. A missing dimension is a data leak, not a cache miss.
- Know your invalidation mode: TTL (eventually correct, simple), write-through (correct, slower writes), explicit delete (correct, easy to forget). Pick one and write it down.
- **Stampede** protection: jitter TTLs, lock the recompute, or serve stale while one caller refreshes.
- Never cache an authorization decision longer than the permission can change.
- A cache that hides an N+1 is a bug deferred, not fixed.

## Reads and writes

- Read replicas: send explicitly read-only traffic; accept and design for lag ("your change appears in a moment"). Read-your-own-writes needs the primary or a sticky route.
- Partition large tables by time or tenant when one table is the bottleneck; sharding by key only when a single primary is genuinely saturated — it costs every future join.
- Hot rows: counters and inventory contend. Shard the counter, or queue the increments and reconcile.

## Queues and backpressure

- A queue decouples arrival rate from processing rate; it does not remove the work. Depth and age are the metrics — queue age is the one that predicts the outage.
- Consumers are idempotent, retried with backoff, and dead-lettered after N attempts. A DLQ with no owner and no review is a data swamp.
- Bound everything: queue size, concurrency, retries, timeouts. Unbounded retries turn one bad message into a self-inflicted DDoS.
- **Load shedding beats collapse**: reject at the edge with 429/503 when saturated, keep serving the requests you accepted.

## Rate limiting

Limit per identity and per IP, at the edge, with a documented budget and a `Retry-After`. Expensive endpoints (search, export, AI calls) get their own smaller quota. Rate limits are a product decision with a number attached, not an afterthought.

## Cost

Every scaling decision has a bill: egress, per-request pricing, replica hours, cache memory. State cost per 1k requests after the change; a 20% latency win that triples spend needs to be a conscious trade.

## Done when

You have a number for the bottleneck, a measured before/after, and a written note on the next limit you expect to hit.
