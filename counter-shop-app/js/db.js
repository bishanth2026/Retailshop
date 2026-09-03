import { supabase } from "./supa.js";
import { state, shopId } from "./state.js";

function sid() { return shopId(); }

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

async function nextNumber(prefix, table) {
  const { data, error } = await supabase.rpc("next_document_number", {
    p_shop_id: sid(), p_prefix: prefix, p_table: table
  });
  if (error) throw error;
  return data;
}

// =====================================================================
// CATEGORIES
// =====================================================================
export const Categories = {
  async list() {
    return must(supabase.from("categories").select("*").eq("shop_id", sid()).order("name"));
  },
  async create(name) {
    return must(supabase.from("categories").insert({ shop_id: sid(), name }).select().single());
  },
  async rename(id, name) {
    return must(supabase.from("categories").update({ name }).eq("id", id).select().single());
  },
  async remove(id) {
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
    if (count && count > 0) throw new Error(`Can't delete — ${count} product(s) still use this category.`);
    return must(supabase.from("categories").delete().eq("id", id));
  }
};

// =====================================================================
// PRODUCTS + VARIANTS
// =====================================================================
export const Products = {
  async list({ search = "", categoryId = "", activeOnly = false } = {}) {
    let q = supabase.from("products").select("*, categories(name)").eq("shop_id", sid()).order("name");
    if (search) q = q.ilike("name", `%${search}%`);
    if (categoryId) q = q.eq("category_id", categoryId);
    if (activeOnly) q = q.eq("active", true);
    return must(q);
  },
  async get(id) {
    return must(supabase.from("products").select("*, categories(name)").eq("id", id).single());
  },
  async create(payload) {
    return must(supabase.from("products").insert({ ...payload, shop_id: sid() }).select().single());
  },
  async update(id, payload) {
    return must(supabase.from("products").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id).select().single());
  },
  async setActive(id, active) {
    return must(supabase.from("products").update({ active }).eq("id", id));
  },
  async remove(id) {
    return must(supabase.from("products").delete().eq("id", id));
  },
  async lowStock() {
    const rows = await must(supabase.from("products").select("*").eq("shop_id", sid()).eq("active", true));
    return rows.filter(p => Number(p.stock_qty) <= Number(p.min_stock));
  }
};

export const Variants = {
  async listForProduct(productId) {
    return must(supabase.from("product_variants").select("*").eq("product_id", productId).order("size"));
  },
  async create(productId, { size, color, stock_qty = 0 }) {
    return must(supabase.from("product_variants").insert({ shop_id: sid(), product_id: productId, size, color, stock_qty }).select().single());
  },
  async remove(id) {
    return must(supabase.from("product_variants").delete().eq("id", id));
  }
};

// =====================================================================
// STOCK
// =====================================================================
export const Stock = {
  async adjust({ productId, variantId = null, qty, type, reason }) {
    // type: 'adjustment' | 'damage'  (qty can be negative for damage/decrease)
    return must(supabase.from("stock_movements").insert({
      shop_id: sid(), product_id: productId, variant_id: variantId,
      movement_type: type, quantity: qty, reason, created_by: state.profile.id
    }));
  },
  async movementsForProduct(productId, limit = 50) {
    return must(supabase.from("stock_movements").select("*, app_users(full_name)").eq("product_id", productId).order("created_at", { ascending: false }).limit(limit));
  },
  async recentMovements(limit = 100) {
    return must(supabase.from("stock_movements").select("*, products(name), app_users(full_name)").eq("shop_id", sid()).order("created_at", { ascending: false }).limit(limit));
  }
};

// =====================================================================
// SUPPLIERS
// =====================================================================
export const Suppliers = {
  async list(search = "") {
    let q = supabase.from("suppliers").select("*").eq("shop_id", sid()).order("name");
    if (search) q = q.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`);
    return must(q);
  },
  async get(id) { return must(supabase.from("suppliers").select("*").eq("id", id).single()); },
  async create(payload) { return must(supabase.from("suppliers").insert({ ...payload, shop_id: sid() }).select().single()); },
  async update(id, payload) { return must(supabase.from("suppliers").update(payload).eq("id", id).select().single()); },
  async remove(id) { return must(supabase.from("suppliers").delete().eq("id", id)); },
  async balance(id) {
    const supplier = await this.get(id);
    const txns = await must(supabase.from("supplier_transactions").select("*").eq("supplier_id", id).order("txn_date"));
    const net = txns.reduce((b, t) => b + Number(t.credit) - Number(t.debit), 0);
    return Number(supplier.opening_balance) + net;
  },
  async transactions(id) {
    return must(supabase.from("supplier_transactions").select("*").eq("supplier_id", id).order("txn_date").order("created_at"));
  },
  async recordPayment(id, amount, method, note) {
    return must(supabase.from("payments").insert({
      shop_id: sid(), party_type: "supplier", party_id: id, amount, payment_method: method, note, created_by: state.profile.id
    }));
  },
  async outstandingTotal() {
    const rows = await must(supabase.from("suppliers").select("id, opening_balance, supplier_transactions(debit,credit)").eq("shop_id", sid()));
    return rows.reduce((sum, s) => {
      const net = (s.supplier_transactions || []).reduce((b, t) => b + Number(t.credit) - Number(t.debit), 0);
      return sum + Number(s.opening_balance) + net;
    }, 0);
  }
};

// =====================================================================
// CUSTOMERS
// =====================================================================
export const Customers = {
  async list(search = "") {
    let q = supabase.from("customers").select("*").eq("shop_id", sid()).order("name");
    if (search) q = q.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`);
    return must(q);
  },
  async get(id) { return must(supabase.from("customers").select("*").eq("id", id).single()); },
  async create(payload) { return must(supabase.from("customers").insert({ ...payload, shop_id: sid() }).select().single()); },
  async update(id, payload) { return must(supabase.from("customers").update(payload).eq("id", id).select().single()); },
  async remove(id) { return must(supabase.from("customers").delete().eq("id", id)); },
  async balance(id) {
    const customer = await this.get(id);
    const txns = await must(supabase.from("customer_transactions").select("*").eq("customer_id", id).order("txn_date"));
    const net = txns.reduce((b, t) => b + Number(t.debit) - Number(t.credit), 0);
    return Number(customer.opening_balance) + net;
  },
  async transactions(id) {
    return must(supabase.from("customer_transactions").select("*").eq("customer_id", id).order("txn_date").order("created_at"));
  },
  async recordPayment(id, amount, method, note) {
    return must(supabase.from("payments").insert({
      shop_id: sid(), party_type: "customer", party_id: id, amount, payment_method: method, note, created_by: state.profile.id
    }));
  },
  async outstandingTotal() {
    const rows = await must(supabase.from("customers").select("id, opening_balance, customer_transactions(debit,credit)").eq("shop_id", sid()));
    return rows.reduce((sum, c) => {
      const net = (c.customer_transactions || []).reduce((b, t) => b + Number(t.debit) - Number(t.credit), 0);
      return sum + Number(c.opening_balance) + net;
    }, 0);
  },
  async purchaseHistory(id) {
    return must(supabase.from("sales").select("*, sale_items(*)").eq("customer_id", id).order("sale_date", { ascending: false }));
  }
};

// =====================================================================
// PURCHASES
// =====================================================================
export const Purchases = {
  async create({ supplierId, date, items, discount = 0, paymentMethod = "credit" }) {
    const purchase_no = await nextNumber("PUR", "purchases");
    const total = items.reduce((s, it) => s + it.quantity * it.purchase_price, 0) - Number(discount || 0);
    const purchase = await must(supabase.from("purchases").insert({
      shop_id: sid(), supplier_id: supplierId || null, purchase_no, purchase_date: date,
      discount, total, payment_method: paymentMethod, created_by: state.profile.id
    }).select().single());

    const rows = items.map(it => ({
      purchase_id: purchase.id, product_id: it.productId, variant_id: it.variantId || null,
      quantity: it.quantity, purchase_price: it.purchase_price, line_total: it.quantity * it.purchase_price
    }));
    await must(supabase.from("purchase_items").insert(rows));
    return purchase;
  },
  async list({ from, to, supplierId } = {}) {
    let q = supabase.from("purchases").select("*, suppliers(name), purchase_items(*)").eq("shop_id", sid()).order("purchase_date", { ascending: false });
    if (from) q = q.gte("purchase_date", from);
    if (to) q = q.lte("purchase_date", to);
    if (supplierId) q = q.eq("supplier_id", supplierId);
    return must(q);
  },
  async get(id) {
    return must(supabase.from("purchases").select("*, suppliers(name), purchase_items(*, products(name))").eq("id", id).single());
  }
};

// =====================================================================
// SALES / POS
// =====================================================================
export const Sales = {
  async create({ customerId, items, discount = 0, paymentMethod = "cash", amountPaid = null }) {
    const invoice_no = await nextNumber("INV", "sales");
    const subtotal = items.reduce((s, it) => s + it.quantity * it.selling_price, 0);
    const total = Math.max(0, subtotal - Number(discount || 0));
    const paid = amountPaid === null ? (paymentMethod === "credit" ? 0 : total) : amountPaid;

    const sale = await must(supabase.from("sales").insert({
      shop_id: sid(), customer_id: customerId || null, invoice_no, subtotal, discount, total,
      payment_method: paymentMethod, amount_paid: paid, created_by: state.profile.id
    }).select().single());

    const rows = items.map(it => ({
      sale_id: sale.id, product_id: it.productId, variant_id: it.variantId || null, product_name: it.name,
      quantity: it.quantity, selling_price: it.selling_price, purchase_price: it.purchase_price,
      line_total: it.quantity * it.selling_price
    }));
    await must(supabase.from("sale_items").insert(rows));
    return sale;
  },
  async list({ from, to, search, customerId } = {}) {
    let q = supabase.from("sales").select("*, customers(name)").eq("shop_id", sid()).order("sale_date", { ascending: false });
    if (from) q = q.gte("sale_date", from);
    if (to) q = q.lte("sale_date", to + "T23:59:59");
    if (customerId) q = q.eq("customer_id", customerId);
    if (search) q = q.ilike("invoice_no", `%${search}%`);
    return must(q);
  },
  async get(id) {
    return must(supabase.from("sales").select("*, customers(name,mobile), sale_items(*)").eq("id", id).single());
  },
  async recent(limit = 8) {
    return must(supabase.from("sales").select("*, customers(name)").eq("shop_id", sid()).order("sale_date", { ascending: false }).limit(limit));
  }
};

export const Returns = {
  async create({ saleId, items, refundMode = "cash" }) {
    const return_no = await nextNumber("RET", "sales_returns");
    const total_refund = items.reduce((s, it) => s + it.line_total, 0);
    const ret = await must(supabase.from("sales_returns").insert({
      shop_id: sid(), sale_id: saleId, return_no, total_refund, refund_mode: refundMode, created_by: state.profile.id
    }).select().single());

    const rows = items.map(it => ({
      return_id: ret.id, sale_item_id: it.saleItemId, product_id: it.productId, variant_id: it.variantId || null,
      quantity: it.quantity, line_total: it.line_total
    }));
    await must(supabase.from("sales_return_items").insert(rows));
    return ret;
  },
  async list() {
    return must(supabase.from("sales_returns").select("*, sales(invoice_no)").eq("shop_id", sid()).order("return_date", { ascending: false }));
  }
};

// =====================================================================
// EXPENSES
// =====================================================================
export const Expenses = {
  async categories() { return must(supabase.from("expense_categories").select("*").eq("shop_id", sid()).order("name")); },
  async list({ from, to } = {}) {
    let q = supabase.from("expenses").select("*, expense_categories(name)").eq("shop_id", sid()).order("expense_date", { ascending: false });
    if (from) q = q.gte("expense_date", from);
    if (to) q = q.lte("expense_date", to);
    return must(q);
  },
  async create(payload) {
    return must(supabase.from("expenses").insert({ ...payload, shop_id: sid(), created_by: state.profile.id }).select().single());
  },
  async remove(id) { return must(supabase.from("expenses").delete().eq("id", id)); }
};

// =====================================================================
// DASHBOARD + REPORTS
// =====================================================================
export const Reports = {
  async dashboard() {
    const today = new Date().toISOString().slice(0, 10);

    const [sales, purchases, expenses, products, lowStock, custOut, supOut, recentSales] = await Promise.all([
      must(supabase.from("sales").select("total, sale_items(quantity,selling_price,purchase_price)").eq("shop_id", sid()).gte("sale_date", today)),
      must(supabase.from("purchases").select("total").eq("shop_id", sid()).gte("purchase_date", today)),
      must(supabase.from("expenses").select("amount").eq("shop_id", sid()).eq("expense_date", today)),
      must(supabase.from("products").select("id, stock_qty").eq("shop_id", sid()).eq("active", true)),
      Products.lowStock(),
      Customers.outstandingTotal(),
      Suppliers.outstandingTotal(),
      Sales.recent(6)
    ]);

    const todaySales = sales.reduce((s, r) => s + Number(r.total), 0);
    const todayPurchases = purchases.reduce((s, r) => s + Number(r.total), 0);
    const todayExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);
    const grossProfit = sales.reduce((sum, sale) => sum + (sale.sale_items || []).reduce(
      (s, it) => s + (Number(it.selling_price) - Number(it.purchase_price)) * Number(it.quantity), 0), 0);
    const netProfit = grossProfit - todayExpenses;

    return {
      todaySales, todayPurchases, todayExpenses, netProfit, billCount: sales.length,
      totalProducts: products.length,
      totalStock: products.reduce((s, p) => s + Number(p.stock_qty), 0),
      lowStockCount: lowStock.length,
      customerOutstanding: custOut,
      supplierOutstanding: supOut,
      recentSales,
      lowStockProducts: lowStock.slice(0, 6)
    };
  },

  async topProducts({ from, to, limit = 8 } = {}) {
    let q = supabase.from("sale_items").select("product_name, quantity, line_total, sales!inner(shop_id, sale_date)").eq("sales.shop_id", sid());
    if (from) q = q.gte("sales.sale_date", from);
    if (to) q = q.lte("sales.sale_date", to + "T23:59:59");
    const rows = await must(q);
    const map = new Map();
    for (const r of rows) {
      const cur = map.get(r.product_name) || { name: r.product_name, qty: 0, revenue: 0 };
      cur.qty += Number(r.quantity); cur.revenue += Number(r.line_total);
      map.set(r.product_name, cur);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
  },

  async salesByCategory({ from, to } = {}) {
    let q = supabase.from("sale_items").select("quantity, line_total, product_id, sales!inner(shop_id, sale_date)").eq("sales.shop_id", sid());
    if (from) q = q.gte("sales.sale_date", from);
    if (to) q = q.lte("sales.sale_date", to + "T23:59:59");
    const items = await must(q);
    const products = await must(supabase.from("products").select("id, category_id, categories(name)").eq("shop_id", sid()));
    const catByProduct = new Map(products.map(p => [p.id, p.categories?.name || "Uncategorised"]));
    const map = new Map();
    for (const it of items) {
      const cat = catByProduct.get(it.product_id) || "Uncategorised";
      map.set(cat, (map.get(cat) || 0) + Number(it.line_total));
    }
    return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  },

  async salesByPayment({ from, to } = {}) {
    const sales = await Sales.list({ from, to });
    const map = new Map();
    for (const s of sales) map.set(s.payment_method, (map.get(s.payment_method) || 0) + Number(s.total));
    return [...map.entries()].map(([method, total]) => ({ method, total }));
  },

  async profitSummary({ from, to } = {}) {
    const sales = await must(
      supabase.from("sales").select("total, sale_date, sale_items(quantity,selling_price,purchase_price)").eq("shop_id", sid())
        .gte("sale_date", from).lte("sale_date", to + "T23:59:59")
    );
    const expenses = await Expenses.list({ from, to });
    const revenue = sales.reduce((s, r) => s + Number(r.total), 0);
    const grossProfit = sales.reduce((sum, sale) => sum + (sale.sale_items || []).reduce(
      (s, it) => s + (Number(it.selling_price) - Number(it.purchase_price)) * Number(it.quantity), 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { revenue, grossProfit, totalExpenses, netProfit: grossProfit - totalExpenses };
  },

  async stockValue() {
    const products = await must(supabase.from("products").select("stock_qty, purchase_price, selling_price").eq("shop_id", sid()).eq("active", true));
    return {
      atCost: products.reduce((s, p) => s + Number(p.stock_qty) * Number(p.purchase_price), 0),
      atSale: products.reduce((s, p) => s + Number(p.stock_qty) * Number(p.selling_price), 0)
    };
  }
};

// =====================================================================
// SETTINGS / TEAM
// =====================================================================
export const Settings = {
  async updateShop(payload) {
    return must(supabase.from("shops").update(payload).eq("id", sid()).select().single());
  },
  async team() {
    return must(supabase.from("app_users").select("*").eq("shop_id", sid()).order("created_at"));
  },
  async setActive(userId, active) {
    return must(supabase.from("app_users").update({ active }).eq("id", userId));
  },
  async setRole(userId, role) {
    return must(supabase.from("app_users").update({ role }).eq("id", userId));
  }
};
