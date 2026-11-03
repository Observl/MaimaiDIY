# MaimaiDIY commerce integration roadmap

## Current scope

This PR adds a **non-transactional acrylic product configurator** to the existing static GitHub Pages editor. Pricing is RMB 30 for basic, RMB 40 for special, with first-order OR >=5 item 20% off, **never stacked**. The editor exports a frozen design **draft** for future integration. No purchase, payment, production, or manufacturing transfer is enabled.

**Rights gate:** the current repository includes third-party maimai/SEGA artwork and expressly disallows commercial reuse. A priced preview is not a license. Do not enable checkout, manufacturing or onward transfer for these assets without explicit commercial authorization, including user-uploaded images. Separate commercially licensed inventory and non-commercial design libraries.

## Why a backend is necessary

GitHub Pages serves static files; it cannot safely hold payment credentials, webhook secrets, order databases, or recipients' personal information. Deploy a dedicated HTTPS API with persistent Postgres and private object storage. Keep the editor static until the backend is ready.

## Future backend entities

- `users`: identity, authentication, consent timestamps.
- `designs` and immutable `design_versions`: owner, schema version, snapshot JSON, referenced immutable licensed asset versions, preview file key, rights validation result.
- `products`: variant, manufacturing capabilities, active price list and manufacturing dimensions.
- `orders` / `order_items`: order source (`web` or `xiaohongshu`), frozen design version IDs, unit prices, discount snapshot, quantity and lifecycle.
- `payments`: provider, unique transaction reference, amount, verified status, refund records. Never store raw payment credentials.
- `production_jobs`: one job per approved line item, files, supplier, approval and delivery history.
- `shipping_addresses`: encrypted/protected recipient info with narrow role access and retention controls.

## Proposed API contracts (not implemented)

1. `POST /api/designs`: authenticate; accept and sanitize typed design JSON; check ownership and asset allowlist; return immutable `designVersionId`.
2. `POST /api/quotes`: authenticated or guest quote; calculate server-side from canonical price table, quantity, server-confirmed new-customer eligibility and shipping.
3. `POST /api/orders`: idempotency key required; attach immutable designs; recompute all prices on server; create `pending_payment` order.
4. `POST /api/payments/{provider}/notify`: verify provider signature and original order amount; idempotently record transaction; change to `paid_pending_rights_review`. Never trust browser success URLs.
5. `POST /api/orders/{id}/production-approval`: require commercial rights, approved print-ready render + proof and verified payment before queueing production.
6. `POST /api/fulfillment/dispatch`: signed supplier adapter; supplier only receives necessary shipment fields; prevent duplicate job transmission; track receipts and logistics.
7. `POST /api/xhs/webhooks` or authorized ERP sync: verify platform authenticity; import XHS orders under `xiaohongshu` source, do **not** collect payment outside XHS for XHS orders.

## Manufacturing files

Use deterministic server-side rendering from validated snapshot and immutable assets. Generate separated `color.png`, `white-ink.png`, `spot-effects.png`, `outline.svg`, `preview.png` and `spec.json`, using actual vendor templates, bleed zones, color profiles and signed-off effect masks. Do not treat the current composited PNG as a production file. Special finish (UV varnish vs holographic foil) must be confirmed against factory equipment and quoted separately.

## Launch gates

1. Obtain commercial authorization for every relevant asset; licensing cannot be inferred from a user uploading or selecting it.
2. Validate actual factory capability, quotes, lead times and sample accuracy.
3. Confirm appropriate commerce entity, payment merchant account, Chinese ecommerce compliance and XHS category/API permissions.
4. Secure identity, private data, refunds, order state machine, idempotency, webhook signature verification and audit logs.
5. Test production render consistency, no duplicate fulfillment, failure recovery and returns.
6. Switch on live payment only behind a server-controlled capability gate once all above are signed off.

## Deployment

Keep existing GitHub Pages build for the editor. A separate backend can later be deployed under a dedicated HTTPS API domain. No secrets or private customer data should be committed to this repository.
