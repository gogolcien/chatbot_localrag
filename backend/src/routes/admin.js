const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar } = require('../similarity');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------- AUTH ----------
router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (password && password === config.adminPassword) {
        req.session.isAdmin = true;
        return res.json({ ok: true });
    }
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
    res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// A partir de aquí, todo requiere sesión de administrador
router.use(requireAuth);

// ---------- PENDIENTES ----------
router.get('/pendientes', (req, res) => {
    res.json(store.listPendientes());
});

router.delete('/pendientes/:id', (req, res) => {
    const removido = store.removePendiente(req.params.id);
    if (!removido) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ ok: true });
});

// Aprobar un pendiente: lo mueve a "aprobadas" (permite editar pregunta/respuesta/tags antes de aprobar)
router.post('/pendientes/:id/aprobar', async (req, res) => {
    const pendiente = store.getPendiente(req.params.id);
    if (!pendiente) return res.status(404).json({ error: 'No encontrado.' });

    const pregunta = (req.body?.pregunta || pendiente.pregunta).trim();
    const respuesta = (req.body?.respuesta || pendiente.respuesta).trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

    try {
        // Si el admin editó la pregunta, recalculamos el embedding; si no, reusamos el ya calculado.
        const preguntaCambio = pregunta !== pendiente.pregunta;
        const embedding = preguntaCambio || !pendiente.embedding
            ? await ollama.generarEmbedding(pregunta)
            : pendiente.embedding;

        const aprobada = store.addAprobada({
            pregunta,
            pregunta_normalizada: normalizar(pregunta),
            respuesta,
            embedding,
            tags,
            origen: 'modelo'
        });

        store.removePendiente(pendiente.id);
        res.json(aprobada);
    } catch (err) {
        console.error('[admin] Error aprobando pendiente:', err.message);
        res.status(502).json({ error: 'No se pudo generar el embedding con Ollama.', detalle: err.message });
    }
});

// ---------- APROBADAS (caché semántico) ----------
router.get('/aprobadas', (req, res) => {
    res.json(store.listAprobadas());
});

// Agregar manualmente una pregunta/respuesta externa directamente a "aprobadas"
router.post('/aprobadas', async (req, res) => {
    const pregunta = (req.body?.pregunta || '').trim();
    const respuesta = (req.body?.respuesta || '').trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

    if (!pregunta || !respuesta) {
        return res.status(400).json({ error: 'Se requieren "pregunta" y "respuesta".' });
    }

    try {
        const embedding = await ollama.generarEmbedding(pregunta);
        const aprobada = store.addAprobada({
            pregunta,
            pregunta_normalizada: normalizar(pregunta),
            respuesta,
            embedding,
            tags,
            origen: 'manual'
        });
        res.status(201).json(aprobada);
    } catch (err) {
        console.error('[admin] Error agregando aprobada manual:', err.message);
        res.status(502).json({ error: 'No se pudo generar el embedding con Ollama.', detalle: err.message });
    }
});

router.put('/aprobadas/:id', async (req, res) => {
    const existente = store.listAprobadas().find(a => a.id === req.params.id);
    if (!existente) return res.status(404).json({ error: 'No encontrado.' });

    const pregunta = (req.body?.pregunta || existente.pregunta).trim();
    const respuesta = (req.body?.respuesta || existente.respuesta).trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : existente.tags;

    try {
        const preguntaCambio = pregunta !== existente.pregunta;
        const embedding = preguntaCambio ? await ollama.generarEmbedding(pregunta) : existente.embedding;

        const actualizada = store.updateAprobada(req.params.id, {
            pregunta,
            pregunta_normalizada: normalizar(pregunta),
            respuesta,
            tags,
            embedding
        });
        res.json(actualizada);
    } catch (err) {
        console.error('[admin] Error actualizando aprobada:', err.message);
        res.status(502).json({ error: 'No se pudo generar el embedding con Ollama.', detalle: err.message });
    }
});

router.delete('/aprobadas/:id', (req, res) => {
    const removido = store.removeAprobada(req.params.id);
    if (!removido) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ ok: true });
});

module.exports = router;
