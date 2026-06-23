// ─── users.js — Foydalanuvchilar boshqaruvi (faqat admin) ────────────────────
console.log('[users.js] yuklandi');

async function loadUsers() {
  try { users = await api('GET', '/api/users'); }
  catch (e) { users = []; }
}

function userStatusBadge(s) {
  if (s === 'active')  return `<span class="badge badge-green"><i class="ti ti-user-check"></i>Faol</span>`;
  if (s === 'pending') return `<span class="badge badge-amber"><i class="ti ti-clock-hour-4"></i>Kutilmoqda</span>`;
  if (s === 'blocked') return `<span class="badge badge-red"><i class="ti ti-user-x"></i>Bloklangan</span>`;
  return `<span class="badge badge-gray">${esc(s || '')}</span>`;
}

function userRoleBadge(u) {
  const labels = { admin: ['badge-red','Administrator'], branch: ['badge-amber','Filial omborchisi'], viewer: ['badge-blue','Kuzatuvchi'], user: ['badge-gray','Foydalanuvchi'] };
  const [cls, label] = labels[u.role] || ['badge-gray', u.role];
  return `<span class="badge ${cls}"><i class="ti ti-shield"></i>${label}</span>`;
}

async function renderUsers(c) {
  c.innerHTML = `<div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Yuklanmoqda...</span></div>`;
  await loadUsers();

  const pending = users.filter(u => u.status === 'pending').length;
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Foydalanuvchilar</div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge badge-gray"><i class="ti ti-users"></i>Jami: ${users.length}</span>
        ${pending ? `<span class="badge badge-amber"><i class="ti ti-clock-hour-4"></i>${pending} ta tasdiq kutmoqda</span>` : ''}
        <button class="btn btn-primary" onclick="openAddUser()"><i class="ti ti-user-plus"></i>Foydalanuvchi qo'shish</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Foydalanuvchi</th><th>Aloqa</th><th>Rol / Filial</th><th>Holat</th><th>Roʻyxatdan</th><th style="text-align:right">Amallar</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:34px;height:34px;border-radius:50%;background:var(--teal);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px">
                    ${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover">` : (u.full_name||u.username||'?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style="font-weight:600">${esc(u.full_name || u.username)}</div>
                    <div style="font-size:12px;color:#94a3b8">@${esc(u.username)}</div>
                  </div>
                </div>
              </td>
              <td style="font-size:13px;color:#64748b">
                ${u.email ? `<div><i class="ti ti-mail" style="font-size:13px"></i> ${esc(u.email)}</div>` : ''}
                ${u.phone ? `<div><i class="ti ti-phone" style="font-size:13px"></i> ${esc(u.phone)}</div>` : ''}
                ${(!u.email && !u.phone) ? '—' : ''}
              </td>
              <td>
                <div>${userRoleBadge(u)}</div>
                ${u.branch_name ? `<div style="font-size:12px;color:#64748b;margin-top:3px"><i class="ti ti-building-store" style="font-size:11px"></i> ${esc(u.branch_name)}</div>` : ''}
              </td>
              <td>${userStatusBadge(u.status)}</td>
              <td style="font-size:12px;color:#94a3b8">${u.created_at ? esc(String(u.created_at).split(' ')[0]) : '—'}</td>
              <td>
                <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
                  ${u.status === 'pending'
                    ? `<button class="btn btn-sm btn-primary" onclick="setUserStatus(${u.id},'active')"><i class="ti ti-user-check"></i>Tasdiqlash</button>` : ''}
                  ${u.status === 'active' && u.id !== currentUser.id
                    ? `<button class="btn btn-sm btn-secondary btn-icon" title="Bloklash" onclick="setUserStatus(${u.id},'blocked')"><i class="ti ti-user-x"></i></button>` : ''}
                  ${u.status === 'blocked'
                    ? `<button class="btn btn-sm btn-secondary" onclick="setUserStatus(${u.id},'active')"><i class="ti ti-user-check"></i>Faollashtirish</button>` : ''}
                  ${u.id !== currentUser.id ? `
                    <button class="btn btn-sm btn-secondary btn-icon" title="Rol va filial" onclick="openUserRoleModal(${u.id})"><i class="ti ti-shield"></i></button>
                    <button class="btn btn-sm btn-secondary btn-icon" title="Parolni almashtirish" onclick="openResetUserPass(${u.id})"><i class="ti ti-key"></i></button>
                    <button class="btn btn-sm btn-danger btn-icon" title="Oʻchirish" onclick="delUser(${u.id})"><i class="ti ti-trash"></i></button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  paintIcons(c);
}

function openUserRoleModal(id) {
  const u = users.find(x => x.id == id); if (!u) return;
  const brOpts = `<option value="">— Filial belgilanmagan —</option>` +
    branches.map(b => `<option value="${b.id}" ${b.id == u.branch_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Rol va filial — @${esc(u.username)}</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Rol</label>
        <select class="form-control" id="ur-role">
          <option value="admin"   ${u.role==='admin'   ? 'selected':''}>Administrator — barcha ma'lumotlar, to'liq nazorat</option>
          <option value="branch"  ${u.role==='branch'  ? 'selected':''}>Filial omborchisi — faqat o'z filiali, yozish huquqi</option>
          <option value="viewer"  ${u.role==='viewer'  ? 'selected':''}>Kuzatuvchi — barcha ma'lumotlar, faqat ko'rish</option>
          <option value="user"    ${u.role==='user'||u.role==='' ? 'selected':''}>Oddiy foydalanuvchi — ko'rish huquqi</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Filial (filial omborchisi uchun)</label>
        <select class="form-control" id="ur-branch">${brOpts}</select>
      </div>
      <div style="font-size:12px;color:#64748b;padding:8px;background:#f8fafc;border-radius:8px;margin-bottom:4px">
        <b>Filial omborchisi</b>: faqat belgilangan filial ombori, sotib olishlari va rasxodlarini ko'radi va tahrirlaydi.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveUserRole(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveUserRole(id) {
  const role     = document.getElementById('ur-role').value;
  const branchId = document.getElementById('ur-branch').value;
  try {
    await api('PUT', `/api/users/${id}/role`, { role });
    await api('PUT', `/api/users/${id}/branch`, { branch_id: branchId || null });
    toast('Yangilandi');
    closeModal(true);
    renderSection('users');
  } catch (e) { toast(e.message, 'error'); }
}

async function setUserStatus(id, status) {
  try {
    await api('PUT', `/api/users/${id}/status`, { status });
    toast(status === 'active' ? 'Tasdiqlandi' : status === 'blocked' ? 'Bloklandi' : 'Yangilandi');
    renderSection('users');
  } catch (e) { toast(e.message, 'error'); }
}

function openResetUserPass(id) {
  const u = users.find(x => x.id == id); if (!u) return;
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Parolni almashtirish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;color:#64748b;margin-bottom:14px">
        <b>@${esc(u.username)}</b> uchun yangi parol oʻrnating.
      </p>
      <div class="form-group"><label class="form-label">Yangi parol *</label>
        <input class="form-control" type="text" id="up-pass" placeholder="Yangi parol (kamida 4 belgi)"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveUserPass(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveUserPass(id) {
  const pass = document.getElementById('up-pass').value;
  if (!pass || pass.length < 4) { toast('Parol kamida 4 belgidan iborat boʻlsin', 'error'); return; }
  try {
    await api('PUT', `/api/users/${id}/password`, { password: pass });
    toast('Parol almashtirildi');
    closeModal(true);
  } catch (e) { toast(e.message, 'error'); }
}

async function delUser(id) {
  const u = users.find(x => x.id == id); if (!u) return;
  if (!confirm(`"${u.username}" foydalanuvchisini oʻchirishni tasdiqlaysizmi?`)) return;
  try {
    await api('DELETE', `/api/users/${id}`);
    toast("Oʻchirildi");
    renderSection('users');
  } catch (e) { toast(e.message, 'error'); }
}

function openAddUser() {
  const brOpts = `<option value="">— Filial belgilanmagan —</option>` +
    branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Yangi foydalanuvchi qo'shish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">To'liq ism</label>
          <input class="form-control" id="nu-fullname" placeholder="Ism Familiya"></div>
        <div class="form-group"><label class="form-label">Login *</label>
          <input class="form-control" id="nu-username" placeholder="foydalanuvchi" autocomplete="off"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Parol *</label>
          <input class="form-control" id="nu-password" type="password" placeholder="Kamida 4 ta belgi" autocomplete="new-password"></div>
        <div class="form-group"><label class="form-label">Rol</label>
          <select class="form-control" id="nu-role">
            <option value="user">Foydalanuvchi</option>
            <option value="branch">Filial omborchisi</option>
            <option value="viewer">Kuzatuvchi</option>
            <option value="admin">Administrator</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial</label>
          <select class="form-control" id="nu-branch">${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Telefon</label>
          <input class="form-control" id="nu-phone" placeholder="+998 90 123 45 67"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveNewUser()"><i class="ti ti-user-plus"></i>Yaratish</button>
      </div>
    </div>`);
}

async function saveNewUser() {
  const username  = document.getElementById('nu-username')?.value.trim();
  const password  = document.getElementById('nu-password')?.value;
  const full_name = document.getElementById('nu-fullname')?.value.trim();
  const role      = document.getElementById('nu-role')?.value;
  const branch_id = document.getElementById('nu-branch')?.value || null;
  const phone     = document.getElementById('nu-phone')?.value.trim();
  if (!username) { toast('Login kerak', 'error'); return; }
  if (!password || password.length < 4) { toast('Parol kamida 4 ta belgidan iborat bo\'lsin', 'error'); return; }
  try {
    await api('POST', '/api/admin/users', { username, password, full_name, role, branch_id, phone });
    toast(`"${username}" foydalanuvchisi yaratildi ✅`);
    closeModal(true);
    renderSection('users');
  } catch (e) { toast(e.message, 'error'); }
}
