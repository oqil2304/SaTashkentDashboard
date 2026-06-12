// ─── branches.js — Filiallar bo'limi ─────────────────────────────────────────
console.log('[branches.js] yuklandi');

function renderBranches(c) {
  console.log('[branches.js] renderBranches, branches:', branches.length);
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Filiallar</div>
      <button class="btn btn-primary" onclick="openAddBranch()"><i class="ti ti-plus"></i>Filial qoʻshish</button>
    </div>
    <div class="branches-grid">
      ${branches.map(b => {
        const bProds   = products.filter(p => p.branch_id == b.id);
        const urgCnt   = bProds.filter(p => daysLeft(p.current_stock, p.daily_usage) <= 2).length;
        const totSpend = purchases
          .filter(p => p.branch_id == b.id)
          .reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);
        return `
          <div class="branch-card">
            <div class="branch-card-header">
              <div class="branch-icon"><i class="ti ti-building-store"></i></div>
              <div class="branch-actions">
                ${urgCnt ? `<span class="badge badge-red"><i class="ti ti-alarm"></i>${urgCnt} shoshilinch</span>` : ''}
                <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditBranch(${b.id})"><i class="ti ti-edit"></i></button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="delBranch(${b.id})"><i class="ti ti-trash"></i></button>
              </div>
            </div>
            <div class="branch-name">${esc(b.name)}</div>
            <div class="branch-address">${esc(b.address || '—')}</div>
            <div class="branch-meta">
              ${b.manager ? `<div class="branch-meta-item"><i class="ti ti-user" style="font-size:13px"></i>${esc(b.manager)}</div>` : ''}
              ${b.phone   ? `<div class="branch-meta-item"><i class="ti ti-phone" style="font-size:13px"></i>${esc(b.phone)}</div>`   : ''}
            </div>
            <div class="branch-stats">
              <div class="branch-stat">
                <div class="branch-stat-value">${bProds.length}</div>
                <div class="branch-stat-label">Mahsulot turi</div>
              </div>
              <div class="branch-stat">
                <div class="branch-stat-value" style="color:var(--teal);font-size:16px">${Number(totSpend).toLocaleString('uz-UZ')}</div>
                <div class="branch-stat-label">Jami xarajat (soʻm)</div>
              </div>
            </div>
            ${bProds.length ? `
              <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
                ${bProds.slice(0, 5).map(p => {
                  const d = daysLeft(p.current_stock, p.daily_usage);
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8fafc;gap:8px">
                    <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
                    ${statusBadge(d)}
                  </div>`;
                }).join('')}
                ${bProds.length > 5 ? `<div style="font-size:12px;color:#94a3b8;margin-top:6px">+${bProds.length - 5} ta boshqa</div>` : ''}
              </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function openAddBranch() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Filial qoʻshish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label>
          <input class="form-control" id="bn" placeholder="Filial №5"></div>
        <div class="form-group"><label class="form-label">Manzil</label>
          <input class="form-control" id="ba" placeholder="Toshkent, koʻcha..."></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Masʼul shaxs</label>
          <input class="form-control" id="bm" placeholder="Ism Familiya"></div>
        <div class="form-group"><label class="form-label">Telefon</label>
          <input class="form-control" id="bp" placeholder="+998 90 123 45 67"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveBranch(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditBranch(id) {
  const b = branches.find(x => x.id == id); if (!b) return;
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Filialni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label>
          <input class="form-control" id="bn" value="${esc(b.name)}"></div>
        <div class="form-group"><label class="form-label">Manzil</label>
          <input class="form-control" id="ba" value="${esc(b.address || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Masʼul shaxs</label>
          <input class="form-control" id="bm" value="${esc(b.manager || '')}"></div>
        <div class="form-group"><label class="form-label">Telefon</label>
          <input class="form-control" id="bp" value="${esc(b.phone || '')}"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveBranch(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveBranch(id) {
  const name = document.getElementById('bn').value.trim();
  if (!name) { toast('Nomi kerak', 'error'); return; }
  const body = {
    name,
    address: document.getElementById('ba').value,
    manager: document.getElementById('bm').value,
    phone:   document.getElementById('bp').value
  };
  try {
    if (id) await api('PUT', `/api/branches/${id}`, body);
    else    await api('POST', '/api/branches', body);
    toast(id ? 'Yangilandi' : "Qoʻshildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delBranch(id) {
  if (!confirm("Filialni oʻchirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/branches/${id}`);
    toast("Oʻchirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}
