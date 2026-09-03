import { Reports, Sales, Purchases, Products, Customers, Suppliers, Expenses } from "../db.js";
import { el, money, escapeHtml, fmtDate, todayStr } from "../ui.js";
import { currency } from "../state.js";

const TABS = [
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchases" },
  { id: "stock", label: "Stock" },
  { id: "customers", label: "Customers" },
  { id: "suppliers", label: "Suppliers" },
  { id: "expenses", label: "Expenses" },
  { id: "profit", label: "Profit" },
];

let activeTab = "sales";
let from = firstOfMonth();
let to = todayStr();

function firstOfMonth() {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
}

export async function renderReports(container) {
  container.appendChild(el(`
    <div>
      <div class="filter-bar" style="margin-bottom:14px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${TABS.map(t => `<button class="btn ${t.id === activeTab ? "btn-primary" : "btn-ghost"} btn-sm" data-tab="${t.id}">${t.label}</button>`).join("")}
        </div>
      </div>
      <div class="filter-bar" style="margin-bottom:14px;">
        <input type="date" id="rp-from" value="${from}" />
        <span style="color:var(--ink-faint)">to</span>
        <input type="date" id="rp-to" value="${to}" />
        <button class="btn btn-ghost btn-sm" id="rp-apply">Apply</button>
      </div>
      <div id="report-body"></div>
    </div>
  `));

  container.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    activeTab = b.dataset.tab;
    container.innerHTML = "";
    renderReports(container);
  }));
  document.getElementById("rp-apply").addEventListener("click", () => {
    from = document.getElementById("rp-from").value; to = document.getElementById("rp-to").value;
    draw();
  });

  await draw();

  async function draw() {
    const body = document.getElementById("report-body");
    body.innerHTML = `<div class="empty-state">Loading…</div>`;
    const renderers = { sales: salesReport, purchases: purchasesReport, stock: stockReport, customers: customersReport, suppliers: suppliersReport, expenses: expensesReport, profit: profitReport };
    body.innerHTML = "";
    body.appendChild(await renderers[activeTab]());
  }
}

async function salesReport() {
  const c = currency();
  const [rows, topProducts, byCategory, byPayment] = await Promise.all([
    Sales.list({ from, to }),
    Reports.topProducts({ from, to }),
    Reports.salesByCategory({ from, to }),
    Reports.salesByPayment({ from, to })
  ]);
  const total = rows.reduce((s, r) => s + Number(r.total), 0);

  return el(`
    <div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total sales (range)</div><div class="stat-value accent">${money(total, c)}</div></div>
        <div class="stat-card"><div class="stat-label">Bills</div><div class="stat-value">${rows.length}</div></div>
      </div>
      <div class="two-col">
        <div class="panel"><div class="panel-header"><h3>Product-wise sales</h3></div>
          <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Product</th><th class="num">Qty sold</th><th class="num">Revenue</th></tr></thead>
            <tbody>${topProducts.map(p => `<tr><td>${escapeHtml(p.name)}</td><td class="num">${p.qty}</td><td class="num">${money(p.revenue, c)}</td></tr>`).join("") || emptyRow(3)}</tbody>
          </table></div></div>
        </div>
        <div class="panel"><div class="panel-header"><h3>Category-wise sales</h3></div>
          <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Category</th><th class="num">Revenue</th></tr></thead>
            <tbody>${byCategory.map(r => `<tr><td>${escapeHtml(r.category)}</td><td class="num">${money(r.total, c)}</td></tr>`).join("") || emptyRow(2)}</tbody>
          </table></div></div>
        </div>
      </div>
      <div class="panel"><div class="panel-header"><h3>Payment-wise sales</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Method</th><th class="num">Total</th></tr></thead>
          <tbody>${byPayment.map(r => `<tr><td style="text-transform:capitalize">${r.method}</td><td class="num">${money(r.total, c)}</td></tr>`).join("") || emptyRow(2)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function purchasesReport() {
  const c = currency();
  const rows = await Purchases.list({ from, to });
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  const bySupplier = new Map();
  for (const r of rows) { const name = r.suppliers?.name || "Cash purchase"; bySupplier.set(name, (bySupplier.get(name) || 0) + Number(r.total)); }

  return el(`
    <div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total purchases (range)</div><div class="stat-value">${money(total, c)}</div></div>
        <div class="stat-card"><div class="stat-label">Purchase bills</div><div class="stat-value">${rows.length}</div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>Supplier-wise purchases</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Supplier</th><th class="num">Total</th></tr></thead>
          <tbody>${[...bySupplier.entries()].map(([name, t]) => `<tr><td>${escapeHtml(name)}</td><td class="num">${money(t, c)}</td></tr>`).join("") || emptyRow(2)}</tbody>
        </table></div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>Date-wise purchases</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Date</th><th>Purchase #</th><th>Supplier</th><th class="num">Total</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${fmtDate(r.purchase_date)}</td><td class="mono">${r.purchase_no}</td><td>${escapeHtml(r.suppliers?.name || "—")}</td><td class="num">${money(r.total, c)}</td></tr>`).join("") || emptyRow(4)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function stockReport() {
  const c = currency();
  const [products, value] = await Promise.all([Products.list(), Reports.stockValue()]);
  const low = products.filter(p => Number(p.stock_qty) <= Number(p.min_stock) && p.active);

  return el(`
    <div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Stock value (at cost)</div><div class="stat-value">${money(value.atCost, c)}</div></div>
        <div class="stat-card"><div class="stat-label">Stock value (at selling)</div><div class="stat-value accent">${money(value.atSale, c)}</div></div>
        <div class="stat-card"><div class="stat-label">Low stock items</div><div class="stat-value ${low.length ? "warn" : ""}">${low.length}</div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>Current stock</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Product</th><th>Category</th><th class="num">Stock</th><th class="num">Min</th><th class="num">Value (cost)</th></tr></thead>
          <tbody>${products.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.categories?.name || "—")}</td><td class="num" style="${Number(p.stock_qty) <= Number(p.min_stock) ? "color:var(--red);font-weight:700" : ""}">${p.stock_qty}</td><td class="num">${p.min_stock}</td><td class="num">${money(p.stock_qty * p.purchase_price, c)}</td></tr>`).join("") || emptyRow(5)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function customersReport() {
  const c = currency();
  const rows = await Customers.list();
  const withBalance = await Promise.all(rows.map(async (cu) => ({ ...cu, balance: await Customers.balance(cu.id) })));
  const totalOutstanding = withBalance.reduce((s, cu) => s + Math.max(0, cu.balance), 0);

  return el(`
    <div>
      <div class="stat-grid"><div class="stat-card"><div class="stat-label">Total customer outstanding</div><div class="stat-value warn">${money(totalOutstanding, c)}</div></div></div>
      <div class="panel"><div class="panel-header"><h3>Customer outstanding</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Customer</th><th>Mobile</th><th class="num">Outstanding</th></tr></thead>
          <tbody>${withBalance.filter(cu => cu.balance !== 0).map(cu => `<tr><td>${escapeHtml(cu.name)}</td><td>${escapeHtml(cu.mobile || "—")}</td><td class="num" style="${cu.balance > 0 ? "color:var(--red);font-weight:700" : ""}">${money(cu.balance, c)}</td></tr>`).join("") || emptyRow(3)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function suppliersReport() {
  const c = currency();
  const rows = await Suppliers.list();
  const withBalance = await Promise.all(rows.map(async (s) => ({ ...s, balance: await Suppliers.balance(s.id) })));
  const totalOutstanding = withBalance.reduce((s, sp) => s + Math.max(0, sp.balance), 0);

  return el(`
    <div>
      <div class="stat-grid"><div class="stat-card"><div class="stat-label">Total supplier outstanding</div><div class="stat-value warn">${money(totalOutstanding, c)}</div></div></div>
      <div class="panel"><div class="panel-header"><h3>Supplier outstanding</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Supplier</th><th>Mobile</th><th class="num">Outstanding</th></tr></thead>
          <tbody>${withBalance.filter(s => s.balance !== 0).map(s => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.mobile || "—")}</td><td class="num" style="${s.balance > 0 ? "color:var(--red);font-weight:700" : ""}">${money(s.balance, c)}</td></tr>`).join("") || emptyRow(3)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function expensesReport() {
  const c = currency();
  const rows = await Expenses.list({ from, to });
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byCat = new Map();
  for (const r of rows) { const name = r.expense_categories?.name || "Other"; byCat.set(name, (byCat.get(name) || 0) + Number(r.amount)); }

  return el(`
    <div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total expenses (range)</div><div class="stat-value">${money(total, c)}</div></div>
      </div>
      <div class="panel"><div class="panel-header"><h3>Category-wise expenses</h3></div>
        <div class="panel-body pad-0"><div class="table-wrap"><table class="data-table">
          <thead><tr><th>Category</th><th class="num">Total</th></tr></thead>
          <tbody>${[...byCat.entries()].map(([name, t]) => `<tr><td>${escapeHtml(name)}</td><td class="num">${money(t, c)}</td></tr>`).join("") || emptyRow(2)}</tbody>
        </table></div></div>
      </div>
    </div>
  `);
}

async function profitReport() {
  const c = currency();
  const p = await Reports.profitSummary({ from, to });
  return el(`
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value">${money(p.revenue, c)}</div></div>
      <div class="stat-card"><div class="stat-label">Gross profit</div><div class="stat-value accent">${money(p.grossProfit, c)}</div></div>
      <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value">${money(p.totalExpenses, c)}</div></div>
      <div class="stat-card"><div class="stat-label">Net profit</div><div class="stat-value ${p.netProfit < 0 ? "warn" : ""}">${money(p.netProfit, c)}</div></div>
    </div>
  `);
}

function emptyRow(cols) { return `<tr><td colspan="${cols}"><div class="empty-state">No data for this range.</div></td></tr>`; }
