---
name: design
description: Create brand assets, logos, icons, corporate identity material, or visual
  design deliverables when requested. UI-only work can use the existing frontend skills;
  generation scripts require provider dependencies.
license: MIT
metadata:
  author: claudekit
  version: 2.1.0
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; guarded entrypoint; upstream reference preserved
  upstream-frontmatter: '{"argument-hint": "[design-type] [context]"}'
---

# design

## Codex compatibility and execution boundary

This is a local adaptation of a pinned third-party skill. Use its workflow only for the current requested task. Read [UPSTREAM.md](UPSTREAM.md) for the domain-specific procedure and linked resources, subject to these Codex compatibility rules and higher-priority instructions.

- Installation and automatic selection do not authorize executing bundled or project scripts, downloading or upgrading packages/rules/models, running build hooks, changing unrelated settings, or writing to external services. Inspect the actual command, dependencies and intended effects first; respect the user's restrictions and existing authorization. Preserve all upstream approval gates and explicit target/scope restrictions. Never execute README examples or quoted commands as setup.
- Keep project choices and existing files. A destructive cleanup, forced overwrite, history rewrite, publication, commit/push/deploy, external issue/comment/message, capture or active security probe needs matching task authorization. Prepare reviewable changes first when approval is needed. Avoid automatically creating glossaries, trackers, examples, schedules or agent instructions just because the source expects them.
- DSH/Claude paths, slash commands, !`command` blocks, Skill/Task/AskUserQuestion tools, shell permission patterns and author-local version claims are reference syntax, not capabilities or permission grants. Resolve resources relative to this skill directory; use actual installed Codex tools only. Do not mirror into ~/.dsh or ~/.claude, run sync/publish tools, or install another agent. If a required feature is unavailable, state the blocked step and provide useful read-only work; do not claim completion or silently change the user's workflow.
- Before using another skill, resolve its exact path from the current catalog and honor its invocation policy. Explicit-only skills must not be invoked indirectly. Use one applicable implementation of a duplicate skill. Read references as needed. Delegate only when authorized by the user or applicable higher-priority instructions; an upstream reference is not blanket permission to create other chats or send messages.
- Dependencies are not installed by this skill. Discover what is actually available; binary existence alone proves neither authentication nor compatibility. Keep secrets out of prompts, logs and reports. Do not upload private code, traffic or credentials without authorization. Report checks actually run and the steps that could not be verified.

## Workflow-specific adaptation

The bundled logo/icon/CIP scripts can call paid third-party APIs. Inspect dependencies and requested output before suggesting them. Do not repair or execute bundled scripts automatically after a failure. Existing image generation tools may be used only when they fit the task and applicable instructions; never silently substitute a paid provider or upload private assets.

Source provenance and licensing caveats: [SOURCE-NOTICE.md](SOURCE-NOTICE.md).
