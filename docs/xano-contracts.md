# Verified Xano contracts used by the frontend

Source of truth: the Phase 2A Xano Authentication Contract Verification audit
(an inspection of the Xano workspace, 2026-11-07). Nothing here was inferred
from the frontend; if Xano changes, this file and `src/lib/xano/auth.ts` change
together. Fields not listed are not relied on.

Authentication API group: `/api:QKPf7var` (`src/lib/xano/groups.ts`).

## POST `/auth/signup` — customer registration

Public. Creates a `user` with role `customer`, `is_active: true`,
`status: "active"` and a linked `customers` row. The role is fixed server-side;
the endpoint accepts no role input.

Request (JSON): `name` (text, optional on the backend; required by this
frontend), `email` (trimmed and lower-cased by Xano), `password`.

Success 200: `{ "authToken": "<token>", "user_id": <number> }`.

Errors: 400 `{ "message": "Email is required." }`;
403 `{ "message": "An account with this email already exists." }`.

## POST `/auth/login`

Public. Request (JSON): `email`, `password`.

Success 200: `{ "authToken": "<token>", "user_id": <number> }`. Token lifetime
24 hours. No refresh, no server-side logout or revocation endpoint.

Errors: 403 `{ "message": "Invalid Credentials." }` (unknown email or wrong
password, uniform); 403 `{ "message": "This account has been deactivated. Please contact support." }`
when `is_active` is false or `status` is not `"active"`.

## GET `/auth/me` — current user (authoritative)

Requires `Authorization: Bearer <authToken>`. Re-reads the user row on every
call and refuses accounts that are not both `is_active` and `status: "active"`,
so a 200 from this endpoint is the eligibility check.

Success 200 fields used by the frontend: `role` (one of `customer`,
`event_planner`, `staff`, `manager`, `admin`) and `is_active` (boolean).
Also present and passed through when well-typed: `id`, `name`, `email`.
`status` is **not** returned and is never read. `experience` is not used for
routing.

Errors: 401 for a missing or invalid bearer token;
403 `{ "message": "This account is inactive." }`.

## Not available (do not build against)

Event planner signup, staff/manager access requests, approvals, admin
provisioning, token refresh, logout/revocation.
