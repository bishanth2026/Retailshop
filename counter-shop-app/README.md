# Counter — Simple Retail Shop Management

A complete, working shop management app: HTML5 + CSS3 + vanilla JavaScript on the
front end, Supabase (Postgres + Auth + Row Level Security) as the backend.
No build step — open `index.html` (or host the folder) and it runs.

## What's included

- **schema.sql** — the full database: tables, indexes, triggers, and Row Level
  Security policies. Run once in your Supabase project.
- **index.html / css/styles.css** — the app shell and visual design.
- **js/** — the application code:
  - `supa.js` — Supabase client
  - `auth.js` — sign in, owner sign-up, cashier sign-up (join existing shop)
  - `state.js` — the current session/shop/role
  - `db.js` — every database query and business operation, grouped by module
  - `ui.js` — shared toast/modal/table helpers
  - `app.js` — router + sidebar + shell wiring
  - `views/*.js` — one file per screen (Dashboard, Products, Stock, Purchases,
    Suppliers, Sales/POS, Sales History, Customers, Expenses, Reports, Settings)

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Open the **SQL Editor** → paste in the entire contents of `schema.sql` → Run.
   This creates every table, the stock/ledger triggers, and Row Level Security
   policies that keep each shop's data private.
3. Go to **Project Settings → API** and copy your **Project URL** and
   **anon public key**.

## 2. Connect the app

Open `js/config.js` and fill in:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

Never paste the `service_role` key here — only the `anon` key belongs in
frontend code. Row Level Security is what keeps data safe, not key secrecy.

By default, Supabase Auth requires email confirmation for new sign-ups. For a
quick local trial, you can turn this off in **Authentication → Providers →
Email → Confirm email** (toggle off) so the owner sign-up form logs you
straight in. Turn it back on before giving this to real users.

## 3. Run it

Any static file server works, e.g. from this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. You can also just double-click
`index.html`, though some browsers restrict ES module imports over `file://`
— a local server avoids that.

## 4. First login

Click **"First time here? Create the owner account"**, fill in your shop name
and your details, and submit. This automatically:

- creates your `shops` row,
- creates your `admin` user profile,
- seeds default categories (Fancy, Footwear, Cosmetics, Gifts, Stationery,
  Toys, Accessories, Other) and expense categories (Rent, Electricity,
  Salary, Transport, Packing, Repairs, Internet, Other).

## 5. Add a cashier

In **Settings**, copy the **Shop ID**. Give it to your cashier. On the sign-in
screen they choose *"A cashier — joining an existing shop"*, paste the Shop
ID, and create their own login. Cashiers only see Dashboard, Sales/Billing,
Sales History, and Customers, and can't delete sales, purchases, or expenses
(enforced both in the UI and in the database's Row Level Security policies).

## How the data flows (matches the brief's workflow)

- **Purchase saved** → a database trigger increases product stock, logs a
  `stock_movements` row, and (for credit purchases) adds to the supplier's
  ledger — automatically, not from client-side math.
- **Sale completed** → triggers decrease stock, log the movement, and (for
  unpaid/credit balance) add to the customer's ledger.
- **Return processed** → triggers increase stock back and optionally credit
  the customer's account. The original sale is never modified.
- **Manual adjustment / damage** → logged as a `stock_movements` row, which
  itself drives the stock change, so every change to stock has a reason on
  record.
- **Profit** — computed from the actual purchase price captured on each sale
  line at the time of sale (not today's price), so historical profit stays
  correct even if prices change later.

Every number on the Dashboard and in Reports is a live query against Supabase
— nothing is hardcoded.

## Notes on scope / simplifications

- Footwear-style size/color tracking is supported per product as an optional
  toggle ("Track by size / color"), not forced on every item.
- "Split payment" is simplified to: choose Credit, then enter how much was
  paid right now — the remainder is tracked as customer credit. This covers
  the common real case (partial cash + rest on account) without a separate
  multi-tender screen.
- Team invites use a shared **Shop ID** rather than emailed invite links,
  since creating other users' logins from the browser would require exposing
  a service-role key. This keeps the "never expose service-role keys in
  frontend code" rule intact.
- The schema is multi-shop ready (`shop_id` on every table, enforced by RLS)
  even though the UI currently drives one shop per login.
