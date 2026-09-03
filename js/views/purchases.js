import { Purchases, Suppliers, Products } from "../db.js";
import { el, money, openModal, toast, escapeHtml, fmtDate, debounce } from "../ui.js";
import { currency } from "../state.js";

export async function renderPurchases(container) {
  container.appendChild(el(`
    <div>
      <div class="panel">
        <div class="panel-header">
          <div class="filter-bar">
            <input type="date" id="pf-from" />
            <span style="color:var(--ink-faint)">to</span>
            <input type="date" id="pf-to" />
            <button class="btn btn-ghost btn-sm" id="pf-apply">Filter</button>
          </div>
          <button class="btn btn-primary btn-sm" id="new-purchase-btn">+ New purchase</button>
        </div>
        <div class="panel-body pad-0"><div class="table-wrap" id="purchase-table-wrap"></div></div>
      </div>
    </div>
  `));

  document.getElementById("new-purchase-btn").addEventListener("click", () => openPurchaseModal(load));
  document.getElementById("pf-apply").addEventListener("click", load);
  await load();

  async function load() {
    const from = document.getElementById("pf-from").value || undefined;
    const to = document.getElementById("pf-to").value || undefined;
    const rows = await Purchases.list({ from, to });
    const c = currency();
    const wrap = document.getElementById("purchase-table-wrap");
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><div class="big">📦</div>No purchases recorded yet.</div>`; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Purchase #</th><th>Supplier</th><th>Date</th><th>Items</th><th>Payment</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${rows.map(p => `
            <tr>
              <td class="mono">${p.purchase_no}</td>
              <td>${escapeHtml(p.suppliers?.name || "—")}</td>
              <td>${fmtDate(p.purchase_date)}</td>
              <td>${p.purchase_items.length}</td>
              <td style="text-transform:capitalize">${p.payment_method}</td>
              <td class="num">${money(p.total, c)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  }
}

async function openPurchaseModal(onSaved) {
  const suppliers = await Suppliers.list();
  let cart = [];

  const handle = openModal({
    title: "New purchase",
    wide: true,
    bodyHtml: `
      <div class="form-grid">
        <label class="field"><span>Supplier</span>
          <select id="pu-supplier"><option value="">— Cash purchase, no supplier —</option>
            ${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Date</span><input type="date" id="pu-date" value="${new Date().toISOString().slice(0,10)}" /></label>
      </div>

      <div style="margin:16px 0 8px;position:relative;">
        <input id="pu-product-search" placeholder="Search product to add…" style="width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:10px 12px;" />
        <div id="pu-suggestions" style="position:absolute;top:100%;left:0;right:0;background:var(--paper-raised);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow-card);max-height:220px;overflow-y:auto;z-index:5;"></div>
      </div>

      <div id="pu-cart"></div>

      <div class="form-grid" style="margin-top:14px;">
        <label class="field"><span>Discount</span><input type="number" id="pu-discount" min="0" step="0.01" value="0" /></label>
        <label class="field"><span>Payment method</span>
          <select id="pu-payment"><option value="credit">Credit (adds to supplier balance)</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select>
        </label>
      </div>
      <div style="text-align:right;font-family:var(--font-mono);font-size:18px;font-weight:700;margin-top:8px;">Total: <span id="pu-total">₹0.00</span></div>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-purchase">Save purchase</button>`,
    onMount: (root) => {
      const searchInput = root.querySelector("#pu-product-search");
      const suggestions = root.querySelector("#pu-suggestions");
      const cartDiv = root.querySelector("#pu-cart");
      const c = currency();

      function drawCart() {
        cartDiv.innerHTML = cart.length ? `
          <table class="data-table"><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Line total</th><th></th></tr></thead>
          <tbody>
            ${cart.map((it, i) => `
              <tr>
                <td>${escapeHtml(it.name)}</td>
                <td class="num"><input type="number" min="1" step="1" value="${it.quantity}" data-qty="${i}" style="width:60px;text-align:right;font-family:var(--font-mono);border:1px solid var(--line-strong);border-radius:6px;padding:3px 5px;" /></td>
                <td class="num"><input type="number" min="0" step="0.01" value="${it.purchase_price}" data-price="${i}" style="width:80px;text-align:right;font-family:var(--font-mono);border:1px solid var(--line-strong);border-radius:6px;padding:3px 5px;" /></td>
                <td class="num">${money(it.quantity * it.purchase_price, c)}</td>
                <td><button class="icon-btn" data-remove="${i}">✕</button></td>
              </tr>`).join("")}
          </tbody></table>
        ` : `<div class="empty-state" style="padding:20px">No items added yet.</div>`;

        cartDiv.querySelectorAll("[data-qty]").forEach(inp => inp.addEventListener("input", (e) => {
          cart[Number(e.target.dataset.qty)].quantity = Number(e.target.value) || 0; drawCart(); updateTotal();
        }));
        cartDiv.querySelectorAll("[data-price]").forEach(inp => inp.addEventListener("input", (e) => {
          cart[Number(e.target.dataset.price)].purchase_price = Number(e.target.value) || 0; drawCart(); updateTotal();
        }));
        cartDiv.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", (e) => {
          cart.splice(Number(e.target.dataset.remove), 1); drawCart(); updateTotal();
        }));
      }

      function updateTotal() {
        const subtotal = cart.reduce((s, it) => s + it.quantity * it.purchase_price, 0);
        const discount = Number(root.querySelector("#pu-discount").value || 0);
        root.querySelector("#pu-total").textContent = money(Math.max(0, subtotal - discount), c);
      }
      root.querySelector("#pu-discount").addEventListener("input", updateTotal);

      searchInput.addEventListener("input", debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { suggestions.innerHTML = ""; return; }
        const results = await Products.list({ search: q });
        suggestions.innerHTML = results.slice(0, 8).map(p => `
          <div data-pick="${p.id}" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-size:13px;">
            <strong>${escapeHtml(p.name)}</strong> <span style="color:var(--ink-faint)">— last cost ${money(p.purchase_price, c)}</span>
          </div>`).join("");
        suggestions.querySelectorAll("[data-pick]").forEach(row => row.addEventListener("click", () => {
          const p = results.find(r => r.id === row.dataset.pick);
          const existing = cart.find(it => it.productId === p.id);
          if (existing) existing.quantity += 1;
          else cart.push({ productId: p.id, name: p.name, quantity: 1, purchase_price: Number(p.purchase_price) });
          searchInput.value = ""; suggestions.innerHTML = "";
          drawCart(); updateTotal();
        }));
      }, 200));

      drawCart();

      root.querySelector("#save-purchase").addEventListener("click", async () => {
        if (!cart.length) { toast("Add at least one product", "error"); return; }
        const btn = root.querySelector("#save-purchase");
        btn.disabled = true;
        try {
          await Purchases.create({
            supplierId: root.querySelector("#pu-supplier").value || null,
            date: root.querySelector("#pu-date").value,
            items: cart,
            discount: Number(root.querySelector("#pu-discount").value || 0),
            paymentMethod: root.querySelector("#pu-payment").value
          });
          toast("Purchase saved — stock updated", "success");
          handle.close();
          onSaved?.();
        } catch (err) {
          toast(err.message || "Couldn't save purchase", "error");
          btn.disabled = false;
        }
      });
    }
  });
}
