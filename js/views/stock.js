import { Products, Stock, Variants } from "../db.js";
import { el, money, badge, openModal, toast, escapeHtml, fmtDateTime, debounce } from "../ui.js";
import { currency } from "../state.js";

let search = "";
let tab = "stock";

export async function renderStock(container) {
  container.appendChild(el(`
    <div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="btn ${tab === "stock" ? "btn-primary" : "btn-ghost"} btn-sm" id="tab-stock">Current stock</button>
        <button class="btn ${tab === "history" ? "btn-primary" : "btn-ghost"} btn-sm" id="tab-history">Stock movements</button>
      </div>
      <div id="stock-content"></div>
    </div>
  `));

  document.getElementById("tab-stock").addEventListener("click", () => { tab = "stock"; renderStock(replaceContainer(container)); });
  document.getElementById("tab-history").addEventListener("click", () => { tab = "history"; renderStock(replaceContainer(container)); });

  if (tab === "stock") await drawStockTable(container);
  else await drawHistory(container);
}

function replaceContainer(container) {
  container.innerHTML = "";
  return container;
}

async function drawStockTable(container) {
  const target = document.getElementById("stock-content");
  target.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <input type="search" id="stock-search" placeholder="Search products…" value="${escapeHtml(search)}" style="min-width:220px;border:1px solid var(--line-strong);border-radius:6px;padding:8px 10px;" />
        <div style="font-size:12px;color:var(--ink-soft)" id="stock-value-note">Loading stock value…</div>
      </div>
      <div class="panel-body pad-0"><div class="table-wrap" id="stock-table-wrap"></div></div>
    </div>
  `;
  document.getElementById("stock-search").addEventListener("input", debounce((e) => { search = e.target.value; load(); }, 250));

  async function load() {
    const rows = await Products.list({ search });
    const c = currency();
    const wrap = document.getElementById("stock-table-wrap");
    const totalCost = rows.reduce((s, p) => s + Number(p.stock_qty) * Number(p.purchase_price), 0);
    document.getElementById("stock-value-note").textContent = `Stock value (at cost): ${money(totalCost, c)}`;

    if (!rows.length) { wrap.innerHTML = `<div class="empty-state">No products found.</div>`; return; }

    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Product</th><th>Category</th><th class="num">Purchase</th><th class="num">Selling</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(p => {
            const low = Number(p.stock_qty) <= Number(p.min_stock);
            return `<tr data-id="${p.id}" data-variants="${p.has_variants}">
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td>${escapeHtml(p.categories?.name || "—")}</td>
              <td class="num">${money(p.purchase_price, c)}</td>
              <td class="num">${money(p.selling_price, c)}</td>
              <td class="num" style="${low ? "color:var(--red);font-weight:700" : ""}">${p.has_variants ? "see variants" : p.stock_qty}</td>
              <td>${low ? badge("Low stock", "red") : badge("Available", "green")}</td>
              <td class="row-actions">${p.has_variants ? "" : `<button class="btn btn-ghost btn-sm" data-adjust>Adjust</button>`}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-adjust]").forEach(b => b.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      const p = rows.find(r => r.id === row.dataset.id);
      openAdjustModal(p, load);
    }));
  }
  await load();
}

function openAdjustModal(product, onDone) {
  const handle = openModal({
    title: `Adjust stock — ${product.name}`,
    bodyHtml: `
      <form id="adjust-form">
        <p style="font-size:13px;color:var(--ink-soft);margin-top:0">Current stock: <strong class="mono">${product.stock_qty}</strong></p>
        <div class="form-grid">
          <label class="field"><span>Type</span>
            <select name="type">
              <option value="adjustment">Manual adjustment</option>
              <option value="damage">Damage / loss</option>
            </select>
          </label>
          <label class="field"><span>Quantity change</span>
            <input type="number" name="qty" required placeholder="e.g. 5 or -3" />
          </label>
          <label class="field span-2"><span>Reason</span>
            <input type="text" name="reason" required placeholder="e.g. Stock count correction" />
          </label>
        </div>
        <p style="font-size:12px;color:var(--ink-faint)">Use a positive number to increase stock, negative to decrease. Damage entries are usually negative.</p>
      </form>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-adjust">Save</button>`,
    onMount: (root) => {
      root.querySelector("#save-adjust").addEventListener("click", async () => {
        const form = root.querySelector("#adjust-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        let qty = Number(fd.get("qty"));
        const type = fd.get("type");
        if (type === "damage" && qty > 0) qty = -Math.abs(qty);
        try {
          await Stock.adjust({ productId: product.id, qty, type, reason: fd.get("reason") });
          toast("Stock updated", "success");
          handle.close();
          onDone();
        } catch (err) { toast(err.message || "Couldn't update stock", "error"); }
      });
    }
  });
}

async function drawHistory(container) {
  const target = document.getElementById("stock-content");
  const rows = await Stock.recentMovements(150);
  const typeColor = { purchase: "green", sale: "blue", return: "amber", damage: "red", adjustment: "grey" };

  target.innerHTML = `
    <div class="panel">
      <div class="panel-body pad-0">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Qty</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map(m => `
                <tr>
                  <td>${fmtDateTime(m.created_at)}</td>
                  <td>${escapeHtml(m.products?.name || "—")}</td>
                  <td>${badge(m.movement_type, typeColor[m.movement_type] || "grey")}</td>
                  <td class="num" style="color:${m.quantity < 0 ? "var(--red)" : "var(--green)"}">${m.quantity > 0 ? "+" : ""}${m.quantity}</td>
                  <td>${escapeHtml(m.reason || "—")}</td>
                  <td>${escapeHtml(m.app_users?.full_name || "—")}</td>
                </tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">No stock movements yet.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
