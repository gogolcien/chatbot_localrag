const pool = require('./db');
const crypto = require('crypto');

function newId() {
    return crypto.randomUUID();
}

// MySQL con mysql2 ya deserializa columnas JSON a objetos JS automáticamente
// al leer, así que no hace falta JSON.parse manual en los selects.

const store = {
    // ---------- PENDIENTES ----------
    async listPendientes() {
        const [rows] = await pool.query(
            'SELECT * FROM pendientes ORDER BY fecha_creacion DESC'
        );
        return rows;
    },

    async addPendiente({ pregunta, pregunta_normalizada, respuesta, embedding, agente, contexto_usado, menu_mention }) {
        const id = newId();
        const fecha_creacion = new Date();
        await pool.query(
            `INSERT INTO pendientes
             (id, pregunta, pregunta_normalizada, respuesta, embedding, agente, contexto_usado, menu_mention, estado, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
            [
                id,
                pregunta,
                pregunta_normalizada,
                respuesta,
                embedding ? JSON.stringify(embedding) : null,
                agente || null,
                JSON.stringify(Array.isArray(contexto_usado) ? contexto_usado : []),
                menu_mention ? JSON.stringify(menu_mention) : null,
                fecha_creacion
            ]
        );
        return {
            id, pregunta, pregunta_normalizada, respuesta,
            embedding: embedding || null,
            agente: agente || null,
            contexto_usado: Array.isArray(contexto_usado) ? contexto_usado : [],
            menu_mention: menu_mention || null,
            estado: 'pendiente',
            fecha_creacion: fecha_creacion.toISOString()
        };
    },

    async getPendiente(id) {
        const [rows] = await pool.query('SELECT * FROM pendientes WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async removePendiente(id) {
        const existente = await store.getPendiente(id);
        if (!existente) return null;
        await pool.query('DELETE FROM pendientes WHERE id = ?', [id]);
        return existente;
    },

    // ---------- APROBADAS (caché semántico) ----------
    async listAprobadas() {
        const [rows] = await pool.query(
            'SELECT * FROM aprobadas ORDER BY fecha_creacion DESC'
        );
        return rows;
    },

    async addAprobada({ pregunta, pregunta_normalizada, respuesta, embedding, tags, origen }) {
        const id = newId();
        const fecha_creacion = new Date();
        await pool.query(
            `INSERT INTO aprobadas
             (id, pregunta, pregunta_normalizada, respuesta, embedding, tags, origen, usos, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
                id,
                pregunta,
                pregunta_normalizada,
                respuesta,
                embedding ? JSON.stringify(embedding) : null,
                JSON.stringify(Array.isArray(tags) ? tags : []),
                origen || 'manual',
                fecha_creacion
            ]
        );
        return {
            id, pregunta, pregunta_normalizada, respuesta,
            embedding: embedding || null,
            tags: Array.isArray(tags) ? tags : [],
            origen: origen || 'manual',
            usos: 0,
            fecha_creacion: fecha_creacion.toISOString()
        };
    },

    async updateAprobada(id, patch) {
        const existente = (await pool.query('SELECT * FROM aprobadas WHERE id = ?', [id]))[0][0];
        if (!existente) return null;

        const merged = { ...existente, ...patch };
        await pool.query(
            `UPDATE aprobadas SET
             pregunta = ?, pregunta_normalizada = ?, respuesta = ?, embedding = ?, tags = ?
             WHERE id = ?`,
            [
                merged.pregunta,
                merged.pregunta_normalizada,
                merged.respuesta,
                merged.embedding ? JSON.stringify(merged.embedding) : null,
                JSON.stringify(Array.isArray(merged.tags) ? merged.tags : []),
                id
            ]
        );
        return store.listAprobadas().then(items => items.find(a => a.id === id));
    },

    async removeAprobada(id) {
        const [rows] = await pool.query('SELECT * FROM aprobadas WHERE id = ?', [id]);
        const existente = rows[0];
        if (!existente) return null;
        await pool.query('DELETE FROM aprobadas WHERE id = ?', [id]);
        return existente;
    },

    async incrementUso(id) {
        await pool.query('UPDATE aprobadas SET usos = usos + 1 WHERE id = ?', [id]);
    }
};

module.exports = store;