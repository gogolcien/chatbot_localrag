const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido } = require('../similarity');

const router = express.Router();

router.post('/chat', async (req, res) => {
    const pregunta = (req.body?.pregunta || '').trim();
    const agente = req.body?.agente || null;

    if (!pregunta) {
        return res.status(400).json({ error: 'Falta el campo "pregunta".' });
    }

    const preguntaNormalizada = normalizar(pregunta);

    try {
        // Nivel 2: caché semántico (tabla "aprobadas")
        const embeddingPregunta = await ollama.generarEmbedding(pregunta);
        const aprobadas = store.listAprobadas();
        const coincidencia = buscarMasParecido(embeddingPregunta, aprobadas);

        if (coincidencia && coincidencia.score >= config.similarityThreshold) {
            store.incrementUso(coincidencia.item.id);
            return res.json({
                respuesta: coincidencia.item.respuesta,
                fuente: 'cache_semantico',
                similitud: Number(coincidencia.score.toFixed(4)),
                pendiente_revision: false
            });
        }

        // Nivel 3: modelo local (Ollama qwen3:8b)
        const respuestaModelo = await ollama.generarRespuesta(pregunta);

        const pendiente = store.addPendiente({
            pregunta,
            pregunta_normalizada: preguntaNormalizada,
            respuesta: respuestaModelo,
            embedding: embeddingPregunta,
            agente
        });

        return res.json({
            respuesta: respuestaModelo,
            fuente: 'modelo_ia',
            pendiente_revision: true,
            pendiente_id: pendiente.id,
            // la mejor coincidencia encontrada, por si el frontend quiere mostrar contexto/depurar
            similitud_mas_cercana: coincidencia ? Number(coincidencia.score.toFixed(4)) : null
        });
    } catch (err) {
        console.error('[chat] Error:', err.message);
        return res.status(502).json({
            error: 'No se pudo generar una respuesta con el modelo local. Verifica que Ollama esté corriendo.',
            detalle: err.message
        });
    }
});

module.exports = router;
