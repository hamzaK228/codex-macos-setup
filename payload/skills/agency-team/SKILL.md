---
name: agency-team
description: Coordinate approved multi-step projects with a minimal Agency team across software, design, marketing, analytics, finance, legal research, and other installed specialties. Match roles to deliverables; skip factual questions and isolated edits needing no delegation.
license: MIT; upstream notice in references/LICENSE
---

# Agency Team

## Efficiency by default

The user currently prioritizes effective use of their Codex allowance. Decide whether delegation adds enough value for the actual task; do not delegate merely because a role exists or a task has several steps.

- Handle simple, tightly coupled work directly. Delegate when a specialist materially improves correctness, provides needed independent review, or can complete useful independent work concurrently.
- No fixed one-agent or serial-only limit: use multiple agents in parallel when independent tasks justify the combined model work and coordination cost. Avoid duplicate investigation, overlapping ownership, and agents created only to repeat the parent’s checks.
- Give each agent a bounded deliverable and only the context it needs. Prefer a short explicit handoff over inheriting the entire conversation when supported. Request concise findings, evidence, and limitations rather than long logs.
- Reuse completed investigation and verification. Repeat a check after a relevant change, failure, or unresolved concern; keep meaningful tests and required independent review. Saving tokens must not mean skipping necessary work.
- Apply the same decision to follow-up assignments. Close completed agents when no useful follow-up remains. Do not claim measured savings or alter models, reasoning settings, billing, or provider routing without applicable authorization.

## Agree, then execute

1. Apply the user's task-agreement workflow. Present the concrete scope and acceptance criteria before implementation when required. Treat an explicitly approved parent assignment as approval for its bounded subtask and ordinary checks. An answer to an optional question is not scope approval.
2. After approval, choose the smallest useful team using [core roles and category routing](references/roles.md). The installed catalog contains 283 roles in 18 categories. When the task calls for another specialty, search `references/catalog.json` with `python3 scripts/find_roles.py --query "<specialty>"` (optionally `--category <category>`); `--categories` returns category counts. Select by mission and deliverable, then read only the chosen profile. The [full role index](references/roles-index.md) is for targeted lookup when a name is unknown; avoid loading the entire catalog or all upstream prompts. The user has requested automatic specialist selection and delegation for approved project work. Keep trivial work and tightly dependent steps in the parent; do not launch the entire catalog or repeat approval per agent.
3. Discover the current environment's delegation tools and profiles. Prefer a matching project profile when its instructions fit. Otherwise use the global `agency_*` profiles in `~/.codex/agents/`. If a tool cannot select a custom profile by name, read only the chosen TOML's `developer_instructions` and pass those instructions with the bounded assignment to an available subagent. State that this is an explicit instruction handoff, not proof of native profile discovery. If delegation is unavailable, perform feasible work in the parent and report the limitation.
4. Give each specialist the approved goal, expected deliverable, acceptance criteria, inputs, dependencies, file ownership, and relevant authorization. Request a concise handoff with actual evidence and limitations. Share only context required for the assignment. Use subagents inside the current chat; create separate user-owned chats only when the user asks.
5. When delegation passes the efficiency decision above, parallelize independent investigations or disjoint file edits. Sequence coupled changes and use a single writer for overlapping files. The parent retains coordination; do not create recursive coordinator chains.
6. Use a separate reviewer for substantial implementation and QA where the changed user journey warrants it. Reviewers report to the coordinator independently of the author. Resolve supported findings and recheck affected behavior; do not impose finding quotas, arbitrary revision cycles, or unsupported release claims.
7. Deliver the integrated result with relevant checks actually run, remaining findings, and decisions requiring the owner. Configuration files, plans, drafts, prompts, and screenshots alone are not evidence of execution, publication, generated media, or backend correctness.

## Capability and authority boundaries

Load task-relevant skills from the live catalog, preserving explicit-only policies and the project's stack. Installed role instructions do not install tools, grant connections, or inherit paid API access. Models and permissions follow the parent; review-only prose is not a separate sandbox.

For additional model inference through the installed local FreeLLMAPI router, use `__CODEX_HOME__/skills/freellmapi/SKILL.md`. Inspect health and usable configuration first; preserve the task's data/provider authorization and free-use limits. This is an optional HTTP tool, not a replacement for the parent model or native subagents. Missing provider keys are a configuration dependency, not a reason to invent results or silently switch providers.

Marketing, content, and SMM default to reviewable plans and drafts. Publication, messages, scheduling posts, advertising spend, account changes, installs, commits, pushes, deployment, and destructive operations require applicable task authorization. Do authorized preparation first, then ask only for the missing final authorization. Existing authorization persists.

For project risks involving data, licenses, advertising claims, commerce, or regulated activity, route the relevant part to `agency_compliance`. Identify jurisdiction and material missing facts; verify current requirements using primary sources. Preserve owner decisions and professional-review needs. Never guarantee legality or treat a generic checklist as compliance certification.

Media specialists must use available production skills and inspect actual exports. Distinguish a concept, prompt, script, rendered asset, and published result.

## Installed catalog and maintenance

[Machine catalog](references/catalog.json) is the UI and discovery source of truth; [manifest](references/manifest.json) maps every discovered source to one profile with SHA-256 hashes. Domain frontmatter identifies roles; README, docs, examples, integrations, scripts, and strategy templates are excluded. Existing fifteen profile files remain byte-for-byte unchanged. New names use stable `agency_<category>_<role>` IDs.

`python3 scripts/install_profiles.py --verify` checks all bundled sources and installed profiles without writes. Running it without `--verify` installs missing profiles with exclusive creation and refuses differing existing files. It needs only Python standard-library modules and never runs upstream scripts or accesses the network. New standalone profiles may require a new Codex turn/session to appear; files and successful validation do not prove availability to a particular live tool. No role registry or model override is added.

## Upstream references

Profiles are adapted from `msitarzewski/agency-agents` at a fixed commit, not installed as unrestricted upstream prompts. [Manifest](references/manifest.json) records provenance; [license](references/LICENSE) retains the upstream MIT notice. Read only the selected source reference when additional domain detail is useful. Source examples, tools, ports, and commands remain reference material, not execution authorization.
