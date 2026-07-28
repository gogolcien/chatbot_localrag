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

router.use(requireAuth);

// ---------- PENDIENTES ----------
router.get('/pendientes', async (req, res) => {
    res.json(await store.listPendientes());
});

router.delete('/pendientes/:id', async (req, res) => {
    const removido = await store.removePendiente(req.params.id);
    if (!removido) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ ok: true });
});

router.post('/pendientes/:id/aprobar', async (req, res) => {
    const pendiente = await store.getPendiente(req.params.id);
    if (!pendiente) return res.status(404).json({ error: 'No encontrado.' });

    const pregunta = (req.body?.pregunta || pendiente.pregunta).trim();
    const respuesta = (req.body?.respuesta || pendiente.respuesta).trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

    try {
        const preguntaCambio = pregunta !== pendiente.pregunta;
        const embedding = preguntaCambio || !pendiente.embedding
            ? await ollama.generarEmbedding(pregunta)
            : pendiente.embedding;

        const aprobada = await store.addAprobada({
            pregunta,
            pregunta_normalizada: normalizar(pregunta),
            respuesta,
            embedding,
            tags,
            origen: 'modelo'
        });

        await store.removePendiente(pendiente.id);
        res.json(aprobada);
    } catch (err) {
        console.error('[admin] Error aprobando pendiente:', err.message);
        res.status(502).json({ error: 'No se pudo generar el embedding con Ollama.', detalle: err.message });
    }
});

// ---------- APROBADAS (caché semántico) ----------
router.get('/aprobadas', async (req, res) => {
    res.json(await store.listAprobadas());
});

router.post('/aprobadas', async (req, res) => {
    const pregunta = (req.body?.pregunta || '').trim();
    const respuesta = (req.body?.respuesta || '').trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];

    if (!pregunta || !respuesta) {
        return res.status(400).json({ error: 'Se requieren "pregunta" y "respuesta".' });
    }

    try {
        const embedding = await ollama.generarEmbedding(pregunta);
        const aprobada = await store.addAprobada({
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
    const aprobadas = await store.listAprobadas();
    const existente = aprobadas.find(a => a.id === req.params.id);
    if (!existente) return res.status(404).json({ error: 'No encontrado.' });

    const pregunta = (req.body?.pregunta || existente.pregunta).trim();
    const respuesta = (req.body?.respuesta || existente.respuesta).trim();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : existente.tags;

    try {
        const preguntaCambio = pregunta !== existente.pregunta;
        const embedding = preguntaCambio ? await ollama.generarEmbedding(pregunta) : existente.embedding;

        const actualizada = await store.updateAprobada(req.params.id, {
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

router.delete('/aprobadas/:id', async (req, res) => {
    const removido = await store.removeAprobada(req.params.id);
    if (!removido) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ ok: true });
});

module.exports = router;