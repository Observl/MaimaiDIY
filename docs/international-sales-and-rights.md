# International sales, rights and fulfillment gate

This document is implementation guidance, not a clearance opinion.

## IP and product separation

The existing maimai-themed editor is explicitly non-commercial. Do not treat a user's JSON template, uploaded photo, own redraw or a disclaimer as commercial authorization. Sega's maimai DX and CHUNITHM promotional material pages specifically prohibit producing goods for sale without permission. Sega's gameplay video guidelines do not grant physical merchandising licenses.

A future commercial API must use an **allowlist of licensed/original asset versions**. Each design version records its sources, territorial permission, category permission, license expiry, and approval history. Unknown or noncommercial assets must fail closed. The browser's rights flags are untrusted hints, not authorizations.

Licenses must expressly cover manufacture, online sale, overseas territories, derivatives and approved factories. Game logos/titles may additionally raise trademark and consumer confusion issues.

## Overseas launch

- Select countries, payment providers, parcel delivery, customs/import rules and consumer returns before enabling shipping.
- Check applicable marketplace terms and product safety for LED bases; electrical equipment may require destination-specific testing and labeling.
- Show landed shipping costs, import tax responsibility, lead time and currency conversion before payment.
- Customer-design uploads and fulfillment address transfer require privacy controls and supplier data agreements.
- Maintain separate language/localization and address validation; do not assume the China storefront is globally compliant.

## Business priorities

1. Validate a licensed/original product catalog for acrylic base (¥30 / ¥40), clear stand (+¥4), LED base (+¥20) and holographic card (¥15), with independently quoted costs.
2. Test clear stand and foil card first. Verify LED base illumination, dimensions, electrical safety and transit breakage.
3. Retain China Xiaohongshu store checkout in-platform. Independent website payments remain separate. Import only via authorized XHS merchant APIs.
4. Payment and production stay disabled until rights, merchant account, supplier specs and backend security are verified.
