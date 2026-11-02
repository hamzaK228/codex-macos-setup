# Learn the layer below

> What I cannot create, I do not understand. — Richard Feynman

You can use a framework every day and still be unable to say what it does. Re-implementing the smallest honest version of a layer is how that gap closes: the abstractions stop being magic and become decisions you could have made.

Source list: [codecrafters-io/build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) (CC0) — browse it as [gitingest](https://gitingest.com/codecrafters-io/build-your-own-x) for plain text or [gitdiagram](https://gitdiagram.com/codecrafters-io/build-your-own-x) for the structure.

## Pick by the layer that feels like magic

| When this feels opaque | Build this | What it demystifies | Size |
|---|---|---|---|
| `app.get('/x', handler)` | A web server over raw sockets | Request parsing, headers, keep-alive, routing, middleware | Weekend |
| Anything rendered server-side | A template engine | Interpolation, escaping, the SSR pipeline | Evening |
| `SELECT` with a `WHERE` | A B-tree or log-structured KV store | Pages, indexes, why a missing index scans | Week |
| Redis, TTLs, cache keys | A Redis-like server (RESP) | Protocol, expiry, eviction, single-threaded speed | Week |
| `git commit`, branches | A Git client (`gitlet`, `ugit`, `pygit`) | Content addressing, the DAG, refs | Weekend |
| React hooks and re-renders | A tiny React (`didact`, `build-your-own-react`) | Elements, reconciliation, hook state, why keys matter | Weekend |
| Why a regex can hang a server | A regex engine (NFA/DFA) | Backtracking, ReDoS, automata | Weekend |
| Queues, retries, at-least-once | A Kafka-like log broker | Offsets, partitions, replay, delivery guarantees | Week |
| Load balancers, health checks | A TCP load balancer | Connection handling, upstream selection, timeouts | Evening |
| Containers | Docker in ~100 lines (`bocker`, `mocker`) | Namespaces, cgroups, chroot, images | Weekend |
| Shell, `fork`, pipes | A shell in C or Rust | Process model, file descriptors, signals | Weekend |
| Memory, pointers, GC | A memory allocator, a tiny GC | Heap layout, fragmentation, reachability | Week |
| TCP handshakes, packets | A TCP/IP stack | Framing, reliability, congestion, sockets | Month |
| Tokens, sessions, OAuth | An SSO server, a JWT verifier | Session vs token, signing, expiry, redirects | Weekend |
| Search that is not `LIKE` | An inverted index, TF-IDF | Tokenization, ranking, the cost of fuzzy | Weekend |
| Parse errors you cannot explain | `the-super-tiny-compiler`, a Lisp | Lexing, parsing, ASTs, evaluation | Evening |
| The OS itself | `nand2tetris`, a tiny kernel | Layers from gates to syscalls | Semester |

Links for each are in the source list; prefer the entry in the language you actually write, and prefer a guide with tests.

## Rules that keep it a learning project

- **One at a time, timeboxed.** A weekend or a week, then stop. A half-finished KV store that taught you indexes beat a finished OS that ate a semester.
- **Finish the smallest honest version** — the one that passes its own tests — then stop. Do not add replication, clustering, or a query optimizer.
- **Write the tests first and read the reference implementation after**, not before. Reading the answer first converts learning into transcription.
- **Pair it with the real thing you use.** Building a B-tree while you use Postgres makes every `EXPLAIN` legible. That pairing is the point, not the artifact.
- **Keep a one-page write-up**: what the real system adds beyond your version, and one decision you would steal.
- **It is not a portfolio piece.** The output is a changed mental model plus a write-up; publishing is optional, understanding is not.

## A sequence for a CS student, alongside fullstack work

1. HTTP server → template engine: how a request becomes HTML.
2. KV store / B-tree → why the query planner cares.
3. Git: the tool you use daily and understand least.
4. Tiny React: what the framework is actually doing per render.
5. Regex engine or tiny compiler: parsing, the pattern behind every config file and DSL.
6. Shell → containers: the process and isolation model your deploys sit on.
7. TCP stack or OS: only if the systems courses pull you there.

Roughly one per term, woven into the fullstack work rather than replacing it — the projects you ship teach judgement, the from-scratch builds teach causation.

## How this shows up in a session

When the user hits a layer they cannot explain, name the two-line version of it in the conversation, then point at the matching row above as the follow-up. Never assign a project mid-task; capture it, finish the slice, and hand it over at the end.
