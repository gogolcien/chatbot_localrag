const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido, buscarTopN } = require('../similarity');

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

        // Nivel 3: RAG real. Aunque ninguna aprobada cruzó el umbral de caché, buscamos
        // las N más parecidas (con un piso mínimo para no meter ruido irrelevante) y se
        // las damos al modelo como contexto, para que responda basado en tu información
        // real en vez de solo lo que ya sabía de su entrenamiento.
        const contextoRAG = buscarTopN(embeddingPregunta, aprobadas, config.ragTopN, config.ragMinScore)
            .map(r => ({
                pregunta: r.item.pregunta,
                respuesta: r.item.respuesta,
                score: Number(r.score.toFixed(4))
            }));

        const respuestaModelo = await ollama.generarRespuesta(pregunta, contextoRAG);

        const pendiente = store.addPendiente({
            pregunta,
            pregunta_normalizada: preguntaNormalizada,
            respuesta: respuestaModelo,
            embedding: embeddingPregunta,
            agente,
            contexto_usado: contextoRAG
        });

        return res.json({
            respuesta: respuestaModelo,
            fuente: 'modelo_ia',
            pendiente_revision: true,
            pendiente_id: pendiente.id,
            // la mejor coincidencia encontrada, por si el frontend quiere mostrar contexto/depurar
            similitud_mas_cercana: coincidencia ? Number(coincidencia.score.toFixed(4)) : null,
            contexto_usado: contextoRAG.length
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
