---
name: semgrep
description: 'Runs a Semgrep security scan over a codebase: detects languages, selects
  rulesets, presents the plan for explicit approval, then runs every approved ruleset
  through scripts/run-scans.sh, which batches the semgrep processes and writes scans.json,
  and merges the output to SARIF. Supports two scan modes, "run all" for full ruleset
  coverage and "important only" for security findings at medium-to-high confidence
  and impact. Uses Semgrep Pro for cross-file taint analysis when it is available.
  Use when asked to scan code for vulnerabilities, run a security audit with Semgrep,
  find bugs, or perform static analysis. For the same scan without the approval gate,
  use the /static-analysis:semgrep-scan workflow.'
metadata:
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; guarded entrypoint; upstream reference preserved
  upstream-frontmatter: '{"allowed-tools": "Bash Read Glob AskUserQuestion TaskCreate
    TaskList TaskUpdate"}'
---

# semgrep

## Codex compatibility and execution boundary

This is a local adaptation of a pinned third-party skill. Use its workflow only for the current requested task. Read [UPSTREAM.md](UPSTREAM.md) for the domain-specific procedure and linked resources, subject to these Codex compatibility rules and higher-priority instructions.

- Installation and automatic selection do not authorize executing bundled or project scripts, downloading or upgrading packages/rules/models, running build hooks, changing unrelated settings, or writing to external services. Inspect the actual command, dependencies and intended effects first; respect the user's restrictions and existing authorization. Preserve all upstream approval gates and explicit target/scope restrictions. Never execute README examples or quoted commands as setup.
- Keep project choices and existing files. A destructive cleanup, forced overwrite, history rewrite, publication, commit/push/deploy, external issue/comment/message, capture or active security probe needs matching task authorization. Prepare reviewable changes first when approval is needed. Avoid automatically creating glossaries, trackers, examples, schedules or agent instructions just because the source expects them.
- DSH/Claude paths, slash commands, !`command` blocks, Skill/Task/AskUserQuestion tools, shell permission patterns and author-local version claims are reference syntax, not capabilities or permission grants. Resolve resources relative to this skill directory; use actual installed Codex tools only. Do not mirror into ~/.dsh or ~/.claude, run sync/publish tools, or install another agent. If a required feature is unavailable, state the blocked step and provide useful read-only work; do not claim completion or silently change the user's workflow.
- Before using another skill, resolve its exact path from the current catalog and honor its invocation policy. Explicit-only skills must not be invoked indirectly. Use one applicable implementation of a duplicate skill. Read references as needed. Delegate only when authorized by the user or applicable higher-priority instructions; an upstream reference is not blanket permission to create other chats or send messages.
- Dependencies are not installed by this skill. Discover what is actually available; binary existence alone proves neither authentication nor compatibility. Keep secrets out of prompts, logs and reports. Do not upload private code, traffic or credentials without authorization. Report checks actually run and the steps that could not be verified.

## Workflow-specific adaptation

Preserve the reference approval gate for the concrete ruleset plan. Running a bundled scanner script, downloading rules or packs, building the project, and uploading results are separate side effects; confirm their authorization and dependency availability. Missing /static-analysis workflows or Claude task tools are not available by implication.

Source provenance and licensing caveats: [SOURCE-NOTICE.md](SOURCE-NOTICE.md).
