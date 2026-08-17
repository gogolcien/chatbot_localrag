const api = {
    async get(url) {
        const res = await fetch(url, { credentials: 'include' });
        if (res.status === 401) return redirectLogin();
        return res.json();
    },
    async post(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body || {})
        });
        if (res.status === 401) return redirectLogin();
        return res.json();
    },
    async put(url, body) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body || {})
        });
        if (res.status === 401) return redirectLogin();
        return res.json();
    },
    async del(url) {
        const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
        if (res.status === 401) return redirectLogin();
        return res.json();
    }
};

function redirectLogin() {
    window.location.href = './login.html';
}

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fechaCorta(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch { return iso; }
}

// ---------------- TABS ----------------
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await api.post('/api/admin/logout');
    redirectLogin();
});

// ---------------- PENDIENTES ----------------
async function cargarPendientes() {
    const items = await api.get('/api/admin/pendientes');
    if (!Array.isArray(items)) return;
    document.getElementById('count-pendientes').textContent = items.length ? `(${items.length})` : '';

    const cont = document.getElementById('lista-pendientes');
    if (items.length === 0) {
        cont.innerHTML = '<div class="empty">No hay respuestas pendientes de revisión 🎉</div>';
        return;
    }

    cont.innerHTML = items.map(item => `
        <div class="item-card" data-id="${item.id}">
            <div class="meta">
                <span class="badge">Generada por IA</span>
                <span class="badge">${escapeHtml(item.agente || 'sin agente')}</span>
                <span class="badge">${fechaCorta(item.fecha_creacion)}</span>
            </div>
            <div class="pregunta">Pregunta:</div>
            <input type="text" class="edit-pregunta" value="${escapeHtml(item.pregunta)}">
            <div class="pregunta" style="margin-top:8px">Respuesta del modelo:</div>
            <textarea class="edit-respuesta">${escapeHtml(item.respuesta)}</textarea>
            ${item.menu_mention ? `
            <div id="menu-mention-${item.id}" class="menu-mention">
                ℹ️ También se parece a la opción de menú
                (${escapeHtml(item.menu_mention.ruta)}) — similitud ${item.menu_mention.similitud}
            </div>` : ''}
            <input type="text" class="edit-tags" value="${item.menu_mention ? escapeHtml(item.menu_mention.ruta) : ''}" placeholder="Posible categoría del menú (opcional)">
            <div class="actions">
                <button class="btn-success btn-aprobar">Aprobar y guardar en caché</button>
                <button class="btn-danger btn-rechazar">Rechazar / eliminar</button>
            </div>
        </div>
    `).join('');

    cont.querySelectorAll('.btn-aprobar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.item-card');
            const id = card.dataset.id;
            const pregunta = card.querySelector('.edit-pregunta').value.trim();
            const respuesta = card.querySelector('.edit-respuesta').value.trim();
            const tags = card.querySelector('.edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);

            btn.disabled = true;
            btn.textContent = 'Aprobando...';
            const result = await api.post(`/api/admin/pendientes/${id}/aprobar`, { pregunta, respuesta, tags });
            if (result && result.error) {
                toast(result.error);
                btn.disabled = false;
                btn.textContent = 'Aprobar y guardar en caché';
                return;
            }
            toast('Aprobada y agregada al caché semántico.');
            cargarPendientes();
            cargarAprobadas();
        });
    });

    cont.querySelectorAll('.btn-rechazar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.item-card');
            const id = card.dataset.id;
            if (!confirm('¿Eliminar esta respuesta pendiente?')) return;
            await api.del(`/api/admin/pendientes/${id}`);
            toast('Eliminada.');
            cargarPendientes();
        });
    });
}

// ---------------- APROBADAS ----------------
async function cargarAprobadas() {
    const items = await api.get('/api/admin/aprobadas');
    if (!Array.isArray(items)) return;
    document.getElementById('count-aprobadas').textContent = items.length ? `(${items.length})` : '';

    const cont = document.getElementById('lista-aprobadas');
    if (items.length === 0) {
        cont.innerHTML = '<div class="empty">Aún no hay respuestas aprobadas.</div>';
        return;
    }

    cont.innerHTML = items.map(item => `
        <div class="item-card" data-id="${item.id}">
            <div class="meta">
                <span class="badge origen-${item.origen}">${item.origen === 'manual' ? 'Agregada manual' : 'Aprobada desde IA'}</span>
                <span class="badge">Usos: ${item.usos || 0}</span>
                <span class="badge">${fechaCorta(item.fecha_creacion)}</span>
            </div>
            <div class="pregunta">Pregunta:</div>
            <input type="text" class="edit-pregunta" value="${escapeHtml(item.pregunta)}">
            <div class="pregunta" style="margin-top:8px">Respuesta:</div>
            <textarea class="edit-respuesta">${escapeHtml(item.respuesta)}</textarea>
            <input type="text" class="edit-tags" value="${escapeHtml((item.tags || []).join(', '))}" placeholder="Posible categoría del menú (opcional)">
            <div class="actions">
                <button class="btn-primary btn-guardar">Guardar cambios</button>
                <button class="btn-danger btn-eliminar">Eliminar</button>
            </div>
        </div>
    `).join('');

    cont.querySelectorAll('.btn-guardar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.item-card');
            const id = card.dataset.id;
            const pregunta = card.querySelector('.edit-pregunta').value.trim();
            const respuesta = card.querySelector('.edit-respuesta').value.trim();
            const tags = card.querySelector('.edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);

            btn.disabled = true;
            btn.textContent = 'Guardando...';
            const result = await api.put(`/api/admin/aprobadas/${id}`, { pregunta, respuesta, tags });
            btn.disabled = false;
            btn.textContent = 'Guardar cambios';
            if (result && result.error) { toast(result.error); return; }
            toast('Cambios guardados.');
            cargarAprobadas();
        });
    });

    cont.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.item-card');
            const id = card.dataset.id;
            if (!confirm('¿Eliminar esta entrada del caché semántico?')) return;
            await api.del(`/api/admin/aprobadas/${id}`);
            toast('Eliminada.');
            cargarAprobadas();
        });
    });
}

document.getElementById('btn-agregar-aprobada').addEventListener('click', async () => {
    const pregunta = document.getElementById('nueva-pregunta').value.trim();
    const respuesta = document.getElementById('nueva-respuesta').value.trim();
    const tags = document.getElementById('nuevos-tags').value.split(',').map(t => t.trim()).filter(Boolean);

    if (!pregunta || !respuesta) {
        toast('Escribe una pregunta y una respuesta.');
        return;
    }

    const btn = document.getElementById('btn-agregar-aprobada');
    btn.disabled = true;
    btn.textContent = 'Agregando...';
    const result = await api.post('/api/admin/aprobadas', { pregunta, respuesta, tags });
    btn.disabled = false;
    btn.textContent = 'Agregar a aprobadas';

    if (result && result.error) { toast(result.error); return; }

    document.getElementById('nueva-pregunta').value = '';
    document.getElementById('nueva-respuesta').value = '';
    document.getElementById('nuevos-tags').value = '';
    toast('Agregada al caché semántico.');
    cargarAprobadas();
});

// ---------------- INIT ----------------
(async function init() {
    const session = await api.get('/api/admin/session');
    if (!session || !session.isAdmin) return redirectLogin();
    cargarPendientes();
    cargarAprobadas();
})();