---
name: yakit-yak
description: "Operate the local Yaklang/Yakit security stack: query captured HTTP flows, risks, ports, fingerprints and subdomains through the yak MCP tools, and use the yak CLI/GUI for MITM capture and scripting. Use for authorized security testing, traffic review, and asset discovery on systems the user owns or is permitted to test."
---

# Yaklang / Yakit

Local install on this machine:

- Engine CLI: `~/.local/bin/yak` (version 1.4.9-beta3)
- GUI: `~/.local/bin/yakit` (AppImage at `~/.local/opt/yakit/Yakit.AppImage`)
- Data dir: `~/.yakit/yakit`
- MCP server: `yak mcp` over stdio, exposed in DSH as server `yak`

## MCP tools available

`query_http_flow`, `set_tag_for_http_flow`, `delete_http_flow`,
`query_risks`, `query_new_risks`, `query_risk`, `delete_risk`, `set_tag_for_risk`,
`query_fingerprint`, `create_fingerprint`, `update_fingerprint`, `delete_fingerprint`,
`port_scan`, `query_ports`, `delete_ports`,
`subdomain_collection`, `screenshot`.

These read the local Yakit database or act on the network. Review arguments before
calling `port_scan`, `subdomain_collection` or `screenshot`: they send traffic to
targets. Never point them at a host without explicit authorization.

## Workflow

1. Capture or import traffic in the Yakit GUI (`yakit`) via the MITM proxy.
2. Ask the agent to query the captured flows with `query_http_flow` (filter by
   URL, method, status, tags) instead of re-fetching the target.
3. Turn interesting flows into findings with `query_risks` / `query_risk`.
4. Fingerprints and port results persist in the same database and are queryable
   later.

## CLI notes

- `yak version` — build info
- `yak mcp -h` — list every tool set (`codec, cve, httpflow, port_scan,
  reverse_shell, reverse_platform, http_fuzzer, risk, yso, syntaxflow, mitm,
  fingerprint, browser_extension, screenshot, hybrid_scan, payload,
  yak_document, yak_script, brute, subdomain, crawler, ssa, project_database,
  global_hotpatch, system_proxy, dynamic`)
- `yak mcp -t <sets>` — start MCP with a narrower set than the default
- `yak script <file.yak>` — run a Yak script; `yak help` lists built-in libraries

## Rules

- Only test assets the user owns or has written permission to test.
- Prefer reading existing captures over generating new traffic.
- Do not disable TLS verification or proxy settings globally.
- Never paste credentials found in flows into chat; redact them.
