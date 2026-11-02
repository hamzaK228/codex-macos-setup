# Platform and delivery

Shipping is part of the engineering, not the part after it. A change nobody can deploy, observe, or roll back is not finished.

## Environments

Local, preview per PR, staging, production. Parity is the point: same container image, same runtime version, same migration mechanism, configuration as the only difference. Config and secrets come from the environment; anything else that differs between environments is a bug that will surface as a production-only failure.

## Containers

- One process per container, an explicit non-root user, a pinned base image digest, a health endpoint.
- Multi-stage builds: build dependencies do not ship; the image is small, deterministic, cache-friendly.
- `docker-compose` for local dependencies (database, queue, object storage); production orchestration (Kubernetes or a managed platform) only when you need scheduling, scaling, or rollout control — Kubernetes costs a specialist.
- Readiness versus liveness: readiness gates traffic, liveness restarts a stuck process. Conflating them causes restart storms.

## Configuration

Environment variables for deployment-varying values, committed defaults for everything else, startup validation that fails fast with a clear message. No `if (env === 'production')` branching inside business logic.

## CI

Stages, in cost order: lint and types → unit and contract → build → integration with real dependencies → E2E on the critical path → deploy. Every stage is reproducible locally with one command. Cache dependencies and build output; fail fast on the cheapest stage.

Branch protection: required checks, required review, no direct push to the deploy branch. The pipeline is the only path to production.

## Deploying migrations

Order matters and it is not reversible by redeploying the app:

1. Run migrations that expand (additive, backward compatible) before the new code starts.
2. Deploy code that tolerates both shapes.
3. Backfill and switch reads.
4. Remove the old shape in a later deploy.

Never let a deploy depend on a migration that has not run. Migrations are idempotent and versioned; a failed migration halts the rollout rather than booting a half-migrated app.

## Rollout

Blue/green or canary for anything risky; a percentage of traffic observed on real metrics before full promotion. Feature flags decouple deploy from release and give an instant kill switch — with an owner and an expiry date, because a permanent flag is a second codebase.

## Rollback

Every deploy has a written rollback: previous image, flag off, or forward-fix. Rehearse it once, not during the incident. Rollback must not require a down-migration you did not write.

## Observability

Three signals, all correlated by `requestId`:

- **Logs**: structured, one line per request, actor and outcome, no PII.
- **Metrics**: request rate, error rate, duration by route; queue depth and age; cache hit rate; database connections.
- **Traces**: one span per hop so a slow request shows which hop was slow.

Define SLOs for the paths users care about ("99.9% of checkout requests under 800 ms") and alert on burn rate, not on one noisy spike. Every alert names the runbook.

## Definition of done

- Tests, types, and lint green in CI.
- Migration applied on a production-like copy; rollback path written.
- Happy path and one failure path exercised in a real browser or client.
- Logs and metrics visible for the new path.
- Flag, alert, and rollback documented in the PR or handoff.
- Cost checked where the change is expensive per request.

## Reporting

A handoff states what now works, what was measured, what is risky, and what was deliberately deferred. A file list is not a summary. Name the artifact behind each claim — command output, request, screenshot — so the reader can check rather than trust.
