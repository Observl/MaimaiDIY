# MaimaiDIY staging commerce API

This is a **backend development starting point**, not a deployed store. It intentionally does not process payments or send production jobs.

## Local startup

1. Install Node 22+ and PostgreSQL. Create the `maimaidiy` database and a restricted database user.
2. Run the SQL migration at `server/schema/001_commerce.sql`.
3. Create a development user in `commerce_users` with a UUID and set its ID in `COMMERCE_DEMO_USER_ID`.
4. `cd server && npm install && npm test`.
5. Set `DATABASE_URL`, `COMMERCE_API_TOKEN` (32+ random characters) and `COMMERCE_DEMO_USER_ID`, then `npm start`.
6. Requests need `Authorization: Bearer <COMMERCE_API_TOKEN>` except GET /health. Never put this token in browser JavaScript.

## Implemented routes

- `GET /health`: DB readiness and feature gate status.
- `POST /api/quotes`: backend-validated product quote. Does **not** trust new-customer flags from requests.
- `POST /api/designs`: demo user-only immutable snapshot save, rights status pending.
- `GET /api/designs/:id`: demo user-only retrieval.
- Payment/orders/fulfillment endpoints respond 503 explicitly. They are **not** mocked into a fake success.

## Security limits and next work

The demo token is a server-to-server shared key, **not** user authentication. Bind only to localhost behind a controlled development environment, do not expose publicly. Before production, implement identity/session auth, per-user access control, migrations and backups, verified payment callbacks, server-side newcomer eligibility, idempotent paid orders, private object storage, signed factory adapters, input asset allowlisting, and XHS order permissions. The current editor still runs on GitHub Pages with checkout disabled.
