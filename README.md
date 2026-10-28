# Charlotte Esthy — Point of Sale

Web-based point of sale, receipt management, inventory and sales analytics.

> *Created during internship at Hamplus Hub*

### Sign in

Open `/login` and sign in with the email and password you registered (or create an account at `/register`).
Every business is private: the app never opens a workspace automatically and never signs you in without your
credentials. Forgot your password? See **Password recovery for a private account** below.

Charlotte Esthy is a multi-business POS: owners register a business, invite managers and cashiers, sell from a
responsive checkout screen, print / download / share receipts, track stock with a full movement history, and
review analytics built from real database values.

---

## Architecture (and one deliberate deviation from the brief)

The brief prefers React + Vite + Supabase. This workspace is a **Next.js 16 (App Router) + PostgreSQL (Drizzle ORM)**
platform, so the app uses that native stack instead:

| Concern | Brief | What is implemented |
| --- | --- | --- |
| Frontend | React + Vite + Tailwind + shadcn/ui | React 19 + Next.js + Tailwind CSS 4 with a small in-house component set (`src/components/ui.tsx`) |
| Database | Supabase PostgreSQL | PostgreSQL via Drizzle ORM (`src/db/schema.ts`) — works with any Postgres, including Supabase-hosted Postgres via `DATABASE_URL` |
| Auth | Supabase Auth | Own auth: scrypt-hashed passwords, SHA-256-hashed session tokens, `httpOnly` cookies. Email verification on sign-up. A cookie-independent credential is returned at login (same 14-day lifetime) so browsers that reject cookies in an embedded frame stay signed in across preview reloads. |
| Authorisation / RLS | Supabase RLS | Server-enforced permission matrix + every query scoped by the session's business (see *Security*). Optional Postgres RLS policies in `db/rls/enable_rls.sql` |
| Charts / PDF | Recharts / PDF lib | Recharts, jsPDF + jspdf-autotable |

```
src/
  app/(auth)/        login, register, forgot/reset password
  app/(app)/         dashboard, pos, sales, products, customers, reports, team, settings
  app/api/           JSON route handlers (all go through src/lib/api.ts)
  components/        UI kit, app shell, receipt, charts
  db/schema.ts       relational schema (Drizzle)
  lib/               auth, permissions, money maths, receipts, PDF, services (checkout, refunds, reports)
drizzle/             generated SQL migration (0000_init.sql)
db/rls/              optional Row Level Security policies
scripts/seed-demo.ts explicitly-labelled demo data
tests/               unit, DB integration and HTTP authorisation tests
```

## Features

* **Auth & access** — register (creates a business, you become *owner*), **email verification** on sign-up,
  login, logout, 14-day persistent sessions, password reset, profile & password change, owner / manager / cashier
  roles, protected routes, login throttling. Registration confirms the account and then you sign in with the same
  credentials; it never signs you in silently.
* **Dashboard** — today's net revenue, transactions, average sale, low-stock count, recent transactions, best sellers,
  revenue trend by day/week/month, date-range filter, empty state for new accounts. Cashiers see only their own sales.
* **POS** — search by name/SKU/barcode (barcode scanners work: scan + Enter), categories, product images, cart with
  stock validation, percentage / fixed discounts, configurable tax (exclusive or inclusive), cash / transfer / card,
  change calculation, confirmation dialog with live receipt preview, double-submit protection, cart cleared only after
  the sale is saved.
* **Receipts** — unique configurable numbering, logo & business details, thank-you message, 58 mm / 80 mm / A4 layouts,
  browser print (print-only layout), PDF download, WhatsApp share link, reprint any receipt, searchable history with
  filters (date, cashier, payment method, status, receipt number).
* **Products & inventory** — create / edit / archive (never hard-delete), SKU, barcode, category, cost & price,
  low-stock thresholds, stock adjustments with reasons, movement history, valuation at cost and retail.
* **Customers** — records with purchase history, linked to sales. **Only an owner** can add, edit or delete customer
  records; managers/cashiers may view and select existing customers when selling.
* **Refunds & cancellations** — partial / full refunds and whole-sale cancellation by managers/owners, optional restock,
  reason required, audit-logged. Completed sales are never deleted.
* **Reports** — daily/weekly/monthly sales, product performance, inventory valuation, payment methods,
  discounts & refunds, cashier performance, CSV + PDF export, CSV export of sales/items/inventory from the server.
* **Team & settings** — **owner-only** creation of team members with temporary passwords, role changes, disabling
  accounts, password resets and customer changes; business identity, receipt details (separate from the app brand), currency, timezone, tax, numbering, stock rules,
  activity (audit) log.
* **UX** — responsive sidebar / drawer / bottom navigation, breadcrumbs, search, low-stock notifications, loading
  skeletons, empty and error states, toasts, confirmation dialogs, keyboard-accessible native `<dialog>` modals,
  visible focus rings, offline banner.

## Security model

* **Server-enforced permissions** — every API route is wrapped by `route({ permission })` in `src/lib/api.ts`. It
  resolves the authenticated session (or the explicitly enabled, isolated preview owner), active membership and role,
  then checks the permission matrix (`src/lib/permissions.ts`). Hidden buttons are cosmetic only. Only owners may add
  team members and create/edit/delete customers.
* **Audit trail** — sales, refunds, cancellations, price changes, stock adjustments, role/password changes, exports and
  settings changes are recorded in `audit_events` (viewable by owners/managers in Settings → Activity log).

### Row Level Security

`db/rls/enable_rls.sql` defines `business_id = current_setting('app.business_id')` policies for every business-owned
table. They are **not active by default** because the app connects as the database owner/superuser (which bypasses RLS)
and does not yet set `app.business_id` per transaction. To enable them: apply the file, connect with a non-superuser
role that belongs to `ce_app`, and call `select set_config('app.business_id', $1, true)` at the start of each request
transaction. Until then, isolation relies on the application-layer scoping described above.

## Getting started

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then edit DATABASE_URL
npm run db:push                 # create/update tables (or apply drizzle/0000, 0001 and 0002 SQL in order)
npm run dev                     # http://localhost:3000
```

Open `/register` to create your business, then sign in at `/login` with those credentials. `/` simply redirects to
`/dashboard` when you are signed in and to `/login` when you are not.

### Accounts and email verification

`/register` creates the account and business, shows **“Your account has been created successfully”**, and then sends
you to sign in with the credentials you chose. When email delivery is configured, the account is only usable after you
open the emailed verification link (`/verify-email?token=…`, single-use, 24 hours); unverified sign-in attempts are
rejected. When email delivery is **not** configured the address cannot be confirmed, so the account is recorded as
verified and the success screen says so explicitly — otherwise nobody could ever sign in. Accounts created before
verification existed are treated as verified, so existing logins keep working.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (server only) |
| `APP_URL` | for email recovery | Trusted HTTPS application origin used in reset links, e.g. `https://pos.example.com` |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | Resend API key and verified sender address. All three settings enable **email verification on sign-up** and password-reset emails. |

When mail is unconfigured the website creates **no** reset token and sends **no** email; it never reveals a reset link to an unauthenticated user or
prints one in server logs. Only a business **owner** can set a staff member's password via **Team & permissions**;
managers cannot. Do not commit `.env`; configure secrets in your host's dashboard.

### Password recovery for a private account

**Set up email delivery:** Create and verify a sending domain in [Resend](https://resend.com), then configure
`RESEND_API_KEY`, `EMAIL_FROM` (for that verified domain) and `APP_URL` (your trusted HTTPS site origin). Restart the
server. The public `/forgot-password` form will then offer a one-hour single-use email link. The response never confirms
whether a particular email address belongs to an account. If the provider rejects a request, the unused token is
deleted and only a non-secret provider error is logged.

**If you operate this server and cannot configure email yet:** From a trusted shell with `DATABASE_URL` configured,
reset a verified private account with:

```bash
npm run account:reset -- --email=owner@example.com
```

This **operator-only CLI**, not a website endpoint, displays one randomly generated temporary password in the terminal.
Deliver it privately to the verified account owner; they should change it immediately under Settings → My account.
The command revokes all of that user's existing sessions, handoff tickets and reset links, and writes an audit event.
Never paste the temporary password into chat, a support ticket, Git or application logs. The shared developer-preview
identity cannot be reset through this command.

### Database & migrations

* Schema source of truth: `src/db/schema.ts`.
* `npm run db:generate` writes SQL migrations to `drizzle/`; `0000_init.sql` is the initial schema and
  `0001_auth_handoff.sql` adds single-use sign-in tickets, and `0002_embedded_sessions.sql` adds the
  cookie-independent fallback sessions. Apply all migrations in order on a new database.
* `npm run db:push` applies the current schema directly (development / first deployment).
* Tables: `users, sessions, embedded_sessions, password_resets, businesses, business_settings (receipt settings), memberships (roles),
  auth_handoffs, categories, products, customers, sales, sale_items, payments, inventory_movements, refunds, refund_items,
  audit_events` with foreign keys, unique constraints (per-business SKU, receipt number, idempotency key),
  check constraints (non-negative prices, valid quantities) and indexes for common queries.
* The role/permission matrix lives in code (`src/lib/permissions.ts`) and is displayed in **Team & permissions**.

### Demo data (optional, clearly separated)

```bash
npm run seed:demo           # creates ONE business named "DEMO — …" with sample products and 14 days of sales
npm run seed:demo -- --reset
```

Demo logins (password `DemoPass123!`): `demo.owner@charlotteesthy.test`, `demo.manager@charlotteesthy.test`,
`demo.cashier@charlotteesthy.test`. These seeded sample transactions belong to a **third** business, distinct from
your registered business. Seeded transactions
are never created automatically.
Delete it with `--reset`, or by removing that business; do not run the seed against a database holding live data you
cannot afford to touch the demo accounts of.

## Testing

```bash
npm test                                         # unit + database integration tests
E2E_BASE_URL=http://localhost:3000 npm test      # additionally runs HTTP auth/authorisation/isolation tests
npm run lint
npx tsc --noEmit
npm run build
```

Covered: checkout maths (discounts, tax inclusive/exclusive, change, rounding), receipt numbering and rendering
(including 58 mm / 80 mm widths), WhatsApp link encoding, CSV injection safety, role permissions and navigation, password
and token hashing, stock deduction, concurrent checkouts (no overselling), duplicate submissions, partial/full refunds
and cancellations, business data isolation, database constraints, and — against a running server — login failures,
401/403 enforcement, cross-business access (404), cashier restrictions, logout invalidation, pasted-code redemption,
registration without silent sign-in, email-verification gating of login, cookie-independent login sessions, protected API access, CSV export with bearer credentials, owner-only team/customer writes, preview-host opt-in,
no automatic/passwordless access on any host, unavailable-email responses with no token creation,
operator-only password recovery with session revocation and audit logging, and session revocation after logout or
password change.

Integration tests use the database in `DATABASE_URL` and delete everything they create. Not covered by automation:
visual/responsive behaviour in real browsers and physical printing — verify those manually.

## Deployment

1. Provision PostgreSQL (e.g. Neon, Supabase Postgres, Railway, RDS) and note its connection string.
2. Choose a Node host (Vercel, Render, Railway, Fly.io, a VPS with Node ≥ 20 behind Nginx/Caddy).
3. Set `DATABASE_URL` in the host's secret store. To enable email recovery, also configure `APP_URL`, `RESEND_API_KEY`
   and `EMAIL_FROM` together.
4. Run `npm ci && npm run db:push` once against the production database, then `npm run build && npm start`.
5. Serve over **HTTPS** and make sure the reverse proxy forwards `X-Forwarded-Proto` (the session cookie is marked
   `Secure` only when it sees `https`) and `X-Forwarded-For`.
6. Register the first account (it becomes the owner), then configure **Settings → Business & receipts / Currency & tax**.

## Limitations (honest list)

* **Cookie restrictions.** A third-party preview may block embedded cookies; the app automatically uses a
  cookie-independent session of the same 14-day length, kept in tab storage so preview reloads stay signed in.
  If that browser blocks all storage too, only in-memory navigation works and a reload needs a fresh sign-in —
  there is no separate sign-in link or code. A cold visit always shows a plain sign-in prompt; the "session ended"
  message appears only when a previously working session is actually rejected.
* **No offline mode.** When the browser is offline a banner appears and sales are blocked; nothing is queued or
  synchronised later. Data is shared across devices through the cloud database in real time on each request, with no
  push updates — other screens refresh on navigation or reload.
* **Supabase Auth/RLS are not used** (see *Architecture*). Postgres RLS policies are provided but opt-in.
* **Password-reset email requires configuration** (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`). Without it, password recovery requires the owner-only team reset or the trusted server-operator CLI described above. Every account still signs in normally with its own password.
* **WhatsApp sharing is a link** (`wa.me`) that pre-fills a message; the user must press *Send* in WhatsApp.
* One payment method per sale (no split payments); quantities are whole numbers; one business per account session.
* Login throttling is in-memory per server instance. For several instances use a shared store (e.g. Redis).
* Stock is changed only by sales, refunds and adjustments; there is no purchase-order or supplier module.
* Receipt printing relies on the browser's print dialog; direct ESC/POS printing is not implemented.
* Timezone and currency are per business; amounts on a past receipt keep the currency in which they were issued.
