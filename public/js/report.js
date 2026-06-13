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
      <div style="display:flex;gap:10px;align-items:center">
        <select class="form-select" id="rep-month" onchange="applyReport()" style="min-width:130px;font-weight:600">${monthOpts}</select>
        <select class="form-select" id="rep-year"  onchange="applyReport()" style="min-width:90px;font-weight:600">${yearOpts}</select>
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
    const bCons = monthConsumptions.filter(co => co.from_branch_id == b.id);
    const qty   = bCons.reduce((s, co) => s + (co.quantity || 0), 0);
    return { ...b, cons_count: bCons.length, total_qty: qty };
  }).sort((a, b) => b.cons_count - a.cons_count);

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
        <thead><tr><th>Filial (ombor)</th><th>Rasxodlar soni</th><th>Jami miqdor</th><th>Ulush</th></tr></thead>
        <tbody>
          ${consStats.map(b => {
            const pct = totalCons > 0 ? (b.cons_count / totalCons * 100).toFixed(1) : 0;
            return `<tr style="cursor:pointer" onclick="openReportConsDetail(${b.id})">
              <td style="font-weight:600">${esc(b.name)}</td>
              <td>${b.cons_count}</td>
              <td style="font-weight:700;color:var(--red)">${b.total_qty > 0 ? '−' + b.total_qty : '—'}</td>
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

// Filial rasxodlari detail sahifasi
function openReportConsDetail(branchId) {
  const month = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth() + 1);
  const year  = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

  const branch  = branches.find(b => b.id == branchId);
  const bName   = branch ? branch.name : '—';
  const mLabel  = `${UZ_MONTHS[month - 1]} ${year}`;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Qo'lda kiritilgan rasxodlar
  const manualList = consumptions.filter(co =>
    co.from_branch_id == branchId && (co.consume_date || '').startsWith(ym)
  );

  // Kunlik sarf hisoblangan yozuvlar (daily_usage > 0 bo'lgan mahsulotlar)
  const dailyList = products
    .filter(p => p.branch_id == branchId && p.daily_usage > 0)
    .map(p => ({
      _type:       'daily',
      consume_date: ym,
      product_name: p.name,
      to_branch_name: bName,
      from_branch_id: branchId,
      to_branch_id:   branchId,
      quantity:     +(p.daily_usage * daysInMonth).toFixed(2),
      unit:         p.unit || '',
      note:         `Kunlik sarf × ${daysInMonth} kun`
    }));

  // Birlashtirilgan ro'yxat: avval qo'lda, keyin kunlik
  const allRows = [
    ...manualList.map(co => {
      const cross = co.from_branch_id != co.to_branch_id;
      return `<tr>
        <td style="color:#64748b">${esc(co.consume_date)}</td>
        <td style="font-weight:600">${esc(co.product_name || '—')}</td>
        <td><span class="badge ${cross ? 'badge-amber' : 'badge-blue'}">${esc(co.to_branch_name || '—')}${cross ? ' ⇄' : ''}</span></td>
        <td style="font-weight:700;color:var(--red)">−${co.quantity} ${esc(co.unit || '')}</td>
        <td style="color:#64748b">${esc(co.note || '—')}</td>
      </tr>`;
    }),
    ...dailyList.map(d => `<tr style="background:#fafafa">
        <td style="color:#64748b">${esc(d.consume_date)}</td>
        <td style="font-weight:600">${esc(d.product_name)}</td>
        <td><span class="badge badge-gray">${esc(d.to_branch_name)}</span></td>
        <td style="font-weight:700;color:var(--amber)">~${d.quantity} ${esc(d.unit)}</td>
        <td style="color:#64748b;font-size:11px">${esc(d.note)}</td>
      </tr>`)
  ];

  const totalCount = manualList.length + dailyList.length;
  const rows = allRows.length
    ? allRows.join('')
    : `<tr><td colspan="5"><div class="empty-state"><i class="ti ti-package-export"></i><p>Bu oyda rasxod yo'q</p></div></td></tr>`;

  const c = document.getElementById('content');
  c.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
      <button class="btn btn-secondary btn-icon" onclick="navigate('report')" title="Orqaga"><i class="ti ti-arrow-left"></i></button>
      <div>
        <div class="section-title" style="margin:0"><i class="ti ti-building-store" style="color:var(--teal);margin-right:6px"></i>${esc(bName)}</div>
        <div style="font-size:13px;color:#94a3b8">${mLabel} — rasxodlar · ${totalCount} ta yozuv
          ${dailyList.length ? `<span style="margin-left:8px;color:#f59e0b">· ${dailyList.length} ta kunlik sarf (hisoblangan)</span>` : ''}
        </div>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Sana</th><th>Mahsulot</th><th>Filial uchun</th><th>Miqdor</th><th>Izoh</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
  paintIcons(c);
}
