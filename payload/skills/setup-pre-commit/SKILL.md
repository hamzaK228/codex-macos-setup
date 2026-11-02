---
name: setup-pre-commit
description: 'Set up or repair requested pre-commit checks: Husky, lint-staged, formatting,
  type checks, and tests. Настройка проверок перед коммитом.'
metadata:
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; reviewed local adaptation
---

# Set up pre-commit checks

Use only for a request to configure commit-time checks. First inspect package.json, lockfiles (including bun.lock), existing hooks, lint-staged, formatter configuration, and repository instructions. Preserve the existing package manager and tooling; do not introduce Husky if the project already has a suitable hook system.

Prefer existing pinned local tools. If a dependency is missing, explain which development dependency is needed, choose a compatible version from current official documentation, and follow the user's installation authorization. A skill being selected is not permission to download or execute third-party code. Respect any prohibition on third-party scripts; provide the prepared changes and blocked verification when necessary.

Merge minimal changes into the existing hook and package scripts. Preserve existing prepare commands and format settings. Run formatting only on the intended staged files and use the existing typecheck/test scripts where suitable. Avoid slow full-suite hooks when existing CI is the appropriate check. Never use an unpinned npx fallback that silently downloads a missing executable.

Inspect and explain the hook before running it. Hooks, package lifecycle scripts, and lint-staged may execute project code and modify staged files. Verify in an isolated fixture or using a documented non-mutating check where possible; report what was actually verified. Do not stage all files, commit, push, or change unrelated files as a verification step.
