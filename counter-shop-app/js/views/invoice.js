import { openModal, money, fmtDateTime, escapeHtml } from "../ui.js";
import { state, currency } from "../state.js";

export function renderInvoice(sale) {
  const c = currency();
  const shop = state.shop || {};
  const html = `
    <div id="print-area" class="invoice">
      <div class="invoice-head">
        <div class="shop">${escapeHtml(shop.name || "Shop")}</div>
        <div>${escapeHtml(shop.address || "")}</div>
        <div>${shop.phone ? "Ph: " + escapeHtml(shop.phone) : ""}</div>
      </div>
      <div class="invoice-meta">
        <div>Invoice: <strong>${sale.invoice_no}</strong></div>
        <div>${fmtDateTime(sale.sale_date)}</div>
      </div>
      <div class="invoice-meta">
        <div>Customer: ${escapeHtml(sale.customers?.name || "Walk-in")}</div>
        <div>${escapeHtml(sale.customers?.mobile || "")}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${sale.sale_items.map(it => `<tr><td>${escapeHtml(it.product_name)}</td><td class="num">${it.quantity}</td><td class="num">${money(it.selling_price, c)}</td><td class="num">${money(it.line_total, c)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="invoice-totals">
        <div class="line"><span>Subtotal</span><span>${money(sale.subtotal, c)}</span></div>
        <div class="line"><span>Discount</span><span>${money(sale.discount, c)}</span></div>
        <div class="line grand"><span>Total</span><span>${money(sale.total, c)}</span></div>
        <div class="line" style="margin-top:6px;"><span>Payment</span><span style="text-transform:capitalize">${sale.payment_method}</span></div>
        ${sale.payment_method === "credit" ? `<div class="line"><span>Paid now</span><span>${money(sale.amount_paid, c)}</span></div><div class="line"><span>Balance due</span><span>${money(sale.total - sale.amount_paid, c)}</span></div>` : ""}
      </div>
      <p style="text-align:center;margin-top:16px;color:var(--ink-faint);font-size:11.5px;">Thank you for shopping with us!</p>
    </div>
  `;

  openModal({
    title: `Invoice ${sale.invoice_no}`,
    bodyHtml: html,
    footerHtml: `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-primary" id="print-invoice">Print</button>`,
    onMount: (root) => {
      root.querySelector("#print-invoice").addEventListener("click", () => window.print());
    }
  });
}
