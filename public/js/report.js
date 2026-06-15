// ─── report.js — Hisobot bo'limi ──────────────────────────────────────────────
console.log('[report.js] yuklandi');

function renderReport(c) {
  const now = new Date();
  const selYear  = now.getFullYear();
  const selMonth = now.getMonth() + 1;

  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const monthOpts = UZ_MONTHS.map((name, i) =>
    `<option value="${i+1}" ${i+1 === selMonth ? 'selected' : ''}>${name}</option>`
  ).join('');
  const yearOpts = [selYear - 1, selYear, selYear + 1]
    .map(y => `<option value="${y}" ${y === selYear ? 'selected' : ''}>${y}</option>`).join('');

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Oylik hisobot</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select class="form-select" id="rep-month" onchange="applyReport()" style="min-width:130px;font-weight:600">${monthOpts}</select>
        <select class="form-select" id="rep-year"  onchange="applyReport()" style="min-width:90px;font-weight:600">${yearOpts}</select>
        <button class="btn btn-secondary" onclick="exportReportExcel()" title="Excel yuklab olish">
          <i class="ti ti-file-spreadsheet"></i>Excel
        </button>
      </div>
    </div>
    <div id="report-body"></div>`;
  applyReport();
}

function applyReport() {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const body  = document.getElementById('report-body');
  if (!body) return;

  const monthPurchases    = purchases.filter(p => (p.purchase_date || '').startsWith(ym));
  const monthConsumptions = consumptions.filter(co => (co.consume_date || '').startsWith(ym));
  const totalSpend = monthPurchases.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);
  const totalCons  = monthConsumptions.length;

  // Sotib olishlar bo'yicha filial statistikasi
  const purchStats = branches.map(b => {
    const bPurch = monthPurchases.filter(p => p.branch_id == b.id);
    const total  = bPurch.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);
    return { ...b, purchase_count: bPurch.length, total_amount: total };
  }).sort((a, b) => b.total_amount - a.total_amount);

  // Rasxodlar bo'yicha filial statistikasi (from_branch_id bo'yicha)
  const consStats = branches.map(b => {
    const bCons    = monthConsumptions.filter(co => co.from_branch_id == b.id);
    const total_cost = bCons.reduce((s, co) => s + (co.quantity || 0) * (co.unit_price || 0), 0);
    return { ...b, cons_count: bCons.length, total_cost };
  }).sort((a, b) => b.total_cost - a.total_cost);

  body.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-icon blue"><i class="ti ti-building-store"></i></div>
        <div><div class="stat-label">Faol filiallar</div>
          <div class="stat-value">${purchStats.filter(b => b.total_amount > 0).length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal"><i class="ti ti-shopping-cart"></i></div>
        <div><div class="stat-label">Jami sotib olishlar</div>
          <div class="stat-value">${monthPurchases.length}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="ti ti-package-export"></i></div>
        <div><div class="stat-label">Jami rasxodlar</div>
          <div class="stat-value">${totalCons}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Jami xarajat</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(totalSpend)}</div></div>
      </div>
    </div>

    <!-- Sotib olishlar jadvali -->
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">
      <i class="ti ti-shopping-cart" style="color:#94a3b8;margin-right:6px"></i>Sotib olishlar
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="table-wrap"><table>
        <thead><tr><th>Filial</th><th>Sotib olishlar</th><th>Jami xarajat</th><th>Ulush</th></tr></thead>
        <tbody>
          ${purchStats.map(b => {
            const pct = totalSpend > 0 ? (b.total_amount / totalSpend * 100).toFixed(1) : 0;
            return `<tr style="cursor:pointer" onclick="openReportPurchDetail(${b.id})">
              <td style="font-weight:600">${esc(b.name)}</td>
              <td>${b.purchase_count}</td>
              <td style="font-weight:700;color:var(--teal)">${fmtMoney(b.total_amount)}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;min-width:60px">
                  <div style="height:100%;background:var(--teal);border-radius:3px;width:${pct}%"></div>
                </div>
                <span style="font-size:12px;color:#64748b;flex-shrink:0">${pct}%</span>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>

    <!-- Rasxodlar jadvali -->
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">
      <i class="ti ti-package-export" style="color:#94a3b8;margin-right:6px"></i>Rasxodlar
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Filial (ombor)</th><th>Rasxodlar soni</th><th>Jami narx</th><th>Ulush</th></tr></thead>
        <tbody>
          ${consStats.map(b => {
            const totalAllCost = consStats.reduce((s, x) => s + x.total_cost, 0);
            const pct = totalAllCost > 0 ? (b.total_cost / totalAllCost * 100).toFixed(1) : 0;
            return `<tr style="cursor:pointer" onclick="openReportConsDetail(${b.id})">
              <td style="font-weight:600">${esc(b.name)}</td>
              <td>${b.cons_count}</td>
              <td style="font-weight:700;color:var(--red)">${b.total_cost > 0 ? fmtMoney(b.total_cost) : '—'}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;min-width:60px">
                  <div style="height:100%;background:var(--red);border-radius:3px;width:${pct}%"></div>
                </div>
                <span style="font-size:12px;color:#64748b;flex-shrink:0">${pct}%</span>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
}

// Filial sotib olishlari detail sahifasi
function openReportPurchDetail(branchId) {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  const branch = branches.find(b => b.id == branchId);
  const bName  = branch ? branch.name : '—';
  const mLabel = `${UZ_MONTHS[month - 1]} ${year}`;
  const list   = purchases.filter(p => p.branch_id == branchId && (p.purchase_date || '').startsWith(ym));
  const total  = list.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  const rows = list.length
    ? list.map(p => `<tr>
        <td style="color:#64748b">${esc(p.purchase_date)}</td>
        <td style="font-weight:600">${esc(p.product_name || '—')}</td>
        <td>${p.quantity} ${esc(p.unit || '')}</td>
        <td>${fmtMoney(p.unit_price)}</td>
        <td style="font-weight:700;color:var(--teal)">${fmtMoney((p.quantity || 0) * (p.unit_price || 0))}</td>
        <td style="color:#64748b">${esc(p.supplier || '—')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state"><i class="ti ti-calendar-off"></i><p>Bu oyda sotib olish yo'q</p></div></td></tr>`;

  const c = document.getElementById('content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('report')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0"><i class="ti ti-building-store" style="color:var(--teal);margin-right:6px"></i>${esc(bName)}</div>
        <div style="font-size:13px;color:#94a3b8">${mLabel} — sotib olishlar · Jami: ${fmtMoney(total)}</div>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Sana</th><th>Mahsulot</th><th>Miqdor</th><th>Narx</th><th>Jami</th><th>Yetkazuvchi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  paintIcons(c);
}

// ── Excel export ──────────────────────────────────────────────────────────────
function exportReportExcel() {
  if (typeof XLSX === 'undefined') { toast('Excel kutubxonasi yuklanmadi', 'error'); return; }

  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const mLabel = `${UZ_MONTHS[month - 1]} ${year}`;

  const monthPurchases    = purchases.filter(p => (p.purchase_date || '').startsWith(ym));
  const monthConsumptions = consumptions.filter(co => (co.consume_date || '').startsWith(ym));
  const totalSpend = monthPurchases.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);

  // 1-varaq: Umumiy xulosa
  const summaryData = [
    ['SaTashkent Ta\'minot Bo\'limi — Oylik hisobot', '', '', ''],
    ['Davr:', mLabel, '', ''],
    ['Eksport sanasi:', new Date().toLocaleDateString('uz-UZ'), '', ''],
    [],
    ['Ko\'rsatkich', 'Qiymat'],
    ['Faol filiallar', branches.filter(b => monthPurchases.some(p => p.branch_id == b.id)).length],
    ['Jami sotib olishlar (ta)', monthPurchases.length],
    ['Jami rasxodlar (ta)', monthConsumptions.length],
    ['Jami xarajat (so\'m)', totalSpend],
    [],
    ['Filiallar bo\'yicha sotib olishlar xarajati'],
    ['Filial', 'Sotib olishlar soni', 'Jami xarajat (so\'m)', 'Ulush (%)'],
    ...branches.map(b => {
      const bPurch = monthPurchases.filter(p => p.branch_id == b.id);
      const amt = bPurch.reduce((s, p) => s + (p.quantity || 0) * (p.unit_price || 0), 0);
      const pct = totalSpend > 0 ? +(amt / totalSpend * 100).toFixed(1) : 0;
      return [b.name, bPurch.length, amt, pct];
    })
  ];

  // 2-varaq: Sotib olishlar
  const purchData = [
    ['Sana', 'Mahsulot', 'Filial', 'Miqdor', 'Birlik', 'Birlik narxi (so\'m)', 'Jami (so\'m)', 'Yetkazuvchi', 'Izoh'],
    ...monthPurchases.map(p => [
      p.purchase_date || '',
      p.product_name || '',
      p.branch_name || '',
      p.quantity || 0,
      p.unit || '',
      p.unit_price || 0,
      (p.quantity || 0) * (p.unit_price || 0),
      p.supplier || '',
      p.note || ''
    ]),
    [],
    ['', '', '', '', '', 'JAMI:', totalSpend, '', '']
  ];

  // 3-varaq: Rasxodlar
  const totalCost = monthConsumptions.reduce((s, co) => s + (co.quantity || 0) * (co.unit_price || 0), 0);
  const consData = [
    ['Sana', 'Mahsulot', 'Filial (ombor)', 'Foydalanuvchi filial', 'Miqdor', 'Birlik', 'Birlik narxi (so\'m)', 'Jami (so\'m)', 'Izoh'],
    ...monthConsumptions.map(co => [
      co.consume_date || '',
      co.product_name || '',
      co.from_branch_name || '',
      co.to_branch_name || '',
      co.quantity || 0,
      co.unit || '',
      co.unit_price || 0,
      (co.quantity || 0) * (co.unit_price || 0),
      co.note === 'auto_daily' ? 'Kunlik sarf' : (co.note || '')
    ]),
    [],
    ['', '', '', '', '', '', 'JAMI:', totalCost, '']
  ];

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 35 }, { wch: 22 }, { wch: 22 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Xulosa');

  const ws2 = XLSX.utils.aoa_to_sheet(purchData);
  ws2['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Sotib olishlar');

  const ws3 = XLSX.utils.aoa_to_sheet(consData);
  ws3['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Rasxodlar');

  const fname = `SaTashkent_Hisobot_${ym}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast(`✅ ${fname} yuklab olindi`);
}

// Filial rasxodlari detail sahifasi
function openReportConsDetail(branchId) {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  const branch = branches.find(b => b.id == branchId);
  const bName  = branch ? branch.name : '—';
  const mLabel = `${UZ_MONTHS[month - 1]} ${year}`;

  const list = consumptions.filter(co =>
    co.from_branch_id == branchId && (co.consume_date || '').startsWith(ym)
  );
  const totalQty   = list.reduce((s, co) => s + (co.quantity || 0), 0);
  const totalCost  = list.reduce((s, co) => s + (co.quantity || 0) * (co.unit_price || 0), 0);
  const autoCount  = list.filter(co => co.note === 'auto_daily').length;

  const rows = list.length
    ? list.map(co => {
        const cross    = co.from_branch_id != co.to_branch_id;
        const isAuto   = co.note === 'auto_daily';
        const noteText = isAuto ? 'Kunlik sarf' : (co.note || '—');
        return `<tr${isAuto ? ' style="background:#fafff9"' : ''}>
          <td style="color:#64748b">${esc(co.consume_date)}</td>
          <td style="font-weight:600">${esc(co.product_name || '—')}</td>
          <td><span class="badge ${cross ? 'badge-amber' : 'badge-blue'}">${esc(co.to_branch_name || '—')}${cross ? ' ⇄' : ''}</span></td>
          <td style="font-weight:700;color:var(--red)">−${co.quantity} ${esc(co.unit || '')}</td>
          <td>${co.unit_price > 0 ? fmtMoney(co.unit_price) : '—'}</td>
          <td style="font-weight:600;color:var(--red)">${co.unit_price > 0 ? fmtMoney((co.quantity||0)*(co.unit_price||0)) : '—'}</td>
          <td style="color:#64748b;font-size:12px">${isAuto ? `<span class="badge badge-teal">${noteText}</span>` : esc(noteText)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-package-export"></i><p>Bu oyda rasxod yo'q</p></div></td></tr>`;

  const c = document.getElementById('content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('report')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0"><i class="ti ti-building-store" style="color:var(--teal);margin-right:6px"></i>${esc(bName)}</div>
        <div style="font-size:13px;color:#94a3b8">${mLabel} — rasxodlar · ${list.length} ta yozuv
          ${autoCount ? `<span style="margin-left:8px;color:#16a34a">· ${autoCount} ta kunlik avtomatik sarf</span>` : ''}
        </div>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Sana</th><th>Mahsulot</th><th>Filial uchun</th><th>Miqdor</th><th>Birlik narx</th><th>Jami</th><th>Izoh</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    ${totalCost > 0 ? `<div style="text-align:right;padding:8px 20px;font-size:13px;color:#64748b">
      Jami: <strong style="color:var(--teal);font-size:15px">${fmtMoney(totalCost)}</strong>
    </div>` : ''}`;
  paintIcons(c);
}
