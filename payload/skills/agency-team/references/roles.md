# Specialist routing

Choose roles from the requested outcome, not keywords alone. Core roles below are common entry points, not the whole installed catalog. For another specialty, use `scripts/find_roles.py` against `catalog.json`; search Russian or English names and aliases. Read only selected profiles and references. Use one coordinator: usually the current parent; `agency_principal` is for a bounded coordination handoff, not mandatory overhead.

| Profile | Use when |
| --- | --- |
| `agency_principal` | Coordinating a bounded multi-specialist delivery |
| `agency_product` | Defining product scope, priorities, and acceptance criteria |
| `agency_frontend` | Building or changing browser UI and client behavior |
| `agency_backend` | Changing APIs, server rules, persistence, and reliability |
| `agency_ui` | Designing interface hierarchy, components, and visual states |
| `agency_ux` | Investigating user journeys, needs, and usability |
| `agency_reviewer` | Independent review of substantial changes |
| `agency_qa` | Verifying user journeys with reproducible evidence |
| `agency_marketing` | Positioning, acquisition, go-to-market, and experiments |
| `agency_content` | Copy, editorial plans, and content scripts |
| `agency_smm` | Social strategy, calendars, community, and post drafts |
| `agency_media` | Visual storytelling, campaign art direction, and multimedia briefs |
| `agency_video` | Video editing, captions, audio, and checked exports |
| `agency_image` | Image concepts, generation prompts, and inspected visual assets |
| `agency_compliance` | Relevant legal, privacy, license, or advertising-risk analysis |

Typical routing:

- Small isolated fix: parent performs it directly; use a reviewer only if the risk justifies one.
- Product feature: product or UX only if requirements remain unresolved; frontend/backend according to changed layers; independent review and proportional verification.
- Launch campaign: marketing sets strategy; content and media supply needed assets; SMM prepares channel variants. Compliance checks relevant claims, rights, and regional requirements.
- Video request: video specialist, with content or image help only when the brief actually needs it.
- Legal question: compliance analysis with current primary sources and any material jurisdiction clarification; no production team.

Preserve matching project profiles such as `office_principal`, `office_developer`, and `office_reviewer` when their local instructions fit. These global profiles do not connect AI Office's web task buttons or modify its saved catalog.

## Category routing beyond the core team

| Category | Typical deliverable |
| --- | --- |
| `academic` | Discipline-specific research, history, narrative, geography, anthropology |
| `design` | Brand, interface, experience, inclusive and visual design |
| `engineering` | Software implementation, architecture, operations, data and technical review |
| `finance` | Financial analysis, accounting, FP&A, tax and investment research |
| `game-development` | Unity, Unreal, Godot, Roblox, Blender and game systems |
| `gis` | Spatial analysis, cartography, geospatial pipelines and remote sensing |
| `healthcare` | Healthcare workflows and evidence with qualified human oversight |
| `marketing` | Channels, content, growth, SEO, social and creator work |
| `paid-media` | Advertising plans, campaign measurement and creative review |
| `product` | Product strategy, scope, discovery and priorities |
| `project-management` | Delivery planning, operations and stakeholder coordination |
| `research` | Literature review, source evaluation and evidence synthesis |
| `sales` | Sales strategy, account planning, discovery and enablement |
| `security` | Scoped security analysis, threat assessment and authorized validation |
| `spatial-computing` | XR, immersive interfaces and spatial interaction |
| `specialized` | Legal document review, privacy, pricing, domain-specific operations |
| `support` | Analytics, finance tracking, compliance, infrastructure and customer support |
| `testing` | QA, accessibility, performance, API tests and evidence |

Examples: financial modeling → `agency_finance_financial_analyst`; literature review → `agency_research_synthesist`; business analytics → `agency_support_analytics_reporter`; legal document review → `agency_specialized_legal_document_review`. Legal, financial, health and security profiles provide scoped analysis and drafts; installed titles confer no credentials, transaction authority, or permission for active testing.

The [full index](roles-index.md) lists all installed IDs grouped by category. Search it when discovery needs more detail; avoid reading the complete index for a routine core-team task.
