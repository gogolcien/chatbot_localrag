const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
    pendientes: path.join(DATA_DIR, 'pendientes.json'),
    aprobadas: path.join(DATA_DIR, 'aprobadas.json')
};

function ensureFile(filePath) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf-8');
}

function readAll(name) {
    const filePath = FILES[name];
    ensureFile(filePath);
    const raw = fs.readFileSync(filePath, 'utf-8');
    try {
        return JSON.parse(raw || '[]');
    } catch (err) {
        console.error(`[store] Error leyendo ${name}.json, se recupera como arreglo vacío:`, err.message);
        return [];
    }
}

// Escritura atómica: escribe a un archivo temporal y luego renombra,
// para evitar corromper el JSON si el proceso se interrumpe a la mitad.
function writeAll(name, items) {
    const filePath = FILES[name];
    ensureFile(filePath);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(items, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
}

function newId() {
    return crypto.randomUUID();
}

const store = {
    // ---------- PENDIENTES ----------
    listPendientes() {
        return readAll('pendientes').sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
    },
    addPendiente({ pregunta, pregunta_normalizada, respuesta, embedding, agente, contexto_usado }) {
        const items = readAll('pendientes');
        const item = {
            id: newId(),
            pregunta,
            pregunta_normalizada,
            respuesta,
            embedding: embedding || null,
            agente: agente || null,
            // Referencias (preguntas ya aprobadas) que se le dieron al modelo como contexto
            // RAG para generar esta respuesta. Util para revisar en el panel de admin
            // en que se baso el modelo, aunque no haya sido un hit exacto de cache.
            contexto_usado: Array.isArray(contexto_usado) ? contexto_usado : [],
            estado: 'pendiente',
            fecha_creacion: new Date().toISOString()
        };
        items.push(item);
        writeAll('pendientes', items);
        return item;
    },
    getPendiente(id) {
        return readAll('pendientes').find(p => p.id === id) || null;
    },
    removePendiente(id) {
        const items = readAll('pendientes');
        const idx = items.findIndex(p => p.id === id);
        if (idx === -1) return null;
        const [removed] = items.splice(idx, 1);
        writeAll('pendientes', items);
        return removed;
    },

    // ---------- APROBADAS (caché semántico) ----------
    listAprobadas() {
        return readAll('aprobadas').sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
    },
    addAprobada({ pregunta, pregunta_normalizada, respuesta, embedding, tags, origen }) {
        const items = readAll('aprobadas');
        const item = {
            id: newId(),
            pregunta,
            pregunta_normalizada,
            respuesta,
            embedding: embedding || null,
            tags: Array.isArray(tags) ? tags : [],
            origen: origen || 'manual', // 'modelo' (aprobada desde pendientes) | 'manual'
            usos: 0,
            fecha_creacion: new Date().toISOString()
        };
        items.push(item);
        writeAll('aprobadas', items);
        return item;
    },
    updateAprobada(id, patch) {
        const items = readAll('aprobadas');
        const idx = items.findIndex(a => a.id === id);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...patch, id: items[idx].id };
        writeAll('aprobadas', items);
        return items[idx];
    },
    removeAprobada(id) {
        const items = readAll('aprobadas');
        const idx = items.findIndex(a => a.id === id);
        if (idx === -1) return null;
        const [removed] = items.splice(idx, 1);
        writeAll('aprobadas', items);
        return removed;
    },
    incrementUso(id) {
        const items = readAll('aprobadas');
        const idx = items.findIndex(a => a.id === id);
        if (idx === -1) return;
        items[idx].usos = (items[idx].usos || 0) + 1;
        writeAll('aprobadas', items);
    }
};

module.exports = store;
