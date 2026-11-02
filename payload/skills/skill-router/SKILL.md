---
name: skill-router
description: Resolve overlapping installed skills for a coding task or skill installation.
  Выбор подходящего скилла по смыслу задачи; использовать при неоднозначном выборе.
metadata:
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; reviewed local adaptation
---

# Select skills by task meaning

Choose from the current session's available names, descriptions, and invocation policies. Read a matching skill only when it materially helps. The user need not name it. If no skill fits, perform the task directly. Prefer one primary workflow and add distinct specialist guidance only as needed; there is no hard limit that could suppress required skills or checks.

Respect explicit-only policies, including `policy.allow_implicit_invocation: false` and existing `disable-model-invocation: true`. Never route implicitly into such a skill or load it indirectly through another skill. Do not enable, remove, rewrite, or install skills just to resolve a task overlap.

Use these defaults only when the named skill is actually available and the task matches:

| Task | Preferred workflow |
|---|---|
| Database → server → client, schema or API contract | senior-fullstack |
| Hard bug, regression, unexpectedly slow behavior | diagnosing-bugs |
| Requested test-first work or integration tests | tdd |
| Module interfaces, coupling, refactoring design | codebase-design |
| Domain terminology, glossary or ADR | domain-modeling |
| React/Next.js performance | vercel-react-best-practices; avoid loading a second copy for the same rules |
| General change review | code-review |
| PR title or description | pr; drafting is separate from publication |
| Requested commit-time checks | setup-pre-commit |
| New frontend visual direction | design-taste-frontend |
| Existing UI audit or polish | impeccable |
| Small interaction/component detail | emil-design-eng |
| Design tokens | design-system |
| Palette/font/style research | ui-ux-pro-max |
| React/CSS motion | motion |
| Animation jank | animation-performance |
| Reduced-motion support | accessible-animation |

Use provider skills (Supabase, Vercel, etc.) when that provider is part of the actual task. For security work, use available Codex Security skills with their exact scope: whole-repository scan, diff scan, supplied-finding triage, or explicitly requested fix. Preserve their activation and authorization requirements. Do not route ordinary bugs into security-fix workflows.

For duplicate skill names, choose one applicable maintained implementation from the session's catalog and read its exact path. Do not load both copies. Do not assume every skill on disk is enabled or visible to the model. Repository and user instructions retain their priority; existing stack choices prevail. Default coding requests are implementation work; switch to coaching only when requested. Selection authorizes no extra package installation, external write, commit, push, deployment, or destructive operation.
