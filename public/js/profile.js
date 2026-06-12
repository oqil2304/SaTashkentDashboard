// ─── profile.js — Shaxsiy kabinet ────────────────────────────────────────────
console.log('[profile.js] yuklandi');

function renderProfile(c) {
  const u = currentUser || {};
  const roleLabel = ROLE_LABELS[u.role] || u.role;
  const badgeClass = u.role === 'admin' ? 'badge-red' : u.role === 'branch' ? 'badge-amber' : 'badge-gray';
  const branchLine = (u.role === 'branch' && u.branch_id)
    ? `<div style="font-size:12px;color:#64748b;margin-top:4px"><i class="ti ti-building-store"></i> ${esc(brName(u.branch_id))}</div>` : '';

  const avatarHtml = u.avatar
    ? `<img src="${u.avatar}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span style="font-size:32px;font-weight:700;color:#fff">${(u.full_name || u.username || 'U')[0].toUpperCase()}</span>`;

  c.innerHTML = `
    <div class="profile-grid">
      <div class="card profile-card">
        <div class="profile-avatar" id="pf-avatar-wrap" style="position:relative;cursor:pointer" title="Rasm yuklash" onclick="document.getElementById('pf-avatar-inp').click()">
          ${avatarHtml}
          <div style="position:absolute;bottom:0;right:0;background:var(--teal);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #fff">
            <i class="ti ti-camera" style="font-size:14px;color:#fff"></i>
          </div>
        </div>
        <input type="file" id="pf-avatar-inp" accept="image/*" style="display:none" onchange="uploadAvatar(this)">
        <div class="profile-name">${esc(u.full_name || u.username || '')}</div>
        <div class="profile-username">@${esc(u.username || '')}</div>
        <span class="badge ${badgeClass}" style="margin-top:10px">
          <i class="ti ti-shield"></i>${roleLabel}
        </span>
        ${branchLine}
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
  paintIcons(c);
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast("Rasm 2MB dan katta bo'lmasin", 'error'); return; }
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const res = await fetch('/api/profile/avatar', {
      method: 'POST', body: formData, credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Xato');
    currentUser.avatar = data.avatar;
    applyUserToSidebar();
    toast('Rasm yangilandi');
    renderSection('profile');
  } catch (e) { toast(e.message, 'error'); }
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
    renderSection('profile');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveProfilePassword() {
  const cur = document.getElementById('pf-curpass').value;
  const np  = document.getElementById('pf-newpass').value;
  const np2 = document.getElementById('pf-newpass2').value;
  if (!cur || !np) { toast('Joriy va yangi parol kerak', 'error'); return; }
  if (np.length < 4) { toast('Yangi parol kamida 4 belgidan iborat boʻlsin', 'error'); return; }
  if (np !== np2) { toast('Yangi parollar mos kelmadi', 'error'); return; }
  try {
    await api('PUT', '/api/profile', { current_password: cur, new_password: np });
    toast('Parol yangilandi');
    ['pf-curpass','pf-newpass','pf-newpass2'].forEach(id => document.getElementById(id).value = '');
  } catch (e) { toast(e.message, 'error'); }
}
