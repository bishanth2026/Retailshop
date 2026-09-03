import { Sales, Returns } from "../db.js";
import { el, money, badge, openModal, toast, escapeHtml, fmtDateTime, debounce } from "../ui.js";
import { currency } from "../state.js";
import { renderInvoice } from "./invoice.js";

let search = "";
let from = "";
let to = "";

export async function renderSalesHistory(container) {
  container.appendChild(el(`
    <div class="panel">
      <div class="panel-header">
        <div class="filter-bar">
          <input type="search" id="sh-search" placeholder="Search invoice #…" value="${escapeHtml(search)}" />
          <input type="date" id="sh-from" value="${from}" />
          <span style="color:var(--ink-faint)">to</span>
          <input type="date" id="sh-to" value="${to}" />
          <button class="btn btn-ghost btn-sm" id="sh-apply">Filter</button>
        </div>
      </div>
      <div class="panel-body pad-0"><div class="table-wrap" id="sh-table-wrap"></div></div>
    </div>
  `));

  document.getElementById("sh-search").addEventListener("input", debounce((e) => { search = e.target.value; load(); }, 250));
  document.getElementById("sh-apply").addEventListener("click", () => {
    from = document.getElementById("sh-from").value; to = document.getElementById("sh-to").value; load();
  });
  await load();

  async function load() {
    const rows = await Sales.list({ search, from: from || undefined, to: to || undefined });
    const c = currency();
    const wrap = document.getElementById("sh-table-wrap");
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><div class="big">🧾</div>No sales found.</div>`; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Payment</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>
          ${rows.map(s => `
            <tr data-id="${s.id}">
              <td class="mono">${s.invoice_no}</td>
              <td>${escapeHtml(s.customers?.name || "Walk-in")}</td>
              <td>${fmtDateTime(s.sale_date)}</td>
              <td style="text-transform:capitalize">${s.payment_method}${s.payment_method === "credit" && Number(s.amount_paid) < Number(s.total) ? " " + badge("partial", "amber") : ""}</td>
              <td class="num">${money(s.total, c)}</td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" data-view>View</button>
                <button class="btn btn-ghost btn-sm" data-return>Return</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      renderInvoice(await Sales.get(id));
    }));
    wrap.querySelectorAll("[data-return]").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      openReturnModal(await Sales.get(id), load);
    }));
  }
}

function openReturnModal(sale, onDone) {
  const c = currency();
  const handle = openModal({
    title: `Return items — ${sale.invoice_no}`,
    wide: true,
    bodyHtml: `
      <table class="data-table">
        <thead><tr><th></th><th>Item</th><th class="num">Sold qty</th><th class="num">Return qty</th><th class="num">Line total</th></tr></thead>
        <tbody>
          ${sale.sale_items.map(it => `
            <tr data-item-id="${it.id}" data-product="${it.product_id}" data-variant="${it.variant_id || ""}" data-price="${it.selling_price}">
              <td><input type="checkbox" data-check /></td>
              <td>${escapeHtml(it.product_name)}</td>
              <td class="num">${it.quantity}</td>
              <td class="num"><input type="number" min="0" max="${it.quantity}" value="0" data-return-qty style="width:60px;text-align:right;font-family:var(--font-mono);border:1px solid var(--line-strong);border-radius:6px;padding:3px 5px;" /></td>
              <td class="num" data-line-total>${money(0, c)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="form-grid" style="margin-top:14px;">
        <label class="field"><span>Refund mode</span>
          <select id="refund-mode">
            <option value="cash">Cash refund</option>
            <option value="upi">UPI refund</option>
            <option value="card">Card refund</option>
            ${sale.customer_id ? `<option value="customer_credit">Credit to customer account</option>` : ""}
          </select>
        </label>
        <div style="align-self:end;text-align:right;font-family:var(--font-mono);font-weight:700;font-size:16px;">
          Total refund: <span id="refund-total">${money(0, c)}</span>
        </div>
      </div>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-return">Process return</button>`,
    onMount: (root) => {
      function recalc() {
        let total = 0;
        root.querySelectorAll("tr[data-item-id]").forEach(row => {
          const qty = Number(row.querySelector("[data-return-qty]").value || 0);
          const price = Number(row.dataset.price);
          const lineTotal = qty * price;
          row.querySelector("[data-line-total]").textContent = money(lineTotal, c);
          row.querySelector("[data-check]").checked = qty > 0;
          total += lineTotal;
        });
        root.querySelector("#refund-total").textContent = money(total, c);
      }
      root.querySelectorAll("[data-return-qty]").forEach(inp => inp.addEventListener("input", recalc));
      recalc();

      root.querySelector("#save-return").addEventListener("click", async () => {
        const items = [];
        root.querySelectorAll("tr[data-item-id]").forEach(row => {
          const qty = Number(row.querySelector("[data-return-qty]").value || 0);
          if (qty > 0) {
            items.push({
              saleItemId: row.dataset.itemId, productId: row.dataset.product,
              variantId: row.dataset.variant || null, quantity: qty, line_total: qty * Number(row.dataset.price)
            });
          }
        });
        if (!items.length) { toast("Select at least one item to return", "error"); return; }
        try {
          await Returns.create({ saleId: sale.id, items, refundMode: root.querySelector("#refund-mode").value });
          toast("Return processed — stock updated", "success");
          handle.close(); onDone();
        } catch (err) { toast(err.message || "Couldn't process return", "error"); }
      });
    }
  });
}
