# Security and authorization

Security is not a review at the end; it is a set of properties that are cheap to design and expensive to retrofit.

## Trust boundaries

Draw the line where data changes trust level: browser → edge, edge → service, service → database, service → third party, webhook → service, queue → consumer. Everything crossing an untrusted boundary is parsed, validated, and authorized there. Inside the trusted zone, code passes structured data it created.

## Authentication

- Sessions in `HttpOnly`, `Secure`, `SameSite` cookies are the default for web apps. Short-lived access tokens plus a rotating refresh token suit APIs and mobile.
- Store passwords with a modern memory-hard hash (argon2id, bcrypt, scrypt) — never a general-purpose digest, never unsalted, never reversible.
- Password reset is an authorization surface: a single-use, expiring, hashed token; no user enumeration in responses.
- MFA for admin and support roles before it is a feature request.
- Tokens: verify signature, issuer, audience, expiry, and `nbf`; reject `alg: none` and algorithm confusion; rotate keys with a published `kid`.
- Logout invalidates server-side state, not just the cookie.

## Authorization

A separate decision from authentication, made per request, per row, per field.

| Model | Fits |
|---|---|
| RBAC | Roles map cleanly to capability sets |
| ABAC | Attributes (owner, region, plan, time) decide |
| ReBAC / relationship | Sharing, teams, hierarchies, document ACLs |

Rules:

- **Deny by default.** Every route, handler, and query starts closed; access is granted explicitly.
- **Enforce where the data is.** A check in the UI is a UX affordance; a check in the handler is one forgotten path away from a leak. Scope queries by tenant and owner in the data access layer so a missing check returns nothing rather than everything.
- **Object-level checks, not just route-level.** IDOR is the most common serious fullstack bug: `GET /invoices/123` must verify 123 belongs to the caller, not merely that the caller is logged in.
- **Field-level** when a record mixes public and private data: return a projected DTO, not the row.
- Tests for the negative case: user A cannot read, mutate, or enumerate user B's data. One test per role boundary.

## Input trust

- Validate shape and type at the edge; treat every string as hostile until used safely.
- Parameterized queries only. String-built SQL is a finding, not a style choice.
- File uploads: size, type by content sniffing, store outside the web root, serve with `Content-Disposition`, never execute.
- URLs and redirects: allowlist destinations; SSRF is a server fetching an attacker-chosen address, including `169.254.169.254` and internal ranges.
- Deserialization of untrusted data and template injection both end in remote code execution — keep them off the request path.

## Secrets

- Secrets live in a secret manager or environment, never in git, never in a client bundle, never in a log.
- `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_` prefixes mean public forever. Rotate anything that leaks, immediately, and assume it was read.
- Least privilege for database and cloud credentials: separate read-only and migration roles; no app credential with `DROP`.
- Scanning in CI (gitleaks or equivalent) plus a pre-commit hook; an accidental commit is the cheapest failure to prevent.

## Browser defenses

CSP without `unsafe-inline` where possible, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS, `frame-ancestors 'none'` unless embedding is a feature. CSRF tokens or `SameSite` for cookie auth. CORS as an explicit allowlist.

## Rate limits and abuse

Per identity and per IP at the edge; smaller quotas for expensive endpoints; login and reset endpoints throttled separately with lockout and alerting. Enumeration surfaces (signup, reset, invite) answer identically whether or not the record exists.

## Dependencies

Lockfiles committed; automated updates reviewed; audit CI on every build; no new dependency without checking maintenance and license. A transitive dependency is still code you ship.

## Logging and privacy

Never log tokens, passwords, full card numbers, or full request bodies with PII. Log the correlation id, the actor id, the action, and the outcome. Have a retention rule — logs are a database with a security posture too.

## Done when

Every entry point is authenticated where it must be, every data access is scoped to the actor, the negative tests exist, and no secret sits in a file, a bundle, or a log.
