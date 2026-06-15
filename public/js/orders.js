// ─── orders.js — Avtomatik buyurtma (Sotib olish kerak) bo'limi ──────────────
console.log('[orders.js] yuklandi');

// Sozlamalar localStorage da saqlanadi
function orderTargetDays() {
  return parseInt(localStorage.getItem('order_target_days') || '30') || 30;
}
function orderThresholdDays() {
  return parseInt(localStorage.getItem('order_threshold_days') || '7') || 7;
}

// Mahsulotning oxirgi xarid narxini topish (FIFO/narx tarixidan)
function lastPurchasePrice(productId) {
  const list = purchases
    .filter(p => p.product_id == productId && p.unit_price > 0)
    .sort((a, b) => {
      const d = (b.purchase_date || '').localeCompare(a.purchase_date || '');
      return d !== 0 ? d : (b.id - a.id);
    });
  return list.length ? list[0].unit_price : 0;
}

// Buyurtma kerak bo'lgan mahsulotlar ro'yxatini hisoblash
function computeReorderList() {
  const target = orderTargetDays();
  const thr    = orderThresholdDays();
  const out = [];
  products.forEach(p => {
    if (!(p.daily_usage > 0)) return;
    const dleft = daysLeft(p.current_stock, p.daily_usage);
    if (dleft > thr) return; // hali yetarli
    // Maqsad: target kunga yetadigan zaxira
    const needQty = Math.max(0, target * p.daily_usage - (p.current_stock || 0));
    if (needQty <= 0) return;
    // Birlikka qarab yaxlitlash (dona/quti — butun, kg/litr — 1 kasr)
    const isWhole = /dona|quti|rulon|pachka|kovsak|metr/i.test(p.unit || '');
    const qty = isWhole ? Math.ceil(needQty) : Math.ceil(needQty * 10) / 10;
    const price = lastPurchasePrice(p.id);
    out.push({
      id: p.id,
      name: p.name,
      branch_id: p.branch_id,
      branch_name: brName(p.branch_id),
      category: p.category,
      unit: p.unit || '',
      current_stock: p.current_stock || 0,
      daily_usage: p.daily_usage,
      days_left: dleft,
      qty,
      price,
      cost: qty * price
    });
  });
  return out.sort((a, b) => a.days_left - b.days_left);
}

function renderOrders(c) {
  const list = computeReorderList();
  const target = orderTargetDays();
  const thr    = orderThresholdDays();

  const totalCost   = list.reduce((s, x) => s + x.cost, 0);
  const urgentCount = list.filter(x => x.days_left <= 2).length;
  const noPrice     = list.filter(x => x.price <= 0).length;

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Avtomatik buyurtma — Sotib olish kerak</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="printOrderList()"><i class="ti ti-printer"></i>Zayavkani chop etish</button>
        <button class="btn btn-secondary" onclick="copyOrderList()"><i class="ti ti-copy"></i>Nusxa olish</button>
      </div>
    </div>

    <!-- Sozlamalar -->
    <div class="card" style="padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <div style="font-size:13px;color:#64748b"><i class="ti ti-settings" style="vertical-align:-2px"></i> Sozlama:</div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:13px">Buyurtma chegarasi (≤ kun):</label>
        <input type="number" id="ord-thr" value="${thr}" min="1" style="width:70px" class="form-input" onchange="saveOrderSettings()">
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:13px">Maqsad zaxira (kun):</label>
        <input type="number" id="ord-target" value="${target}" min="1" style="width:70px" class="form-input" onchange="saveOrderSettings()">
      </div>
      <div style="font-size:12px;color:#94a3b8">Qolgani ≤ ${thr} kun bo'lsa — ${target} kunlik zaxiraga yetadigan miqdor taklif qilinadi.</div>
    </div>

    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-icon amber"><i class="ti ti-clipboard-list"></i></div>
        <div><div class="stat-label">Buyurtma kerak</div>
          <div class="stat-value">${list.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="ti ti-alarm"></i></div>
        <div><div class="stat-label">Shoshilinch (≤2 kun)</div>
          <div class="stat-value">${urgentCount}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Taxminiy summa</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(totalCost)}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="ti ti-help-circle"></i></div>
        <div><div class="stat-label">Narxsiz (xarid tarixi yo'q)</div>
          <div class="stat-value">${noPrice}</div></div>
      </div>
    </div>

    ${list.length === 0 ? `
      <div class="card"><div class="empty-state" style="padding:40px">
        <i class="ti ti-circle-check" style="color:#22c55e"></i>
        <p>Hammasi joyida! Hozircha buyurtma qilish kerak bo'lgan tovar yo'q.</p>
      </div></div>
    ` : `
    <div class="card"><div class="table-wrap">
      <table id="orders-table">
        <thead><tr>
          <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarf</th>
          <th>Qolgan</th><th>Tavsiya miqdor</th><th>Oxirgi narx</th><th>Taxminiy summa</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(x => `
            <tr>
              <td style="font-weight:600">${esc(x.name)}
                ${x.category ? `<div style="font-size:11px;color:#94a3b8">${esc(x.category)}</div>` : ''}</td>
              <td><span class="badge badge-gray">${esc(x.branch_name)}</span></td>
              <td>${(+x.current_stock).toLocaleString('uz-UZ')} ${esc(x.unit)}</td>
              <td style="color:#64748b">${x.daily_usage} ${esc(x.unit)}/kun</td>
              <td>${statusBadge(x.days_left)}</td>
              <td style="font-weight:700;color:var(--teal)">+${x.qty.toLocaleString('uz-UZ')} ${esc(x.unit)}</td>
              <td>${x.price > 0 ? fmtMoney(x.price) : '<span style="color:#cbd5e1">—</span>'}</td>
              <td style="font-weight:700">${x.cost > 0 ? fmtMoney(x.cost) : '<span style="color:#cbd5e1">—</span>'}</td>
              <td style="white-space:nowrap;text-align:right">
                <button class="btn btn-sm btn-primary btn-icon" title="Sotib olishga o'tish" onclick="orderToPurchase(${x.id}, ${x.qty})"><i class="ti ti-shopping-cart"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div></div>
    <div style="text-align:right;padding:8px 20px;font-size:13px;color:#64748b">
      Jami taxminiy: <strong style="color:var(--teal);font-size:15px">${fmtMoney(totalCost)}</strong> (${list.length} ta tovar)
    </div>
    `}`;
  paintIcons(c);
}

function saveOrderSettings() {
  const thr    = document.getElementById('ord-thr')?.value;
  const target = document.getElementById('ord-target')?.value;
  if (thr)    localStorage.setItem('order_threshold_days', thr);
  if (target) localStorage.setItem('order_target_days', target);
  renderSection('orders');
}

// Ro'yxatdan to'g'ridan-to'g'ri sotib olish modalini ochish (miqdor oldindan to'ldirilgan)
function orderToPurchase(productId, qty) {
  const p = products.find(x => x.id == productId);
  if (!p) return;
  const price = lastPurchasePrice(productId);
  _purchModal('Sotib olish qoʻshish', 'savePurchase(null)', {
    branch_id:    p.branch_id,
    product_name: p.name,
    quantity:     qty,
    unit_price:   price || ''
  });
}

// Zayavka matni (chop etish / nusxa olish uchun)
function buildOrderText() {
  const list = computeReorderList();
  if (!list.length) return 'Buyurtma qilish kerak bo\'lgan tovar yo\'q.';
  const d = new Date().toLocaleDateString('uz-UZ');
  let txt = `SOTIB OLISH ZAYAVKASI — ${d}\n${'='.repeat(40)}\n`;
  // Filial bo'yicha guruhlash
  const byBranch = {};
  list.forEach(x => { (byBranch[x.branch_name] ||= []).push(x); });
  let total = 0;
  Object.keys(byBranch).forEach(bn => {
    txt += `\n📍 ${bn}:\n`;
    byBranch[bn].forEach((x, i) => {
      total += x.cost;
      txt += `  ${i + 1}. ${x.name} — ${x.qty} ${x.unit}` +
             (x.cost > 0 ? ` (~${fmtMoney(x.cost)})` : '') + `\n`;
    });
  });
  txt += `\n${'='.repeat(40)}\nJami taxminiy: ${fmtMoney(total)}`;
  return txt;
}

function copyOrderList() {
  const txt = buildOrderText();
  navigator.clipboard?.writeText(txt).then(
    () => toast('Zayavka nusxalandi'),
    () => toast('Nusxalab bo\'lmadi', 'error')
  );
}

function printOrderList() {
  const list = computeReorderList();
  const d = new Date().toLocaleDateString('uz-UZ');
  const byBranch = {};
  list.forEach(x => { (byBranch[x.branch_name] ||= []).push(x); });
  let total = 0;
  let rows = '';
  Object.keys(byBranch).forEach(bn => {
    rows += `<tr><td colspan="5" style="background:#f5f1f1;font-weight:700;padding:8px 10px">📍 ${esc(bn)}</td></tr>`;
    byBranch[bn].forEach((x, i) => {
      total += x.cost;
      rows += `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(x.name)}</td>
        <td>${x.qty} ${esc(x.unit)}</td>
        <td>${x.price > 0 ? fmtMoney(x.price) : '—'}</td>
        <td style="text-align:right">${x.cost > 0 ? fmtMoney(x.cost) : '—'}</td>
      </tr>`;
    });
  });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Zayavka</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#1e293b}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#9E1C20;color:#fff;padding:9px 10px;text-align:left}
      td{padding:8px 10px;border-bottom:1px solid #e5e7eb}
      .total{margin-top:16px;text-align:right;font-size:15px;font-weight:700}
    </style></head><body>
    <h1>Sotib olish zayavkasi</h1>
    <div class="sub">Sana: ${d} &nbsp;•&nbsp; SaTashkent Ta'minot Bo'limi</div>
    <table>
      <thead><tr><th style="width:40px">№</th><th>Mahsulot</th><th>Miqdor</th><th>Oxirgi narx</th><th style="text-align:right">Taxminiy summa</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Jami taxminiy: ${fmtMoney(total)}</div>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up bloklangan', 'error'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
