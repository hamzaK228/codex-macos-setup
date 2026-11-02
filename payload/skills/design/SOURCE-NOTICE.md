# Provenance and licensing

This repository consolidates skills authored by many different people. **Each skill
remains under its upstream license.** Nothing here relicenses third-party work; the
original copyright and terms travel with each `SKILL.md`.

## Sources

| Origin | Notes |
|---|---|
| [skills.sh](https://skills.sh) registry | Installed with `npx skills add`, including `anthropics/skills`, `vercel-labs/agent-skills`, `mattpocock/skills`, `emilkowalski/skill`, `nextlevelbuilder/ui-ux-pro-max-skill`, `pbakaus/impeccable`, `remotion-dev/skills`, `shadcn-ui/ui`, `heygen-com/hyperframes`, `trailofbits/skills`, `github/spec-kit` |
| [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) | Curated subset of a much larger collection |
| [MengTo/Skills](https://github.com/MengTo/Skills) | `build-awwwards-quality-sites`, MIT |
| [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) | `ponytail*` family |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | `graphify` skill; CLI installed separately |
| Local / authored here | `skill-router`, `yakit-yak`, `vizavi-motion` (user-supplied) |

## Caveats

- Several skills are **thin wrappers around external tooling** (`semgrep`, `codeql`,
  `graphify`, `yakit`). The skill text is included; the binaries are not.
- Some skills reference platform features of other agents (Claude Code hooks, slash
  commands). Those parts do not execute under DeepSeek Harness.
- Keep this repository **private** unless you have checked every upstream license and
  are comfortable republishing the content. Several upstreams are MIT, but not all
  were verified individually.

## Attribution

If you republish or redistribute, preserve each skill's original `SKILL.md` header and
link back to its upstream repository. Corrections and removals: open an issue.
