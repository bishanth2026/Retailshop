-- =====================================================================
-- SIMPLE RETAIL SHOP MANAGEMENT — SUPABASE SCHEMA
-- Run this whole file once in the Supabase SQL editor on a fresh project.
-- Safe to re-run: guarded with IF NOT EXISTS / DROP ... IF EXISTS where useful.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. SHOPS  (multi-shop ready, single shop used today)
-- ---------------------------------------------------------------------
create table if not exists shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  phone         text,
  currency      text not null default '₹',
  invoice_prefix text not null default 'INV',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. USERS  (extends auth.users, 1 row per login, belongs to one shop)
-- ---------------------------------------------------------------------
create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  shop_id     uuid not null references shops(id) on delete cascade,
  full_name   text not null,
  role        text not null check (role in ('admin','cashier')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helper: current user's shop_id (used by every RLS policy)
create or replace function current_shop_id()
returns uuid
language sql stable
as $$
  select shop_id from app_users where id = auth.uid()
$$;

create or replace function current_role_is_admin()
returns boolean
language sql stable
as $$
  select coalesce((select role = 'admin' from app_users where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- 3. CATEGORIES
-- ---------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (shop_id, name)
);

-- ---------------------------------------------------------------------
-- 4. PRODUCTS  (+ optional simple size/color variants for footwear etc.)
-- ---------------------------------------------------------------------
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  category_id     uuid references categories(id) on delete set null,
  name            text not null,
  subcategory     text,
  purchase_price  numeric(12,2) not null default 0,
  selling_price   numeric(12,2) not null default 0,
  stock_qty       numeric(12,2) not null default 0,   -- used when NOT variant-tracked
  min_stock       numeric(12,2) not null default 0,
  image_url       text,
  has_variants    boolean not null default false,     -- true = size/color tracked in product_variants
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_products_shop on products(shop_id);
create index if not exists idx_products_name on products using gin (to_tsvector('simple', name));

create table if not exists product_variants (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  size        text,
  color       text,
  stock_qty   numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_variants_product on product_variants(product_id);

-- ---------------------------------------------------------------------
-- 5. CUSTOMERS + LEDGER
-- ---------------------------------------------------------------------
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  name            text not null,
  mobile          text,
  address         text,
  opening_balance numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_customers_shop on customers(shop_id);

create table if not exists customer_transactions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  txn_date      date not null default current_date,
  description   text not null,
  debit         numeric(12,2) not null default 0,  -- increases balance owed (sale on credit)
  credit        numeric(12,2) not null default 0,  -- decreases balance owed (payment)
  reference_id  uuid,                               -- sale id / payment id
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_custxn_customer on customer_transactions(customer_id);

-- ---------------------------------------------------------------------
-- 6. SUPPLIERS + LEDGER
-- ---------------------------------------------------------------------
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  name            text not null,
  mobile          text,
  address         text,
  opening_balance numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_suppliers_shop on suppliers(shop_id);

create table if not exists supplier_transactions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  txn_date      date not null default current_date,
  description   text not null,
  debit         numeric(12,2) not null default 0,  -- payment we made (decreases what we owe)
  credit        numeric(12,2) not null default 0,  -- purchase on credit (increases what we owe)
  reference_id  uuid,
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_supxn_supplier on supplier_transactions(supplier_id);

-- ---------------------------------------------------------------------
-- 7. PURCHASES
-- ---------------------------------------------------------------------
create table if not exists purchases (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  supplier_id     uuid references suppliers(id) on delete set null,
  purchase_no     text not null,
  purchase_date   date not null default current_date,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  payment_method  text not null default 'credit' check (payment_method in ('cash','upi','card','credit')),
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now(),
  unique (shop_id, purchase_no)
);
create index if not exists idx_purchases_shop on purchases(shop_id);

create table if not exists purchase_items (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid not null references purchases(id) on delete cascade,
  product_id      uuid not null references products(id),
  variant_id      uuid references product_variants(id),
  quantity        numeric(12,2) not null,
  purchase_price  numeric(12,2) not null,
  line_total      numeric(12,2) not null
);
create index if not exists idx_pitems_purchase on purchase_items(purchase_id);

-- ---------------------------------------------------------------------
-- 8. SALES + INVOICE
-- ---------------------------------------------------------------------
create table if not exists sales (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  customer_id     uuid references customers(id) on delete set null,
  invoice_no      text not null,
  sale_date       timestamptz not null default now(),
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  payment_method  text not null default 'cash' check (payment_method in ('cash','upi','card','credit','split')),
  amount_paid     numeric(12,2) not null default 0,   -- for split/credit tracking
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now(),
  unique (shop_id, invoice_no)
);
create index if not exists idx_sales_shop on sales(shop_id);
create index if not exists idx_sales_date on sales(sale_date);

create table if not exists sale_items (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references sales(id) on delete cascade,
  product_id      uuid not null references products(id),
  variant_id      uuid references product_variants(id),
  product_name    text not null,       -- snapshot, so renaming a product later doesn't rewrite history
  quantity        numeric(12,2) not null,
  selling_price   numeric(12,2) not null,
  purchase_price  numeric(12,2) not null,  -- snapshot at time of sale, used for profit
  line_total      numeric(12,2) not null
);
create index if not exists idx_sitems_sale on sale_items(sale_id);

-- ---------------------------------------------------------------------
-- 9. SALES RETURNS
-- ---------------------------------------------------------------------
create table if not exists sales_returns (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  sale_id       uuid not null references sales(id),
  return_no     text not null,
  return_date   timestamptz not null default now(),
  total_refund  numeric(12,2) not null default 0,
  refund_mode   text not null default 'cash' check (refund_mode in ('cash','upi','card','customer_credit')),
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now(),
  unique (shop_id, return_no)
);

create table if not exists sales_return_items (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid not null references sales_returns(id) on delete cascade,
  sale_item_id    uuid not null references sale_items(id),
  product_id      uuid not null references products(id),
  variant_id      uuid references product_variants(id),
  quantity        numeric(12,2) not null,
  line_total      numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- 10. STOCK MOVEMENTS  (audit trail behind every stock change)
-- ---------------------------------------------------------------------
create table if not exists stock_movements (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  product_id    uuid not null references products(id),
  variant_id    uuid references product_variants(id),
  movement_type text not null check (movement_type in ('purchase','sale','return','damage','adjustment')),
  quantity      numeric(12,2) not null,     -- positive = increase, negative = decrease
  reason        text,
  reference_id  uuid,                        -- purchase_id / sale_id / return_id
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_stockmv_shop on stock_movements(shop_id);
create index if not exists idx_stockmv_product on stock_movements(product_id);

-- ---------------------------------------------------------------------
-- 11. PAYMENTS  (customer & supplier payments, logged centrally too)
-- ---------------------------------------------------------------------
create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  party_type      text not null check (party_type in ('customer','supplier')),
  party_id        uuid not null,
  amount          numeric(12,2) not null,
  payment_method  text not null default 'cash' check (payment_method in ('cash','upi','card')),
  note            text,
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 12. EXPENSES
-- ---------------------------------------------------------------------
create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  unique (shop_id, name)
);

create table if not exists expenses (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  category_id     uuid references expense_categories(id) on delete set null,
  expense_date    date not null default current_date,
  description     text,
  amount          numeric(12,2) not null,
  payment_method  text not null default 'cash' check (payment_method in ('cash','upi','card')),
  created_by      uuid references app_users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_expenses_shop on expenses(shop_id);

-- ---------------------------------------------------------------------
-- 13. SETTINGS  (one row per shop)
-- ---------------------------------------------------------------------
create table if not exists settings (
  shop_id         uuid primary key references shops(id) on delete cascade,
  low_stock_alert boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 14. AUDIT LOG  (lightweight, for accountability on deletes/edits)
-- ---------------------------------------------------------------------
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  user_id     uuid references app_users(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- TRIGGERS: keep stock, ledgers, and invoice numbers correct automatically
-- =====================================================================

-- ---- 15.1 Auto invoice / purchase / return numbers ----
create or replace function next_document_number(p_shop_id uuid, p_prefix text, p_table text)
returns text
language plpgsql
as $$
declare
  v_count int;
begin
  execute format('select count(*) from %I where shop_id = $1', p_table)
    into v_count using p_shop_id;
  return p_prefix || '-' || to_char(now(),'YYMM') || '-' || lpad((v_count+1)::text, 4, '0');
end;
$$;

-- ---- 15.2 Purchase saved -> increase stock + supplier ledger + stock_movements ----
create or replace function fn_purchase_item_after_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_shop_id uuid;
  v_created_by uuid;
begin
  select shop_id, created_by into v_shop_id, v_created_by from purchases where id = new.purchase_id;

  if new.variant_id is not null then
    update product_variants set stock_qty = stock_qty + new.quantity where id = new.variant_id;
  else
    update products set stock_qty = stock_qty + new.quantity, updated_at = now() where id = new.product_id;
  end if;

  insert into stock_movements (shop_id, product_id, variant_id, movement_type, quantity, reason, reference_id, created_by)
  values (v_shop_id, new.product_id, new.variant_id, 'purchase', new.quantity, 'Purchase received', new.purchase_id, v_created_by);

  return new;
end;
$$;
drop trigger if exists trg_purchase_item_after_insert on purchase_items;
create trigger trg_purchase_item_after_insert
  after insert on purchase_items
  for each row execute function fn_purchase_item_after_insert();

-- purchase total -> supplier ledger (credit = we now owe more)
create or replace function fn_purchase_after_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.supplier_id is not null and new.payment_method = 'credit' then
    insert into supplier_transactions (shop_id, supplier_id, txn_date, description, credit, reference_id, created_by)
    values (new.shop_id, new.supplier_id, new.purchase_date, 'Purchase ' || new.purchase_no, new.total, new.id, new.created_by);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_purchase_after_insert on purchases;
create trigger trg_purchase_after_insert
  after insert on purchases
  for each row execute function fn_purchase_after_insert();

-- ---- 15.3 Sale item saved -> decrease stock + stock_movements ----
create or replace function fn_sale_item_after_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_shop_id uuid;
  v_created_by uuid;
begin
  select shop_id, created_by into v_shop_id, v_created_by from sales where id = new.sale_id;

  if new.variant_id is not null then
    update product_variants set stock_qty = stock_qty - new.quantity where id = new.variant_id;
  else
    update products set stock_qty = stock_qty - new.quantity, updated_at = now() where id = new.product_id;
  end if;

  insert into stock_movements (shop_id, product_id, variant_id, movement_type, quantity, reason, reference_id, created_by)
  values (v_shop_id, new.product_id, new.variant_id, 'sale', -new.quantity, 'Sale', new.sale_id, v_created_by);

  return new;
end;
$$;
drop trigger if exists trg_sale_item_after_insert on sale_items;
create trigger trg_sale_item_after_insert
  after insert on sale_items
  for each row execute function fn_sale_item_after_insert();

-- sale total -> customer ledger (debit = customer owes more) only for credit/split unpaid balance
create or replace function fn_sale_after_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_balance_due numeric(12,2);
begin
  v_balance_due := new.total - coalesce(new.amount_paid,0);
  if new.customer_id is not null and v_balance_due > 0 then
    insert into customer_transactions (shop_id, customer_id, txn_date, description, debit, reference_id, created_by)
    values (new.shop_id, new.customer_id, new.sale_date::date, 'Sale ' || new.invoice_no, v_balance_due, new.id, new.created_by);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sale_after_insert on sales;
create trigger trg_sale_after_insert
  after insert on sales
  for each row execute function fn_sale_after_insert();

-- ---- 15.4 Sales return -> increase stock + customer credit ----
create or replace function fn_return_item_after_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_shop_id uuid;
  v_created_by uuid;
begin
  select shop_id, created_by into v_shop_id, v_created_by from sales_returns where id = new.return_id;

  if new.variant_id is not null then
    update product_variants set stock_qty = stock_qty + new.quantity where id = new.variant_id;
  else
    update products set stock_qty = stock_qty + new.quantity, updated_at = now() where id = new.product_id;
  end if;

  insert into stock_movements (shop_id, product_id, variant_id, movement_type, quantity, reason, reference_id, created_by)
  values (v_shop_id, new.product_id, new.variant_id, 'return', new.quantity, 'Sales return', new.return_id, v_created_by);

  return new;
end;
$$;
drop trigger if exists trg_return_item_after_insert on sales_return_items;
create trigger trg_return_item_after_insert
  after insert on sales_return_items
  for each row execute function fn_return_item_after_insert();

create or replace function fn_return_after_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id from sales where id = new.sale_id;
  if v_customer_id is not null and new.refund_mode = 'customer_credit' then
    insert into customer_transactions (shop_id, customer_id, txn_date, description, credit, reference_id, created_by)
    values (new.shop_id, v_customer_id, new.return_date::date, 'Return ' || new.return_no, new.total_refund, new.id, new.created_by);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_return_after_insert on sales_returns;
create trigger trg_return_after_insert
  after insert on sales_returns
  for each row execute function fn_return_after_insert();

-- ---- 15.5 Manual stock adjustment / damage -> movement drives stock directly ----
create or replace function fn_stock_movement_after_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.movement_type in ('adjustment','damage') then
    if new.variant_id is not null then
      update product_variants set stock_qty = stock_qty + new.quantity where id = new.variant_id;
    else
      update products set stock_qty = stock_qty + new.quantity, updated_at = now() where id = new.product_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stock_movement_after_insert on stock_movements;
create trigger trg_stock_movement_after_insert
  after insert on stock_movements
  for each row
  when (new.movement_type in ('adjustment','damage'))
  execute function fn_stock_movement_after_insert();

-- ---- 15.6 Direct customer / supplier payments -> ledger + payments log ----
create or replace function fn_payment_after_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.party_type = 'customer' then
    insert into customer_transactions (shop_id, customer_id, txn_date, description, credit, reference_id, created_by)
    values (new.shop_id, new.party_id, current_date, 'Payment received (' || new.payment_method || ')', new.amount, new.id, new.created_by);
  else
    insert into supplier_transactions (shop_id, supplier_id, txn_date, description, debit, reference_id, created_by)
    values (new.shop_id, new.party_id, current_date, 'Payment made (' || new.payment_method || ')', new.amount, new.id, new.created_by);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_payment_after_insert on payments;
create trigger trg_payment_after_insert
  after insert on payments
  for each row execute function fn_payment_after_insert();

-- =====================================================================
-- ROW LEVEL SECURITY — every shop's data is isolated to its own users
-- =====================================================================

alter table shops enable row level security;
alter table app_users enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table customers enable row level security;
alter table customer_transactions enable row level security;
alter table suppliers enable row level security;
alter table supplier_transactions enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sales_returns enable row level security;
alter table sales_return_items enable row level security;
alter table stock_movements enable row level security;
alter table payments enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table settings enable row level security;
alter table audit_logs enable row level security;

-- shops: user can only see their own shop.
-- insert is open to any signed-in user because a brand-new owner has no
-- shop_id yet at the moment they create their shop during sign-up.
drop policy if exists p_shops_select on shops;
create policy p_shops_select on shops for select using (id = current_shop_id());
drop policy if exists p_shops_update on shops;
create policy p_shops_update on shops for update using (id = current_shop_id() and current_role_is_admin());
drop policy if exists p_shops_insert on shops;
create policy p_shops_insert on shops for insert with check (auth.uid() is not null);

-- app_users: see people in your own shop.
-- insert is restricted to inserting your own row (self sign-up); admins can
-- still add teammates by inviting them and having them complete sign-up.
drop policy if exists p_users_select on app_users;
create policy p_users_select on app_users for select using (shop_id = current_shop_id());
drop policy if exists p_users_update on app_users;
create policy p_users_update on app_users for update using (shop_id = current_shop_id() and current_role_is_admin());
drop policy if exists p_users_insert on app_users;
create policy p_users_insert on app_users for insert with check (id = auth.uid());

-- Generic shop-scoped policies, applied to every business table.
-- Split by command (rather than one "for all" policy) so that the
-- admin-only DELETE policies further below can actually be *the*
-- delete policy for their table — Postgres OR's multiple permissive
-- policies together, so a permissive "for all" would otherwise still
-- let a cashier delete through it even with a stricter policy added.
do $$
declare
  t text;
  tables text[] := array[
    'categories','products','product_variants','customers','customer_transactions',
    'suppliers','supplier_transactions','purchases','sales','sales_returns',
    'stock_movements','payments','expense_categories','expenses','settings','audit_logs'
  ];
  delete_admin_only text[] := array['sales','purchases','expenses'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists p_%1$s_all on %1$s', t); -- clean up old-style policy if re-running
    execute format('drop policy if exists p_%1$s_select on %1$s', t);
    execute format('drop policy if exists p_%1$s_insert on %1$s', t);
    execute format('drop policy if exists p_%1$s_update on %1$s', t);
    execute format('drop policy if exists p_%1$s_delete on %1$s', t);

    execute format('create policy p_%1$s_select on %1$s for select using (shop_id = current_shop_id())', t);
    execute format('create policy p_%1$s_insert on %1$s for insert with check (shop_id = current_shop_id())', t);
    execute format('create policy p_%1$s_update on %1$s for update using (shop_id = current_shop_id()) with check (shop_id = current_shop_id())', t);

    if t = any(delete_admin_only) then
      execute format('create policy p_%1$s_delete on %1$s for delete using (shop_id = current_shop_id() and current_role_is_admin())', t);
    else
      execute format('create policy p_%1$s_delete on %1$s for delete using (shop_id = current_shop_id())', t);
    end if;
  end loop;
end $$;

-- child tables without their own shop_id: scope through the parent
drop policy if exists p_purchase_items_all on purchase_items;
create policy p_purchase_items_all on purchase_items for all
  using (purchase_id in (select id from purchases where shop_id = current_shop_id()))
  with check (purchase_id in (select id from purchases where shop_id = current_shop_id()));

drop policy if exists p_sale_items_all on sale_items;
create policy p_sale_items_all on sale_items for all
  using (sale_id in (select id from sales where shop_id = current_shop_id()))
  with check (sale_id in (select id from sales where shop_id = current_shop_id()));

drop policy if exists p_sales_return_items_all on sales_return_items;
create policy p_sales_return_items_all on sales_return_items for all
  using (return_id in (select id from sales_returns where shop_id = current_shop_id()))
  with check (return_id in (select id from sales_returns where shop_id = current_shop_id()));

-- Cashiers are already blocked from deleting sales/purchases/expenses by the
-- per-command loop above. Settings updates are further restricted to admins only
-- (overrides the generic update policy's USING clause with an extra AND):
drop policy if exists p_settings_update on settings;
create policy p_settings_update on settings for update using (shop_id = current_shop_id() and current_role_is_admin()) with check (shop_id = current_shop_id() and current_role_is_admin());

-- =====================================================================
-- SEED HELPERS (run manually once, after creating your first auth user)
-- =====================================================================
-- 1) Sign up your first user from the app's login screen (Supabase Auth).
-- 2) Then run, replacing the placeholders:
--
--   insert into shops (name, address, phone) values ('My Shop','Shop Address','9999999999')
--     returning id;  -- copy this id
--
--   insert into app_users (id, shop_id, full_name, role)
--     values ('<auth-user-uuid-from-Authentication-tab>', '<shop-id-from-above>', 'Owner Name', 'admin');
--
--   insert into settings (shop_id) values ('<shop-id-from-above>');
--
--   insert into expense_categories (shop_id, name)
--     values ('<shop-id>','Rent'), ('<shop-id>','Electricity'), ('<shop-id>','Salary'),
--            ('<shop-id>','Transport'), ('<shop-id>','Packing'), ('<shop-id>','Repairs'),
--            ('<shop-id>','Internet'), ('<shop-id>','Other');
--
--   insert into categories (shop_id, name)
--     values ('<shop-id>','Fancy'), ('<shop-id>','Footwear'), ('<shop-id>','Cosmetics'),
--            ('<shop-id>','Gifts'), ('<shop-id>','Stationery'), ('<shop-id>','Toys'),
--            ('<shop-id>','Accessories'), ('<shop-id>','Other');
-- =====================================================================
