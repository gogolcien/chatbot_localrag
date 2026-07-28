const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const DATA_DIR = path.join(__dirname, '..', 'data');

function leerJSON(nombre) {
    const filePath = path.join(DATA_DIR, nombre);
    if (!fs.existsSync(filePath)) {
        console.warn(`[migrar] No existe ${filePath}, se omite.`);
        return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw || '[]');
}

async function migrarAprobadas() {
    const items = leerJSON('aprobadas.json');
    console.log(`[migrar] ${items.length} registros en aprobadas.json`);

    for (const item of items) {
        await pool.query(
            `INSERT INTO aprobadas
             (id, pregunta, pregunta_normalizada, respuesta, embedding, tags, origen, usos, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.id,
                item.pregunta,
                item.pregunta_normalizada || null,
                item.respuesta,
                item.embedding ? JSON.stringify(item.embedding) : null,
                JSON.stringify(item.tags || []),
                item.origen || 'manual',
                item.usos || 0,
                item.fecha_creacion ? new Date(item.fecha_creacion) : new Date()
            ]
        );
    }
    console.log('[migrar] aprobadas.json migrado.');
}

async function migrarPendientes() {
    const items = leerJSON('pendientes.json');
    console.log(`[migrar] ${items.length} registros en pendientes.json`);

    for (const item of items) {
        await pool.query(
            `INSERT INTO pendientes
             (id, pregunta, pregunta_normalizada, respuesta, embedding, agente, contexto_usado, menu_mention, estado, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.id,
                item.pregunta,
                item.pregunta_normalizada || null,
                item.respuesta,
                item.embedding ? JSON.stringify(item.embedding) : null,
                item.agente || null,
                JSON.stringify(item.contexto_usado || []),
                item.menu_mention ? JSON.stringify(item.menu_mention) : null,
                item.estado || 'pendiente',
                item.fecha_creacion ? new Date(item.fecha_creacion) : new Date()
            ]
        );
    }
    console.log('[migrar] pendientes.json migrado.');
}

(async () => {
    try {
        await migrarAprobadas();
        await migrarPendientes();
        console.log('[migrar] Migración completa.');
    } catch (err) {
        console.error('[migrar] Error durante la migración:', err.message);
    } finally {
        await pool.end();
    }
})();