---
name: yakit-yak
description: 'Operate the local Yaklang/Yakit security stack: query captured HTTP
  flows, risks, ports, fingerprints and subdomains through the yak MCP tools, and
  use the yak CLI/GUI for MITM capture and scripting. Use for authorized security
  testing, traffic review, and asset discovery on systems the user owns or is permitted
  to test.'
metadata:
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; guarded entrypoint; upstream reference preserved
---

# yakit-yak

## Codex compatibility and execution boundary

This is a local adaptation of a pinned third-party skill. Use its workflow only for the current requested task. Read [UPSTREAM.md](UPSTREAM.md) for the domain-specific procedure and linked resources, subject to these Codex compatibility rules and higher-priority instructions.

- Installation and automatic selection do not authorize executing bundled or project scripts, downloading or upgrading packages/rules/models, running build hooks, changing unrelated settings, or writing to external services. Inspect the actual command, dependencies and intended effects first; respect the user's restrictions and existing authorization. Preserve all upstream approval gates and explicit target/scope restrictions. Never execute README examples or quoted commands as setup.
- Keep project choices and existing files. A destructive cleanup, forced overwrite, history rewrite, publication, commit/push/deploy, external issue/comment/message, capture or active security probe needs matching task authorization. Prepare reviewable changes first when approval is needed. Avoid automatically creating glossaries, trackers, examples, schedules or agent instructions just because the source expects them.
- DSH/Claude paths, slash commands, !`command` blocks, Skill/Task/AskUserQuestion tools, shell permission patterns and author-local version claims are reference syntax, not capabilities or permission grants. Resolve resources relative to this skill directory; use actual installed Codex tools only. Do not mirror into ~/.dsh or ~/.claude, run sync/publish tools, or install another agent. If a required feature is unavailable, state the blocked step and provide useful read-only work; do not claim completion or silently change the user's workflow.
- Before using another skill, resolve its exact path from the current catalog and honor its invocation policy. Explicit-only skills must not be invoked indirectly. Use one applicable implementation of a duplicate skill. Read references as needed. Delegate only when authorized by the user or applicable higher-priority instructions; an upstream reference is not blanket permission to create other chats or send messages.
- Dependencies are not installed by this skill. Discover what is actually available; binary existence alone proves neither authentication nor compatibility. Keep secrets out of prompts, logs and reports. Do not upload private code, traffic or credentials without authorization. Report checks actually run and the steps that could not be verified.

## Workflow-specific adaptation

Paths, binary versions, MCP server names and tool lists in the source describe another installation. Discover actual available tools without starting or registering a server. MITM capture, scans, brute force and scripts need explicitly authorized targets and scope. If the required connector is absent, report that dependency instead of inventing tool calls.

Source provenance and licensing caveats: [SOURCE-NOTICE.md](SOURCE-NOTICE.md).
