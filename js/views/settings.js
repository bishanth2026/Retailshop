import { Settings } from "../db.js";
import { el, toast, escapeHtml, badge } from "../ui.js";
import { state, shopId } from "../state.js";

export async function renderSettings(container) {
  const team = await Settings.team();
  const shop = state.shop || {};

  container.appendChild(el(`
    <div class="two-col">
      <div class="panel">
        <div class="panel-header"><h3>Shop details</h3></div>
        <div class="panel-body">
          <form id="shop-form" class="form-grid">
            <label class="field span-2"><span>Shop name</span><input name="name" required value="${escapeHtml(shop.name || "")}" /></label>
            <label class="field span-2"><span>Address</span><input name="address" value="${escapeHtml(shop.address || "")}" /></label>
            <label class="field"><span>Phone</span><input name="phone" value="${escapeHtml(shop.phone || "")}" /></label>
            <label class="field"><span>Currency symbol</span><input name="currency" value="${escapeHtml(shop.currency || "₹")}" maxlength="3" /></label>
            <label class="field"><span>Invoice prefix</span><input name="invoice_prefix" value="${escapeHtml(shop.invoice_prefix || "INV")}" /></label>
            <div class="span-2"><button type="submit" class="btn btn-primary btn-sm">Save shop details</button></div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Invite your team</h3></div>
        <div class="panel-body">
          <p style="font-size:13px;color:var(--ink-soft);margin-top:0;">
            Share this Shop ID with a cashier. On the sign-in screen they should choose
            <strong>"A cashier — joining an existing shop"</strong> and paste it in.
          </p>
          <div style="display:flex;gap:8px;">
            <input readonly value="${shopId()}" class="mono" style="flex:1;border:1px solid var(--line-strong);border-radius:6px;padding:8px 10px;background:var(--paper);" id="shop-id-box" />
            <button class="btn btn-ghost btn-sm" id="copy-shop-id">Copy</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Team</h3></div>
      <div class="panel-body pad-0">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody id="team-rows">
              ${team.map(u => `
                <tr data-id="${u.id}">
                  <td>${escapeHtml(u.full_name)}</td>
                  <td>${badge(u.role, u.role === "admin" ? "amber" : "blue")}</td>
                  <td>${u.active ? badge("Active", "green") : badge("Disabled", "grey")}</td>
                  <td class="row-actions">
                    ${u.id !== state.profile.id ? `
                      <button class="btn btn-ghost btn-sm" data-toggle-role>${u.role === "admin" ? "Make cashier" : "Make admin"}</button>
                      <button class="btn btn-ghost btn-sm" data-toggle-active>${u.active ? "Disable" : "Enable"}</button>
                    ` : `<span style="color:var(--ink-faint);font-size:12px;">You</span>`}
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `));

  document.getElementById("copy-shop-id").addEventListener("click", () => {
    navigator.clipboard.writeText(shopId());
    toast("Shop ID copied", "success");
  });

  document.getElementById("shop-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const updated = await Settings.updateShop({
        name: fd.get("name").trim(), address: fd.get("address").trim() || null,
        phone: fd.get("phone").trim() || null, currency: fd.get("currency").trim() || "₹",
        invoice_prefix: fd.get("invoice_prefix").trim() || "INV"
      });
      state.shop = updated;
      document.getElementById("shop-name-label").textContent = updated.name;
      toast("Shop details saved", "success");
    } catch (err) { toast(err.message, "error"); }
  });

  document.querySelectorAll("[data-toggle-role]").forEach(b => b.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    const u = team.find(t => t.id === row.dataset.id);
    try { await Settings.setRole(u.id, u.role === "admin" ? "cashier" : "admin"); toast("Role updated", "success"); refresh(container); }
    catch (err) { toast(err.message, "error"); }
  }));
  document.querySelectorAll("[data-toggle-active]").forEach(b => b.addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    const u = team.find(t => t.id === row.dataset.id);
    try { await Settings.setActive(u.id, !u.active); toast("Updated", "success"); refresh(container); }
    catch (err) { toast(err.message, "error"); }
  }));
}

function refresh(container) {
  container.innerHTML = "";
  renderSettings(container);
}
