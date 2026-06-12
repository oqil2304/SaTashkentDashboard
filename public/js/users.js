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
      </div>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Foydalanuvchi</th><th>Aloqa</th><th>Rol</th><th>Holat</th><th>Roʻyxatdan</th><th style="text-align:right">Amallar</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>
                <div style="font-weight:600">${esc(u.full_name || u.username)}</div>
                <div style="font-size:12px;color:#94a3b8">@${esc(u.username)}</div>
              </td>
              <td style="font-size:13px;color:#64748b">
                ${u.email ? `<div><i class="ti ti-mail" style="font-size:13px"></i> ${esc(u.email)}</div>` : ''}
                ${u.phone ? `<div><i class="ti ti-phone" style="font-size:13px"></i> ${esc(u.phone)}</div>` : ''}
                ${(!u.email && !u.phone) ? '—' : ''}
              </td>
              <td><span class="badge ${u.role === 'admin' ? 'badge-red' : 'badge-gray'}"><i class="ti ti-shield"></i>${u.role === 'admin' ? 'Admin' : 'Foydalanuvchi'}</span></td>
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
                  <button class="btn btn-sm btn-secondary btn-icon" title="Parolni almashtirish" onclick="openResetUserPass(${u.id})"><i class="ti ti-key"></i></button>
                  ${u.id !== currentUser.id
                    ? `<button class="btn btn-sm btn-secondary btn-icon" title="Rolni almashtirish" onclick="toggleUserRole(${u.id})"><i class="ti ti-shield"></i></button>
                       <button class="btn btn-sm btn-danger btn-icon" title="Oʻchirish" onclick="delUser(${u.id})"><i class="ti ti-trash"></i></button>` : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
}

async function setUserStatus(id, status) {
  try {
    await api('PUT', `/api/users/${id}/status`, { status });
    toast(status === 'active' ? 'Tasdiqlandi' : status === 'blocked' ? 'Bloklandi' : 'Yangilandi');
    renderSection('users');
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleUserRole(id) {
  const u = users.find(x => x.id == id); if (!u) return;
  const role = u.role === 'admin' ? 'user' : 'admin';
  if (!confirm(`"${u.username}" roli "${role === 'admin' ? 'Administrator' : 'Foydalanuvchi'}" qilinsinmi?`)) return;
  try {
    await api('PUT', `/api/users/${id}/role`, { role });
    toast('Rol yangilandi');
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
        <b>@${esc(u.username)}</b> uchun yangi parol o'rnating.
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
