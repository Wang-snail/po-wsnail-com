# Codex Project Rules

## Product Scope

This repository powers `po.wsnail.com`, the Amazon new-product opportunity judgment tool. Treat it as a decision product, not only an analysis dashboard.

Core flow:

1. User uploads raw seller/export tables.
2. Data is cleaned, merged by ASIN, tagged, and checked for confidence.
3. Market, competition, price, ROI, risk, and tail opportunities are analyzed.
4. The page outputs a clear decision, next actions, evidence, and optional validation details.

## Product Principles

- Keep the first screen decision-first: can this product be done, why, and what should the seller do next.
- Do not expose long scoring or calculation details above the main decision.
- Keep ROI, charts, data sources, and scoring logic available in collapsed validation sections.
- Preserve rule transparency. Prefer explicit business rules over opaque explanations.
- Mainstream path and tail opportunity are separate conclusions.
- Tail opportunity rule: review count below 50 and monthly sales above 200 indicates a possible long-tail opening.
- Free sample reports must be visible without login and must not consume credits.
- Full report generation from user-uploaded data must deduct credits server-side only.

## Engineering Constraints

- Do not rewrite the system or introduce a new framework unless explicitly requested.
- `index.html` currently contains the main UI, upload parsing, analysis logic, and report rendering.
- `_worker.js` handles Cloudflare Pages Functions APIs, account login, D1 persistence, credits, orders, and admin endpoints.
- Keep `po_users` as the public-site user source of truth. `hou.wsnail.com` reads PO users through the `po.wsnail.com` admin API.
- Do not hard-code `ADMIN_APPROVE_TOKEN` in frontend code.
- Do not collect or send user-uploaded product data to third-party services unless the user explicitly asks for that feature.
- Avoid new dependencies unless there is a clear need.

## Deployment Notes

- Public frontend/project: `/Users/woniu/dm/进化网站/sites/po-wsnail-com`
- Local MVP mirror: `/Users/woniu/dm/进化网站/workspace/亚马逊电商系统/analyzer/opportunity-mvp`
- Admin frontend: `/Users/woniu/dm/进化网站/sites/hou-wsnail-com`
- Deploy PO site with `wrangler pages deploy . --project-name po-wsnail-com --commit-dirty=true`.
- Deploy admin site with `npm run build`, then `wrangler pages deploy dist --project-name hou-wsnail-com --commit-dirty=true`.
