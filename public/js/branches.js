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
          <div class="branch-card clickable" onclick="openBranchDetail(${b.id})">
            <div class="branch-card-header">
              <div class="branch-icon"><i class="ti ti-building-store"></i></div>
              <div class="branch-actions" onclick="event.stopPropagation()">
                ${urgCnt ? `<span class="badge badge-red"><i class="ti ti-alarm"></i>${urgCnt} shoshilinch</span>` : ''}
                ${isAdmin() ? `
                <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditBranch(${b.id})"><i class="ti ti-edit"></i></button>
                <button class="btn btn-sm btn-danger btn-icon" onclick="delBranch(${b.id})"><i class="ti ti-trash"></i></button>` : ''}
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
                ${bProds.slice(0, 4).map(p => {
                  const d = daysLeft(p.current_stock, p.daily_usage);
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8fafc;gap:8px">
                    <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
                    ${statusBadge(d)}
                  </div>`;
                }).join('')}
                ${bProds.length > 4 ? `<div style="font-size:12px;color:var(--teal);margin-top:8px;font-weight:600">+${bProds.length - 4} ta boshqa → batafsil</div>` : ''}
              </div>` : `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;font-size:13px;color:#94a3b8;text-align:center">Mahsulot yo'q</div>`}
          </div>`;
      }).join('')}
    </div>`;
}

function openBranchDetail(id) {
  const b = branches.find(x => x.id == id);
  if (!b) return;
  const c = document.getElementById('content');
  const bProds = products.filter(p => p.branch_id == b.id);
  const bPurch = purchases.filter(p => p.branch_id == b.id)
    .sort((a, b2) => (b2.purchase_date || '').localeCompare(a.purchase_date || ''));
  const totSpend = bPurch.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  const prodRows = bProds.length ? bProds.map(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return `<tr>
      <td style="font-weight:600">${esc(p.name)}</td>
      <td><span class="badge badge-gray">${esc(p.category || '—')}</span></td>
      <td style="font-weight:600;color:${daysColor(d)}">${p.current_stock} ${esc(p.unit)}</td>
      <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
      <td style="font-weight:700;color:${daysColor(d)}">${isFinite(d) && d < 999 ? d.toFixed(1) + ' kun' : '—'}</td>
      <td>${statusBadge(d)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-box"></i><p>Bu filialda mahsulot yo'q</p></div></td></tr>`;

  const purchRows = bPurch.length ? bPurch.map(p => `<tr>
      <td style="color:#64748b">${esc(p.purchase_date || '—')}</td>
      <td style="font-weight:600">${esc(p.product_name || '—')}</td>
      <td>${p.quantity} ${esc(p.unit || '')}</td>
      <td>${fmtMoney(p.unit_price)}</td>
      <td style="font-weight:700;color:var(--teal)">${fmtMoney((p.quantity||0)*(p.unit_price||0))}</td>
      <td style="color:#64748b">${esc(p.supplier || '—')}</td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-shopping-cart-off"></i><p>Bu filialda sotib olish yo'q</p></div></td></tr>`;

  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('branches')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0">${esc(b.name)}</div>
        <div style="font-size:13px;color:#94a3b8">${esc(b.address || '')}</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:18px">
      <div class="stat-card">
        <div class="stat-icon teal"><i class="ti ti-box"></i></div>
        <div><div class="stat-label">Mahsulot turi</div><div class="stat-value">${bProds.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber"><i class="ti ti-shopping-cart"></i></div>
        <div><div class="stat-label">Sotib olishlar</div><div class="stat-value">${bPurch.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Jami xarajat</div><div class="stat-value" style="font-size:18px">${fmtMoney(totSpend)}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="ti ti-user"></i></div>
        <div><div class="stat-label">Mas'ul shaxs</div>
          <div class="stat-value" style="font-size:15px">${esc(b.manager || '—')}</div>
          ${b.phone ? `<div style="font-size:12px;color:#94a3b8">${esc(b.phone)}</div>` : ''}
        </div>
      </div>
    </div>

    <div style="font-size:15px;font-weight:700;margin-bottom:12px">
      <i class="ti ti-box" style="color:#94a3b8;margin-right:6px"></i>Filialdagi mahsulotlar
    </div>
    <div class="card" style="margin-bottom:22px"><div class="table-wrap"><table>
      <thead><tr><th>Mahsulot</th><th>Kategoriya</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th></tr></thead>
      <tbody>${prodRows}</tbody>
    </table></div></div>

    <div style="font-size:15px;font-weight:700;margin-bottom:12px">
      <i class="ti ti-coin" style="color:#94a3b8;margin-right:6px"></i>Filial xarajatlari (sotib olishlar tarixi)
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Sana</th><th>Mahsulot</th><th>Miqdor</th><th>Narx</th><th>Jami</th><th>Yetkazuvchi</th></tr></thead>
      <tbody>${purchRows}</tbody>
    </table></div></div>`;

  paintIcons(c);
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
