// ─── suppliers.js — Ta'minotchilar bo'limi ───────────────────────────────────
console.log('[suppliers.js] yuklandi');

async function loadSuppliers() {
  suppliers = await api('GET', '/api/suppliers');
}

// Ta'minotchining filial id lari ro'yxati (massiv)
function _supBranchIds(s) {
  if (!s) return [];
  if (s.branch_ids) return String(s.branch_ids).split(',').map(x => x.trim()).filter(Boolean);
  if (s.branch_id)  return [String(s.branch_id)]; // eski yozuvlar
  return [];
}

function renderSuppliers(c) {
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Ta'minotchilar</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" id="bot-check-btn" onclick="botCheckStock()">
          <i class="ti ti-brand-telegram"></i>Ombor tekshirish (Bot ga)
        </button>
        <button class="btn btn-primary" onclick="openAddSupplier()">
          <i class="ti ti-plus"></i>Ta'minotchi qo'shish
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;padding:14px 18px;background:linear-gradient(135deg,#f0fdf4,#fff);border-color:#86efac">
      <div style="font-weight:700;margin-bottom:6px;color:#166534"><i class="ti ti-brand-telegram" style="vertical-align:-2px"></i> Telegram Bot qanday ishlaydi?</div>
      <div style="font-size:13px;color:#15803d;line-height:1.7">
        1. Ta'minotchi qo'shing (bir yoki bir nechta filialni tanlang) va Telegram <b>Ulash havolasi</b> yuboring<br>
        2. Tovar tugaganda <b>"Ombor tekshirish"</b> → Admin Telegram ga ro'yxat keladi<br>
        3. Admin kerakli tovarlarni ✅ belgilab tasdiqlaydi<br>
        4. Bot avtomatik ta'minotchiga schet-faktura so'raydi<br>
        5. Ta'minotchi faktura yuborgach → Admin tasdiqlaydi → Tovar omborga kiritiladi
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom:12px">
      <select class="form-select" id="sup-filter-br" onchange="renderSuppliersList(document.getElementById('suppliers-grid'))">
        <option value="">Barcha filiallar</option>${brOpts}
      </select>
      <input class="form-input" id="sup-filter-q" placeholder="Qidirish..." oninput="renderSuppliersList(document.getElementById('suppliers-grid'))">
    </div>

    <div id="suppliers-grid" class="card-list"></div>`;

  renderSuppliersList(c.querySelector('#suppliers-grid'));
  paintIcons(c);
}

function _brNameById(id) {
  const b = branches.find(x => String(x.id) === String(id));
  return b ? b.name : ('Filial #' + id);
}

function renderSuppliersList(el) {
  if (!el) return;
  const brId = document.getElementById('sup-filter-br')?.value || '';
  const q = (document.getElementById('sup-filter-q')?.value || '').toLowerCase();

  let list = suppliers;
  if (brId) list = list.filter(s => _supBranchIds(s).includes(brId));
  if (q)    list = list.filter(s => (s.name + (s.products_note||'')).toLowerCase().includes(q));

  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><i class="ti ti-users-off"></i><p>Ta\'minotchi yo\'q.</p></div>';
    return;
  }

  // Filial bo'yicha guruhlash — bir ta'minotchi bir nechta filialda ko'rinishi mumkin
  const grouped = {}; // brKey → [suppliers]
  for (const s of list) {
    const bids = _supBranchIds(s);
    if (!bids.length) {
      (grouped['__none__'] = grouped['__none__'] || []).push(s);
    } else {
      for (const bid of bids) {
        if (brId && bid !== brId) continue;
        (grouped[bid] = grouped[bid] || []).push(s);
      }
    }
  }

  const order = Object.keys(grouped).sort((a, b) => (a === '__none__' ? 1 : b === '__none__' ? -1 : 0));

  el.innerHTML = order.map(key => {
    const brName = key === '__none__' ? 'Umumiy (filial belgilanmagan)' : _brNameById(key);
    const sups = grouped[key];
    return `
    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <i class="ti ti-building-store" style="font-size:15px"></i>${esc(brName)}
        <span style="font-weight:400;color:#94a3b8">(${sups.length} ta)</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Ism / Kompaniya</th><th>Filiallar</th><th>Telegram</th><th>Telefon</th><th>Tovarlar</th><th>Holat</th><th></th>
        </tr></thead>
        <tbody>
        ${sups.map(s => {
          const bids = _supBranchIds(s);
          const brBadges = bids.length
            ? bids.map(b => `<span class="badge badge-gray" style="font-size:10px">${esc(_brNameById(b))}</span>`).join(' ')
            : '<span style="color:#94a3b8">—</span>';
          return `<tr>
          <td style="font-weight:600">${esc(s.name)}</td>
          <td style="line-height:1.8">${brBadges}</td>
          <td>${s.telegram_username
            ? '<a href="https://t.me/' + s.telegram_username.replace('@','') + '" target="_blank" style="color:var(--teal)">@' + esc(s.telegram_username.replace('@','')) + '</a>'
            : '<span style="color:#94a3b8">—</span>'}
            ${s.telegram_chat_id ? ' <span class="badge badge-teal" style="font-size:10px">✓ Ulangan</span>' : ''}</td>
          <td>${esc(s.phone || '—')}</td>
          <td style="color:#64748b;font-size:12px">${esc(s.products_note || '—')}</td>
          <td>${s.telegram_chat_id
            ? '<span class="badge badge-teal">✅ Bot ulangan</span>'
            : '<span class="badge badge-amber">⏳ Bot kutilmoqda</span>'}</td>
          <td style="white-space:nowrap;text-align:right">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="copySupplierLink(${s.id})" title="Ulash havolasi"><i class="ti ti-link"></i></button>
            <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditSupplier(${s.id})"><i class="ti ti-edit"></i></button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="delSupplier(${s.id})"><i class="ti ti-trash"></i></button>
          </td>
        </tr>`; }).join('')}
        </tbody>
      </table></div>
    </div>`;
  }).join('');

  paintIcons(el);
}

async function botCheckStock() {
  const btn = document.getElementById('bot-check-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Yuborilmoqda...'; }
  try {
    const r = await api('POST', '/api/bot/check-stock');
    toast(r.message || 'Telegram ga yuborildi ✅');
  } catch (e) { toast(e.message || 'Xato', 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-brand-telegram"></i>Ombor tekshirish (Bot ga)'; paintIcons(btn); }
  }
}

async function copySupplierLink(id) {
  try {
    const r = await api('GET', '/api/suppliers/' + id + '/link');
    await navigator.clipboard.writeText(r.link);
    toast("Havola nusxalandi! Ta'minotchiga yuboring.");
  } catch (e) { toast(e.message, 'error'); }
}

// Filiallar uchun checkbox ro'yxati (ko'p tanlash)
function _branchChecks(selectedIds) {
  const sel = (selectedIds || []).map(String);
  return branches.map(b => `
    <label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;margin:0 6px 6px 0">
      <input type="checkbox" class="sup-br-chk" value="${b.id}" ${sel.includes(String(b.id)) ? 'checked' : ''}>
      ${esc(b.name)}
    </label>`).join('');
}

function _supplierModal(title, saveFn, opts) {
  opts = opts || {};
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Ism / Kompaniya nomi *</label>
        <input class="form-control" id="sup-name" value="${esc(opts.name || '')}" placeholder="Sarvar LLC"></div>
      <div class="form-group"><label class="form-label">Filiallar (bir yoki bir nechta)</label>
        <div style="display:flex;flex-wrap:wrap;margin-top:4px">${_branchChecks(_supBranchIds(opts))}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px">Hech biri belgilanmasa — barcha filiallar uchun umumiy.</div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Telegram @username</label>
          <input class="form-control" id="sup-tguser" value="${esc(opts.telegram_username || '')}" placeholder="@username"></div>
        <div class="form-group"><label class="form-label">Telefon</label>
          <input class="form-control" id="sup-phone" value="${esc(opts.phone || '')}" placeholder="+998 90 123 45 67"></div>
      </div>
      <div class="form-group"><label class="form-label">Qaysi tovarlar ta'minlaydi</label>
        <input class="form-control" id="sup-prods" value="${esc(opts.products_note || '')}" placeholder="Suv, Non, Guruch..."></div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="sup-note" value="${esc(opts.note || '')}" placeholder="Qo'shimcha ma'lumot"></div>
      ${opts.telegram_chat_id ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;font-size:12px;color:#166534;margin-bottom:4px">
        ✅ Bu ta'minotchi bot bilan ulangan (Chat ID: ${opts.telegram_chat_id})
      </div>` : `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:9px 13px;font-size:12px;color:#92400e;margin-bottom:4px">
        ⏳ Saqlagandan keyin <b>"Ulash havolasi"</b> ni nusxalab ta'minotchiga yuboring.
      </div>`}
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="${saveFn}"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openAddSupplier() {
  _supplierModal("Ta'minotchi qo'shish", 'saveSupplier(null)');
}

function openEditSupplier(id) {
  const s = suppliers.find(x => x.id == id); if (!s) return;
  _supplierModal("Ta'minotchini tahrirlash", 'saveSupplier(' + id + ')', s);
}

async function saveSupplier(id) {
  const branchIds = [...document.querySelectorAll('.sup-br-chk:checked')].map(c => c.value);
  const body = {
    name:              document.getElementById('sup-name')?.value.trim(),
    branch_ids:        branchIds,
    telegram_username: document.getElementById('sup-tguser')?.value.trim(),
    phone:             document.getElementById('sup-phone')?.value.trim(),
    products_note:     document.getElementById('sup-prods')?.value.trim(),
    note:              document.getElementById('sup-note')?.value.trim()
  };
  if (!body.name) { toast('Ism kerak', 'error'); return; }
  try {
    if (id) await api('PUT', '/api/suppliers/' + id, body);
    else    await api('POST', '/api/suppliers', body);
    closeModal(true);
    await loadSuppliers();
    renderSection('suppliers');
    toast('Saqlandi');
  } catch (e) { toast(e.message, 'error'); }
}

async function delSupplier(id) {
  if (!confirm("Ta'minotchini o'chirasizmi?")) return;
  try {
    await api('DELETE', '/api/suppliers/' + id);
    await loadSuppliers();
    renderSection('suppliers');
    toast("O'chirildi");
  } catch (e) { toast(e.message, 'error'); }
}
