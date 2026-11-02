---
name: design-md
description: Library of 74 real-world design systems as DESIGN.md files (Apple, Linear, Stripe, Airbnb, Notion, Vercel, Tesla, Supabase, Raycast, Framer, and more). Use when the user wants UI that looks/feels like a specific known brand or product ("make it look like Linear", "Apple-style", "in the style of Stripe"), asks for a DESIGN.md, wants to borrow an established design language, or wants visual consistency with a reference product. Each DESIGN.md carries analyzed patterns, tokens, and rules for consistent AI-generated UI.
---

# Design.md — brand design-system library

`design-md/` contains one directory per brand, each with a `DESIGN.md` (and sometimes a `README.md`). A DESIGN.md is Google Stitch's plain-text design-system format: the analyzed patterns, tokens, and rules of a real product's design language, written for AI agents to read directly. No parsing or tooling needed — read it and build against it.

## How to use

1. **Pick the brand.** List `design-md/` if the requested brand isn't obvious. Match the closest fit when the exact brand is absent (e.g. "Notion-style" for a docs tool, "Linear-style" for a dev tool), and say which you chose and why.
2. **Read the full DESIGN.md** for the chosen brand — not just the token section. The patterns, motion rules, and anti-patterns are what make it feel like the real thing.
3. **Apply it as the design system**: derive palette, type, spacing, radii, elevation, and motion from it verbatim; keep its tone in the copy. Where it conflicts with a user brief, the brief wins — note the deviation.
4. **Stay consistent** across the whole build: every component, state, and empty/error view should read as the same product.

## Notes

- `.md` files only — nothing here needs to be installed or parsed at runtime.
- The per-brand `README.md` (when present) is context about the analysis, not part of the design system; skim only if the DESIGN.md is unclear.
- If the user asks for a brand that doesn't exist here, say so and either build a fresh system (pair with the other installed design skills) or check whether the repo has added it since (`https://github.com/voltagent/awesome-design-md`).
