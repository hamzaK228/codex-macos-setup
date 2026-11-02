---
name: setup-ts-deep-modules
description: Explicit invocation only. Configure dependency-cruiser rules for TypeScript
  package entry points and private internals. Только явный вызов для настройки границ
  TS-модулей.
metadata:
  source-repository: https://github.com/hamzaK228/dsh-skill-library
  source-commit: 61c9eb34cfd539fa9894824362af87da8de93d0a
  adapted-for: Codex; reviewed local adaptation
---

# Configure TypeScript module boundaries

Run only when the user explicitly invokes this skill. Inspect existing package structure, entry points, module format, dependency-cruiser configuration, package manager and check scripts. Preserve established layout; do not move packages or create a committed example package automatically.

For design vocabulary, read the installed codebase-design skill if useful. The supplied [dependency-cruiser.config.cjs](dependency-cruiser.config.cjs) is a template, not an executable installer. Review it and adapt paths to the real project. It contains five rules: application entry-point access, cross-package access, tests through entry points, private test fixtures, and cycle detection. Do not assume its flat-package model fits nested packages or TypeScript project references.

Prepare the minimal configuration diff. Merge existing rules and scripts, preserving any unrelated settings. Escape special regex characters in configured roots; ensure that group back-references and Windows path handling match the installed dependency-cruiser version. Verify current options against official documentation before applying.

Use an existing pinned dependency-cruiser when possible. If it is missing, explain the development dependency and follow the user's installation authorization. Respect prohibitions on third-party scripts and package execution. Selecting this skill does not authorize installing dependencies, changing project instructions, or publishing changes.

When tool execution is authorized, verify in a disposable fixture: allowed entry-point import passes, external deep import fails, internal import passes, a test deep import fails, test fixtures remain private, and a cycle fails. Remove only temporary files created by this verification. Run the project's existing checks after authorized changes. If dependencies are unavailable or scripts cannot run, report that the configuration has only been statically reviewed.

Document conventions only if documentation is in scope. Never automatically commit, push, replace AGENTS.md, or change CI beyond the requested scope.
