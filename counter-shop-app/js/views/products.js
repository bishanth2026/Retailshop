import { Products, Categories, Variants } from "../db.js";
import { el, money, badge, openModal, confirmDialog, toast, debounce, escapeHtml } from "../ui.js";
import { currency } from "../state.js";

let categories = [];
let searchTerm = "";
let filterCategory = "";

export async function renderProducts(container) {
  categories = await Categories.list();
  container.appendChild(el(`
    <div>
      <div class="panel">
        <div class="panel-header">
          <div class="filter-bar">
            <input type="search" id="p-search" placeholder="Search products…" value="${escapeHtml(searchTerm)}" style="min-width:220px" />
            <select id="p-cat-filter">
              <option value="">All categories</option>
              ${categories.map(c => `<option value="${c.id}" ${c.id === filterCategory ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-ghost btn-sm" id="manage-cats-btn">Categories</button>
            <button class="btn btn-primary btn-sm" id="add-product-btn">+ Add product</button>
          </div>
        </div>
        <div class="panel-body pad-0">
          <div class="table-wrap" id="product-table-wrap"></div>
        </div>
      </div>
    </div>
  `));

  document.getElementById("add-product-btn").addEventListener("click", () => openProductModal());
  document.getElementById("manage-cats-btn").addEventListener("click", () => openCategoriesModal(container));
  document.getElementById("p-search").addEventListener("input", debounce((e) => { searchTerm = e.target.value; loadTable(); }, 250));
  document.getElementById("p-cat-filter").addEventListener("change", (e) => { filterCategory = e.target.value; loadTable(); });

  await loadTable();
}

async function loadTable() {
  const wrap = document.getElementById("product-table-wrap");
  if (!wrap) return;
  const rows = await Products.list({ search: searchTerm, categoryId: filterCategory });
  const c = currency();

  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="big">🏷️</div>No products yet. Add your first one.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Product</th><th>Category</th><th class="num">Purchase</th><th class="num">Selling</th><th class="num">Stock</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(p => {
          const low = Number(p.stock_qty) <= Number(p.min_stock);
          return `
          <tr data-id="${p.id}">
            <td><strong>${escapeHtml(p.name)}</strong>${p.subcategory ? `<div style="font-size:11px;color:var(--ink-faint)">${escapeHtml(p.subcategory)}</div>` : ""}</td>
            <td>${escapeHtml(p.categories?.name || "—")}</td>
            <td class="num">${money(p.purchase_price, c)}</td>
            <td class="num">${money(p.selling_price, c)}</td>
            <td class="num" style="${low ? "color:var(--red);font-weight:700" : ""}">${p.has_variants ? "variants" : p.stock_qty}</td>
            <td>${p.active ? badge("Active", "green") : badge("Inactive", "grey")}${low ? " " + badge("Low", "red") : ""}</td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm" data-edit>Edit</button>
              <button class="btn btn-danger btn-sm" data-delete>Delete</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", (e) => {
    const id = e.target.closest("tr").dataset.id;
    openProductModal(rows.find(r => r.id === id));
  }));
  wrap.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", async (e) => {
    const id = e.target.closest("tr").dataset.id;
    const p = rows.find(r => r.id === id);
    const ok = await confirmDialog(`Delete "${p.name}"? This can't be undone.`, { confirmLabel: "Delete" });
    if (!ok) return;
    try { await Products.remove(id); toast("Product deleted", "success"); loadTable(); }
    catch (err) { toast(err.message || "Couldn't delete — it may be used in past sales.", "error"); }
  }));
}

function openProductModal(existing) {
  const isEdit = !!existing;
  const handle = openModal({
    title: isEdit ? "Edit product" : "Add product",
    wide: true,
    bodyHtml: `
      <form id="product-form">
        <div class="form-grid">
          <label class="field span-2"><span>Product name</span>
            <input type="text" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="e.g. Ladies Sandal" />
          </label>
          <label class="field"><span>Category</span>
            <select name="category_id">
              <option value="">— None —</option>
              ${categories.map(c => `<option value="${c.id}" ${existing?.category_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field"><span>Subcategory (optional)</span>
            <input type="text" name="subcategory" value="${escapeHtml(existing?.subcategory || "")}" placeholder="e.g. Ladies Sandal" />
          </label>
          <label class="field"><span>Purchase price</span>
            <input type="number" step="0.01" min="0" name="purchase_price" required value="${existing?.purchase_price ?? ""}" />
          </label>
          <label class="field"><span>Selling price</span>
            <input type="number" step="0.01" min="0" name="selling_price" required value="${existing?.selling_price ?? ""}" />
          </label>
          <label class="field" id="stock-field"><span>Stock quantity</span>
            <input type="number" step="1" min="0" name="stock_qty" value="${existing?.stock_qty ?? 0}" />
          </label>
          <label class="field"><span>Minimum stock (low-stock alert)</span>
            <input type="number" step="1" min="0" name="min_stock" value="${existing?.min_stock ?? 3}" />
          </label>
          <label class="field"><span>Image URL (optional)</span>
            <input type="url" name="image_url" value="${escapeHtml(existing?.image_url || "")}" placeholder="https://…" />
          </label>
          <label class="field" style="flex-direction:row;align-items:center;gap:8px;margin-top:22px;">
            <input type="checkbox" name="has_variants" style="width:auto" ${existing?.has_variants ? "checked" : ""} />
            <span>Track by size / color (e.g. footwear)</span>
          </label>
        </div>
        ${isEdit ? `<label class="field" style="flex-direction:row;align-items:center;gap:8px;margin-top:10px;">
            <input type="checkbox" name="active" style="width:auto" ${existing.active ? "checked" : ""} />
            <span>Active (visible in POS)</span>
          </label>` : ""}
        <div id="variants-block" style="margin-top:14px;${existing?.has_variants ? "" : "display:none"}">
          <div style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:6px;">Sizes / colors</div>
          <div id="variant-rows"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="add-variant-row">+ Add size/color</button>
        </div>
      </form>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-product">Save</button>`,
    onMount: async (root) => {
      const form = root.querySelector("#product-form");
      const variantsBlock = root.querySelector("#variants-block");
      const variantRows = root.querySelector("#variant-rows");
      const stockField = root.querySelector("#stock-field");

      let variants = isEdit ? await Variants.listForProduct(existing.id) : [];

      function drawVariants() {
        variantRows.innerHTML = variants.map((v, i) => `
          <div style="display:flex;gap:8px;margin-bottom:6px;" data-vrow="${i}">
            <input placeholder="Size" value="${escapeHtml(v.size || "")}" data-vfield="size" style="flex:1;border:1px solid var(--line-strong);border-radius:6px;padding:7px 9px;" />
            <input placeholder="Color" value="${escapeHtml(v.color || "")}" data-vfield="color" style="flex:1;border:1px solid var(--line-strong);border-radius:6px;padding:7px 9px;" />
            <input type="number" min="0" placeholder="Stock" value="${v.stock_qty ?? 0}" data-vfield="stock_qty" style="width:80px;border:1px solid var(--line-strong);border-radius:6px;padding:7px 9px;" />
            <button type="button" class="icon-btn" data-vremove="${i}">✕</button>
          </div>
        `).join("");
        variantRows.querySelectorAll("[data-vremove]").forEach(b => b.addEventListener("click", () => {
          variants.splice(Number(b.dataset.vremove), 1); drawVariants();
        }));
        variantRows.querySelectorAll("[data-vfield]").forEach(inp => inp.addEventListener("input", (e) => {
          const idx = Number(e.target.closest("[data-vrow]").dataset.vrow);
          variants[idx][e.target.dataset.vfield] = e.target.value;
        }));
      }
      drawVariants();

      root.querySelector("#add-variant-row").addEventListener("click", () => {
        variants.push({ size: "", color: "", stock_qty: 0 }); drawVariants();
      });

      form.has_variants.addEventListener("change", (e) => {
        variantsBlock.style.display = e.target.checked ? "" : "none";
        stockField.style.opacity = e.target.checked ? "0.5" : "1";
      });

      root.querySelector("#save-product").addEventListener("click", async () => {
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const has_variants = fd.get("has_variants") === "on";
        const payload = {
          name: fd.get("name").trim(),
          category_id: fd.get("category_id") || null,
          subcategory: fd.get("subcategory").trim() || null,
          purchase_price: Number(fd.get("purchase_price")),
          selling_price: Number(fd.get("selling_price")),
          stock_qty: has_variants ? 0 : Number(fd.get("stock_qty") || 0),
          min_stock: Number(fd.get("min_stock") || 0),
          image_url: fd.get("image_url").trim() || null,
          has_variants,
        };
        if (isEdit) payload.active = fd.get("active") === "on";

        try {
          const saveBtn = root.querySelector("#save-product");
          saveBtn.disabled = true;
          const product = isEdit ? await Products.update(existing.id, payload) : await Products.create(payload);

          if (has_variants) {
            const existingVariants = isEdit ? await Variants.listForProduct(product.id) : [];
            for (const ev of existingVariants) await Variants.remove(ev.id);
            for (const v of variants) {
              if (!v.size && !v.color) continue;
              await Variants.create(product.id, { size: v.size || null, color: v.color || null, stock_qty: Number(v.stock_qty || 0) });
            }
          }
          toast(isEdit ? "Product updated" : "Product added", "success");
          handle.close();
          loadTable();
        } catch (err) {
          toast(err.message || "Couldn't save product", "error");
        }
      });
    }
  });
}

function openCategoriesModal(container) {
  const handle = openModal({
    title: "Categories",
    bodyHtml: `
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <input id="new-cat-name" placeholder="New category name" style="flex:1;border:1px solid var(--line-strong);border-radius:6px;padding:8px 10px;" />
        <button class="btn btn-primary btn-sm" id="add-cat-btn">Add</button>
      </div>
      <div id="cat-list"></div>
    `,
    onMount: async (root) => {
      async function draw() {
        categories = await Categories.list();
        root.querySelector("#cat-list").innerHTML = categories.map(c => `
          <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);" data-cid="${c.id}">
            <input value="${escapeHtml(c.name)}" data-rename style="flex:1;border:1px solid transparent;border-radius:6px;padding:5px 7px;background:transparent;" />
            <button class="btn btn-ghost btn-sm" data-save>Save</button>
            <button class="btn btn-danger btn-sm" data-del>Delete</button>
          </div>
        `).join("") || `<p style="color:var(--ink-soft)">No categories yet.</p>`;

        root.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", async (e) => {
          const row = e.target.closest("[data-cid]");
          const val = row.querySelector("[data-rename]").value.trim();
          if (!val) return;
          try { await Categories.rename(row.dataset.cid, val); toast("Renamed", "success"); draw(); }
          catch (err) { toast(err.message, "error"); }
        }));
        root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async (e) => {
          const row = e.target.closest("[data-cid]");
          const ok = await confirmDialog("Delete this category?");
          if (!ok) return;
          try { await Categories.remove(row.dataset.cid); toast("Deleted", "success"); draw(); }
          catch (err) { toast(err.message, "error"); }
        }));
      }
      root.querySelector("#add-cat-btn").addEventListener("click", async () => {
        const input = root.querySelector("#new-cat-name");
        if (!input.value.trim()) return;
        try { await Categories.create(input.value.trim()); input.value = ""; toast("Category added", "success"); draw(); }
        catch (err) { toast(err.message, "error"); }
      });
      draw();
    },
    onClose: () => loadTable()
  });
}
