import { Suppliers } from "../db.js";
import { el, money, openModal, confirmDialog, toast, escapeHtml, fmtDate, debounce } from "../ui.js";
import { currency } from "../state.js";

let search = "";

export async function renderSuppliers(container) {
  container.appendChild(el(`
    <div class="panel">
      <div class="panel-header">
        <input type="search" id="s-search" placeholder="Search by name or mobile…" value="${escapeHtml(search)}" style="min-width:220px;border:1px solid var(--line-strong);border-radius:6px;padding:8px 10px;" />
        <button class="btn btn-primary btn-sm" id="add-supplier-btn">+ Add supplier</button>
      </div>
      <div class="panel-body pad-0"><div class="table-wrap" id="supplier-table-wrap"></div></div>
    </div>
  `));

  document.getElementById("add-supplier-btn").addEventListener("click", () => openSupplierModal(null, load));
  document.getElementById("s-search").addEventListener("input", debounce((e) => { search = e.target.value; load(); }, 250));
  await load();

  async function load() {
    const rows = await Suppliers.list(search);
    const c = currency();
    const withBalance = await Promise.all(rows.map(async (s) => ({ ...s, balance: await Suppliers.balance(s.id) })));
    const wrap = document.getElementById("supplier-table-wrap");
    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><div class="big">🚚</div>No suppliers yet.</div>`; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Supplier</th><th>Mobile</th><th class="num">Outstanding</th><th></th></tr></thead>
        <tbody>
          ${withBalance.map(s => `
            <tr data-id="${s.id}">
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${escapeHtml(s.mobile || "—")}</td>
              <td class="num" style="${s.balance > 0 ? "color:var(--red);font-weight:700" : ""}">${money(s.balance, c)}</td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" data-ledger>Ledger</button>
                <button class="btn btn-ghost btn-sm" data-edit>Edit</button>
                <button class="btn btn-danger btn-sm" data-delete>Delete</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-ledger]").forEach(b => b.addEventListener("click", (e) => openLedgerModal(withBalance.find(s => s.id === e.target.closest("tr").dataset.id), load)));
    wrap.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", (e) => openSupplierModal(rows.find(s => s.id === e.target.closest("tr").dataset.id), load)));
    wrap.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", async (e) => {
      const s = rows.find(s => s.id === e.target.closest("tr").dataset.id);
      const ok = await confirmDialog(`Delete supplier "${s.name}"?`, { confirmLabel: "Delete" });
      if (!ok) return;
      try { await Suppliers.remove(s.id); toast("Deleted", "success"); load(); }
      catch (err) { toast(err.message || "Couldn't delete — this supplier has purchase history.", "error"); }
    }));
  }
}

function openSupplierModal(existing, onDone) {
  const handle = openModal({
    title: existing ? "Edit supplier" : "Add supplier",
    bodyHtml: `
      <form id="s-form">
        <div class="form-grid">
          <label class="field span-2"><span>Supplier name</span><input name="name" required value="${escapeHtml(existing?.name || "")}" /></label>
          <label class="field"><span>Mobile number</span><input name="mobile" value="${escapeHtml(existing?.mobile || "")}" /></label>
          <label class="field"><span>Opening balance</span><input type="number" step="0.01" name="opening_balance" value="${existing?.opening_balance ?? 0}" /></label>
          <label class="field span-2"><span>Address</span><input name="address" value="${escapeHtml(existing?.address || "")}" /></label>
        </div>
      </form>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-s">Save</button>`,
    onMount: (root) => {
      root.querySelector("#save-s").addEventListener("click", async () => {
        const form = root.querySelector("#s-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const payload = { name: fd.get("name").trim(), mobile: fd.get("mobile").trim() || null, address: fd.get("address").trim() || null, opening_balance: Number(fd.get("opening_balance") || 0) };
        try {
          if (existing) await Suppliers.update(existing.id, payload); else await Suppliers.create(payload);
          toast("Saved", "success"); handle.close(); onDone();
        } catch (err) { toast(err.message, "error"); }
      });
    }
  });
}

async function openLedgerModal(supplier, onDone) {
  const txns = await Suppliers.transactions(supplier.id);
  const c = currency();
  let running = Number(supplier.opening_balance);
  const rowsHtml = txns.map(t => {
    running += Number(t.credit) - Number(t.debit);
    return `<tr><td>${fmtDate(t.txn_date)}</td><td>${escapeHtml(t.description)}</td><td class="num">${t.credit > 0 ? money(t.credit, c) : ""}</td><td class="num">${t.debit > 0 ? money(t.debit, c) : ""}</td><td class="num">${money(running, c)}</td></tr>`;
  }).join("");

  const handle = openModal({
    title: `${supplier.name} — ledger`,
    wide: true,
    bodyHtml: `
      <div class="balance-hero" style="margin-bottom:14px;">
        <span style="color:var(--ink-soft);font-size:13px;">Outstanding:</span>
        <span class="amt" style="color:${supplier.balance > 0 ? "var(--red)" : "var(--green)"}">${money(supplier.balance, c)}</span>
      </div>
      <div class="table-wrap" style="max-height:300px;overflow-y:auto;margin-bottom:16px;">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Description</th><th class="num">We owe (credit)</th><th class="num">We paid (debit)</th><th class="num">Balance</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="5"><div class="empty-state">No transactions yet.</div></td></tr>`}</tbody>
        </table>
      </div>
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header"><h3 style="font-size:14px">Record a payment</h3></div>
        <div class="panel-body">
          <form id="pay-form" class="form-grid">
            <label class="field"><span>Amount</span><input type="number" min="0.01" step="0.01" name="amount" required /></label>
            <label class="field"><span>Method</span><select name="method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label>
            <label class="field span-2"><span>Note (optional)</span><input name="note" /></label>
            <div class="span-2"><button type="submit" class="btn btn-primary btn-sm">Record payment</button></div>
          </form>
        </div>
      </div>
    `,
    onMount: (root) => {
      root.querySelector("#pay-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await Suppliers.recordPayment(supplier.id, Number(fd.get("amount")), fd.get("method"), fd.get("note") || null);
          toast("Payment recorded", "success");
          handle.close(); openLedgerModal({ ...supplier, balance: await Suppliers.balance(supplier.id) }, onDone);
        } catch (err) { toast(err.message, "error"); }
      });
    },
    onClose: () => onDone()
  });
}
