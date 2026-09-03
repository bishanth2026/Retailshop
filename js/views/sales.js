import { Products, Variants, Customers, Sales } from "../db.js";
import { el, money, openModal, toast, escapeHtml, debounce, showLoader } from "../ui.js";
import { currency, state } from "../state.js";
import { renderInvoice } from "./invoice.js";

let allProducts = [];
let cart = []; // { key, productId, variantId, name, selling_price, purchase_price, quantity, maxStock }
let discount = 0;
let paymentMethod = "cash";
let selectedCustomer = null;
let amountPaid = null; // null = auto (full for cash/upi/card, 0 for credit)

export async function renderSales(container) {
  cart = []; discount = 0; paymentMethod = "cash"; selectedCustomer = null; amountPaid = null;
  allProducts = await Products.list({ activeOnly: true });

  container.appendChild(el(`
    <div class="pos-layout">
      <div>
        <div class="pos-search">
          <input type="search" id="pos-search" placeholder="Search product by name…" autofocus />
        </div>
        <div class="product-grid" id="product-grid"></div>
      </div>

      <div class="cart-panel">
        <div class="cart-header">
          <h3 style="font-size:14px">Cart</h3>
          <button class="btn btn-ghost btn-sm" id="clear-cart">Clear</button>
        </div>
        <div class="cart-items" id="cart-items"></div>

        <div class="cart-summary">
          <label class="field" style="margin-bottom:10px;">
            <span>Customer (optional)</span>
            <select id="pos-customer"><option value="">Walk-in customer</option></select>
          </label>
          <div class="summary-line"><span>Subtotal</span><span class="mono" id="sum-subtotal">₹0.00</span></div>
          <div class="summary-line discount-row"><span>Discount</span><input type="number" id="sum-discount" min="0" step="0.01" value="0" /></div>
          <div class="summary-line total"><span>Total</span><span class="mono" id="sum-total">₹0.00</span></div>
        </div>

        <div class="pay-methods" id="pay-methods">
          ${["cash", "upi", "card", "credit"].map(m => `<button type="button" class="pay-btn ${m === "cash" ? "active" : ""}" data-method="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}
        </div>
        <div id="paid-field" style="padding:0 16px 12px;display:none;">
          <label class="field"><span>Amount paid now (rest goes to customer credit)</span>
            <input type="number" id="sum-paid" min="0" step="0.01" value="0" />
          </label>
        </div>

        <div class="pos-footer">
          <button class="btn btn-primary btn-block" id="complete-sale-btn" style="padding:13px;font-size:15px;">Complete sale</button>
        </div>
      </div>
    </div>
  `));

  await loadCustomerOptions();
  drawGrid(allProducts);
  drawCart();

  document.getElementById("pos-search").addEventListener("input", debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    drawGrid(q ? allProducts.filter(p => p.name.toLowerCase().includes(q)) : allProducts);
  }, 150));

  document.getElementById("clear-cart").addEventListener("click", () => { cart = []; drawCart(); });

  document.getElementById("sum-discount").addEventListener("input", (e) => { discount = Number(e.target.value || 0); updateTotals(); });

  document.querySelectorAll(".pay-btn").forEach(b => b.addEventListener("click", () => {
    paymentMethod = b.dataset.method;
    document.querySelectorAll(".pay-btn").forEach(x => x.classList.toggle("active", x === b));
    document.getElementById("paid-field").style.display = paymentMethod === "credit" ? "block" : "none";
    updateTotals();
  }));

  document.getElementById("sum-paid").addEventListener("input", (e) => { amountPaid = Number(e.target.value || 0); });

  document.getElementById("pos-customer").addEventListener("change", (e) => { selectedCustomer = e.target.value || null; });

  document.getElementById("complete-sale-btn").addEventListener("click", completeSale);
}

async function loadCustomerOptions() {
  const customers = await Customers.list();
  const sel = document.getElementById("pos-customer");
  for (const c of customers) {
    const opt = document.createElement("option");
    opt.value = c.id; opt.textContent = c.mobile ? `${c.name} (${c.mobile})` : c.name;
    sel.appendChild(opt);
  }
}

function drawGrid(products) {
  const grid = document.getElementById("product-grid");
  if (!products.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No products found.</div>`; return; }
  grid.innerHTML = products.map(p => {
    const outOfStock = !p.has_variants && Number(p.stock_qty) <= 0;
    const low = !p.has_variants && Number(p.stock_qty) <= Number(p.min_stock) && Number(p.stock_qty) > 0;
    return `
    <button class="product-tile" data-id="${p.id}" ${outOfStock ? "disabled" : ""}>
      <div class="tile-name">${escapeHtml(p.name)}</div>
      <div class="tile-cat">${escapeHtml(p.categories?.name || "")}${p.subcategory ? " · " + escapeHtml(p.subcategory) : ""}</div>
      <div class="tile-bottom">
        <span class="tile-price">${money(p.selling_price, currency())}</span>
        <span class="tile-stock ${low ? "low" : ""}">${p.has_variants ? "variants" : (outOfStock ? "out of stock" : p.stock_qty + " left")}</span>
      </div>
    </button>`;
  }).join("");

  grid.querySelectorAll(".product-tile").forEach(tile => tile.addEventListener("click", async () => {
    const p = products.find(x => x.id === tile.dataset.id);
    if (p.has_variants) openVariantPicker(p); else addToCart(p, null, null);
  }));
}

async function openVariantPicker(p) {
  const variants = await Variants.listForProduct(p.id);
  if (!variants.length) { toast("No sizes/colors set up for this product yet.", "error"); return; }
  const handle = openModal({
    title: `${p.name} — choose size/color`,
    bodyHtml: `<div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${variants.map(v => `<button class="btn btn-ghost btn-sm" data-vid="${v.id}" ${v.stock_qty <= 0 ? "disabled" : ""}>
        ${escapeHtml([v.size, v.color].filter(Boolean).join(" / ") || "Default")} <span class="mono" style="margin-left:6px;color:var(--ink-faint)">(${v.stock_qty})</span>
      </button>`).join("")}
    </div>`,
    onMount: (root) => {
      root.querySelectorAll("[data-vid]").forEach(b => b.addEventListener("click", () => {
        const v = variants.find(x => x.id === b.dataset.vid);
        addToCart(p, v.id, v);
        handle.close();
      }));
    }
  });
}

function addToCart(p, variantId, variant) {
  const key = variantId || p.id;
  const maxStock = variant ? Number(variant.stock_qty) : Number(p.stock_qty);
  const existing = cart.find(it => it.key === key);
  if (existing) {
    if (existing.quantity + 1 > maxStock) { toast("Not enough stock", "error"); return; }
    existing.quantity += 1;
  } else {
    cart.push({
      key, productId: p.id, variantId: variantId || null,
      name: variant ? `${p.name} (${[variant.size, variant.color].filter(Boolean).join("/")})` : p.name,
      selling_price: Number(p.selling_price), purchase_price: Number(p.purchase_price),
      quantity: 1, maxStock
    });
  }
  drawCart();
}

function drawCart() {
  const wrap = document.getElementById("cart-items");
  if (!cart.length) { wrap.innerHTML = `<div class="cart-empty">Tap a product to add it to the cart.</div>`; updateTotals(); return; }
  wrap.innerHTML = cart.map(it => `
    <div class="cart-row" data-key="${it.key}">
      <div class="cart-row-name"><div class="n">${escapeHtml(it.name)}</div><div class="p mono">${money(it.selling_price, currency())}</div></div>
      <div class="qty-stepper">
        <button data-dec>−</button>
        <input value="${it.quantity}" data-qty inputmode="numeric" />
        <button data-inc>+</button>
      </div>
      <div class="cart-row-total mono">${money(it.quantity * it.selling_price, currency())}</div>
      <button class="icon-btn" data-remove>✕</button>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", (e) => changeQty(e, -1)));
  wrap.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", (e) => changeQty(e, 1)));
  wrap.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", (e) => {
    const key = e.target.closest(".cart-row").dataset.key;
    cart = cart.filter(it => it.key !== key);
    drawCart();
  }));
  wrap.querySelectorAll("[data-qty]").forEach(inp => inp.addEventListener("change", (e) => {
    const row = e.target.closest(".cart-row");
    const it = cart.find(x => x.key === row.dataset.key);
    let v = Math.max(1, Number(e.target.value) || 1);
    if (v > it.maxStock) { toast("Not enough stock", "error"); v = it.maxStock; }
    it.quantity = v;
    drawCart();
  }));

  updateTotals();
}

function changeQty(e, delta) {
  const row = e.target.closest(".cart-row");
  const it = cart.find(x => x.key === row.dataset.key);
  const next = it.quantity + delta;
  if (next <= 0) { cart = cart.filter(x => x.key !== it.key); drawCart(); return; }
  if (next > it.maxStock) { toast("Not enough stock", "error"); return; }
  it.quantity = next;
  drawCart();
}

function updateTotals() {
  const subtotal = cart.reduce((s, it) => s + it.quantity * it.selling_price, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  document.getElementById("sum-subtotal").textContent = money(subtotal, currency());
  document.getElementById("sum-total").textContent = money(total, currency());
  const paidField = document.getElementById("sum-paid");
  if (paidField && amountPaid === null) paidField.value = 0;
}

async function completeSale() {
  if (!cart.length) { toast("Cart is empty", "error"); return; }
  if (paymentMethod === "credit" && !selectedCustomer) { toast("Select a customer for credit sales", "error"); return; }

  const btn = document.getElementById("complete-sale-btn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const paid = paymentMethod === "credit" ? Number(document.getElementById("sum-paid").value || 0) : null;
    const sale = await Sales.create({
      customerId: selectedCustomer, items: cart, discount, paymentMethod, amountPaid: paid
    });
    toast(`Sale ${sale.invoice_no} completed`, "success");
    const full = await Sales.get(sale.id);
    renderInvoice(full);
    cart = []; discount = 0; document.getElementById("sum-discount").value = 0;
    allProducts = await Products.list({ activeOnly: true });
    drawGrid(allProducts); drawCart();
  } catch (err) {
    toast(err.message || "Couldn't complete sale", "error");
  } finally {
    btn.disabled = false; btn.textContent = "Complete sale";
  }
}
