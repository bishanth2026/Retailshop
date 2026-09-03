import { Expenses } from "../db.js";
import { el, money, openModal, confirmDialog, toast, escapeHtml, fmtDate, todayStr } from "../ui.js";
import { currency, isAdmin } from "../state.js";

export async function renderExpenses(container) {
  const categories = await Expenses.categories();
  container.appendChild(el(`
    <div>
      <div class="panel">
        <div class="panel-header">
          <div class="filter-bar">
            <input type="date" id="ex-from" />
            <span style="color:var(--ink-faint)">to</span>
            <input type="date" id="ex-to" />
            <button class="btn btn-ghost btn-sm" id="ex-apply">Filter</button>
          </div>
          <button class="btn btn-primary btn-sm" id="add-expense-btn">+ Add expense</button>
        </div>
        <div class="panel-body pad-0"><div class="table-wrap" id="expense-table-wrap"></div></div>
      </div>
    </div>
  `));

  document.getElementById("add-expense-btn").addEventListener("click", () => openExpenseModal(categories, load));
  document.getElementById("ex-apply").addEventListener("click", load);
  await load();

  async function load() {
    const from = document.getElementById("ex-from").value || undefined;
    const to = document.getElementById("ex-to").value || undefined;
    const rows = await Expenses.list({ from, to });
    const c = currency();
    const wrap = document.getElementById("expense-table-wrap");
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);

    if (!rows.length) { wrap.innerHTML = `<div class="empty-state"><div class="big">🧾</div>No expenses recorded${from || to ? " for this range" : ""}.</div>`; return; }
    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payment</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>
          ${rows.map(e => `
            <tr data-id="${e.id}">
              <td>${fmtDate(e.expense_date)}</td>
              <td>${escapeHtml(e.expense_categories?.name || "—")}</td>
              <td>${escapeHtml(e.description || "—")}</td>
              <td style="text-transform:capitalize">${e.payment_method}</td>
              <td class="num">${money(e.amount, c)}</td>
              <td class="row-actions">${isAdmin() ? `<button class="btn btn-danger btn-sm" data-delete>Delete</button>` : ""}</td>
            </tr>`).join("")}
          <tr><td colspan="4" style="text-align:right;font-weight:700;">Total</td><td class="num" style="font-weight:700;">${money(total, c)}</td><td></td></tr>
        </tbody>
      </table>
    `;
    wrap.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest("tr").dataset.id;
      const ok = await confirmDialog("Delete this expense?", { confirmLabel: "Delete" });
      if (!ok) return;
      try { await Expenses.remove(id); toast("Deleted", "success"); load(); }
      catch (err) { toast(err.message, "error"); }
    }));
  }
}

function openExpenseModal(categories, onDone) {
  const handle = openModal({
    title: "Add expense",
    bodyHtml: `
      <form id="ex-form" class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="expense_date" value="${todayStr()}" required /></label>
        <label class="field"><span>Category</span>
          <select name="category_id" required>${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
        </label>
        <label class="field span-2"><span>Description</span><input name="description" placeholder="Optional note" /></label>
        <label class="field"><span>Amount</span><input type="number" min="0.01" step="0.01" name="amount" required /></label>
        <label class="field"><span>Payment method</span>
          <select name="payment_method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select>
        </label>
      </form>
    `,
    footerHtml: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-ex">Save</button>`,
    onMount: (root) => {
      root.querySelector("#save-ex").addEventListener("click", async () => {
        const form = root.querySelector("#ex-form");
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        try {
          await Expenses.create({
            expense_date: fd.get("expense_date"), category_id: fd.get("category_id"),
            description: fd.get("description") || null, amount: Number(fd.get("amount")),
            payment_method: fd.get("payment_method")
          });
          toast("Expense added", "success"); handle.close(); onDone();
        } catch (err) { toast(err.message, "error"); }
      });
    }
  });
}
