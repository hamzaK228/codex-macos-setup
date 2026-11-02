---
name: token-economy
description: Reduce context and response tokens when the user requests token economy, minimal context, or concise execution.
---

# Token economy

Minimize total tokens needed to finish the task correctly, including tool output and retries.

- Reuse available context, established facts, and completed checks.
- Find paths with `rg --files` and symbols with scoped `rg -n`. Read focused ranges; expand only when dependencies or uncertainty require it.
- Load only applicable skills and references. Avoid dumping catalogs, repositories, long logs, generated files, or lockfiles into context.
- Bound tool output; request selected fields or summaries. Preserve decisive errors, locations, and evidence. Narrow queries when output truncates.
- Batch independent lookups and reuse results. Repeat checks only after relevant changes or new evidence. Avoid unchanged status polling.
- Use the smallest sufficient edit and focused verification. Avoid speculative features, auxiliary artifacts, and delegation solely for completeness.
- State routine assumptions briefly and proceed when safe. Ask only when the answer materially changes the result.
- Keep required updates brief. Final response: outcome, meaningful verification, and unresolved blockers; usually 1–5 sentences. Avoid repeating plans, logs, or code available in artifacts. Expand when requested.
- Preserve required research, authorization, safety, and validation. Never claim unmeasured token savings. This skill guides behavior; it does not change model settings, billing, or platform context injection.
