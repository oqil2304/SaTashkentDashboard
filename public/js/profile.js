// ─── profile.js — Shaxsiy kabinet ────────────────────────────────────────────
console.log('[profile.js] yuklandi');

function renderProfile(c) {
  const u = currentUser || {};
  const roleLabel = u.role === 'admin' ? 'Administrator' : 'Foydalanuvchi';
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Shaxsiy kabinet</div>
    </div>

    <div class="profile-grid">
      <div class="card profile-card">
        <div class="profile-avatar">${esc((u.username || 'U')[0].toUpperCase())}</div>
        <div class="profile-name">${esc(u.full_name || u.username || '')}</div>
        <div class="profile-username">@${esc(u.username || '')}</div>
        <span class="badge ${u.role === 'admin' ? 'badge-red' : 'badge-gray'}" style="margin-top:10px">
          <i class="ti ti-shield"></i>${roleLabel}
        </span>
        <div class="profile-meta">
          ${u.email ? `<div><i class="ti ti-mail"></i>${esc(u.email)}</div>` : ''}
          ${u.phone ? `<div><i class="ti ti-phone"></i>${esc(u.phone)}</div>` : ''}
          ${u.created_at ? `<div><i class="ti ti-calendar-off"></i>Roʻyxatdan: ${esc(String(u.created_at).split(' ')[0])}</div>` : ''}
        </div>
      </div>

      <div class="card" style="padding:22px">
        <div style="font-weight:700;font-size:15px;margin-bottom:16px"><i class="ti ti-settings" style="vertical-align:-3px;margin-right:6px"></i>Maʼlumotlarni tahrirlash</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">To'liq ism</label>
            <input class="form-control" id="pf-fullname" value="${esc(u.full_name || '')}"></div>
          <div class="form-group"><label class="form-label">Gmail</label>
            <input class="form-control" id="pf-email" value="${esc(u.email || '')}" placeholder="email@gmail.com"></div>
        </div>
        <div class="form-group"><label class="form-label">Telefon</label>
          <input class="form-control" id="pf-phone" value="${esc(u.phone || '')}" placeholder="+998 ..."></div>
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button class="btn btn-primary" onclick="saveProfileInfo()"><i class="ti ti-check"></i>Saqlash</button>
        </div>

        <div style="border-top:1px solid var(--border);margin:22px 0 18px"></div>

        <div style="font-weight:700;font-size:15px;margin-bottom:16px"><i class="ti ti-key" style="vertical-align:-3px;margin-right:6px"></i>Parolni o'zgartirish</div>
        <div class="form-group"><label class="form-label">Joriy parol</label>
          <input class="form-control" type="password" id="pf-curpass" placeholder="••••••••"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Yangi parol</label>
            <input class="form-control" type="password" id="pf-newpass" placeholder="••••••••"></div>
          <div class="form-group"><label class="form-label">Yangi parolni takror</label>
            <input class="form-control" type="password" id="pf-newpass2" placeholder="••••••••"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button class="btn btn-primary" onclick="saveProfilePassword()"><i class="ti ti-key"></i>Parolni yangilash</button>
        </div>
      </div>
    </div>`;
}

async function saveProfileInfo() {
  const body = {
    full_name: document.getElementById('pf-fullname').value.trim(),
    email:     document.getElementById('pf-email').value.trim(),
    phone:     document.getElementById('pf-phone').value.trim()
  };
  try {
    await api('PUT', '/api/profile', body);
    currentUser = await api('GET', '/api/me');
    applyUserToSidebar();
    toast('Maʼlumotlar saqlandi');
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function saveProfilePassword() {
  const cur  = document.getElementById('pf-curpass').value;
  const np   = document.getElementById('pf-newpass').value;
  const np2  = document.getElementById('pf-newpass2').value;
  if (!cur || !np) { toast('Joriy va yangi parol kerak', 'error'); return; }
  if (np.length < 4) { toast('Yangi parol kamida 4 belgidan iborat boʻlsin', 'error'); return; }
  if (np !== np2) { toast('Yangi parollar mos kelmadi', 'error'); return; }
  try {
    await api('PUT', '/api/profile', { current_password: cur, new_password: np });
    toast('Parol yangilandi');
    document.getElementById('pf-curpass').value = '';
    document.getElementById('pf-newpass').value = '';
    document.getElementById('pf-newpass2').value = '';
  } catch (e) { toast(e.message, 'error'); }
}
