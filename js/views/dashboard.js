import { Reports } from "../db.js";
import { money, fmtDateTime, el } from "../ui.js";
import { currency, isAdmin } from "../state.js";

export async function renderDashboard(container) {
  const d = await Reports.dashboard();
  const c = currency();

  container.appendChild(el(`
    <div>
      <h3 style="margin-bottom:10px;font-size:13px;color:var(--ink-soft);font-weight:700;">Today's summary</h3>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Today's sales</div>
          <div class="stat-value accent">${money(d.todaySales, c)}</div>
          <div class="stat-sub">${d.billCount} bill${d.billCount === 1 ? "" : "s"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Today's purchases</div>
          <div class="stat-value">${money(d.todayPurchases, c)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Today's expenses</div>
          <div class="stat-value">${money(d.todayExpenses, c)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Today's profit</div>
          <div class="stat-value ${d.netProfit < 0 ? "warn" : ""}">${money(d.netProfit, c)}</div>
        </div>
      </div>

      <h3 style="margin:18px 0 10px;font-size:13px;color:var(--ink-soft);font-weight:700;">Current status</h3>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total products</div><div class="stat-value">${d.totalProducts}</div></div>
        <div class="stat-card"><div class="stat-label">Total stock (units)</div><div class="stat-value">${d.totalStock.toLocaleString("en-IN")}</div></div>
        <div class="stat-card"><div class="stat-label">Low stock products</div><div class="stat-value ${d.lowStockCount ? "warn" : ""}">${d.lowStockCount}</div></div>
        <div class="stat-card"><div class="stat-label">Customer outstanding</div><div class="stat-value">${money(d.customerOutstanding, c)}</div></div>
        <div class="stat-card"><div class="stat-label">Supplier outstanding</div><div class="stat-value">${money(d.supplierOutstanding, c)}</div></div>
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-header"><h3>Recent sales</h3></div>
          <div class="panel-body pad-0">
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th class="num">Total</th></tr></thead>
                <tbody>
                  ${d.recentSales.length ? d.recentSales.map(s => `
                    <tr>
                      <td class="mono">${s.invoice_no}</td>
                      <td>${s.customers?.name || "Walk-in"}</td>
                      <td>${fmtDateTime(s.sale_date)}</td>
                      <td class="num">${money(s.total, c)}</td>
                    </tr>`).join("") : `<tr><td colspan="4"><div class="empty-state">No sales yet today.</div></td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>${d.lowStockCount ? "Low stock" : "All stocked up"}</h3></div>
          <div class="panel-body pad-0">
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Product</th><th class="num">Stock</th><th class="num">Min</th></tr></thead>
                <tbody>
                  ${d.lowStockProducts.length ? d.lowStockProducts.map(p => `
                    <tr>
                      <td>${p.name}</td>
                      <td class="num" style="color:var(--red);font-weight:700">${p.stock_qty}</td>
                      <td class="num">${p.min_stock}</td>
                    </tr>`).join("") : `<tr><td colspan="3"><div class="empty-state">Nothing running low.</div></td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `));
}
