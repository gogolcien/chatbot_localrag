const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido, buscarTopN } = require('../similarity');
const { obtenerOpcionesMenuConEmbedding } = require('../menuOpciones');
const rateLimit = require('express-rate-limit'); 

const router = express.Router();

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Demasiadas peticiones, intenta de nuevo en un momento.' }
});

router.post('/chat', chatLimiter, async (req, res) => {
    const pregunta = (req.body?.pregunta || '').trim();
    const agente = req.body?.agente || null;

    if (!pregunta) {
        return res.status(400).json({ error: 'Falta el campo "pregunta".' });
    }

    const preguntaNormalizada = normalizar(pregunta);

    try {
        const embeddingPregunta = await ollama.generarEmbedding(pregunta);

        let mejorOpcionMenu = null;
        let opcionesMenu = [];
        try {
            opcionesMenu = await obtenerOpcionesMenuConEmbedding();
            mejorOpcionMenu = buscarMasParecido(embeddingPregunta, opcionesMenu);
        } catch (errMenu) {
            console.warn('[chat] No se pudieron comparar las opciones de menú:', errMenu.message);
        }

        // Nivel 2: caché semántico (tabla "aprobadas")
        const aprobadas = await store.listAprobadas();
        const coincidencia = buscarMasParecido(embeddingPregunta, aprobadas);

        if (coincidencia && coincidencia.score >= config.similarityThreshold) {
            await store.incrementUso(coincidencia.item.id);
            const tags = coincidencia.item.tags || [];
            // Si algún tag coincide EXACTO (normalizado) con la "ruta" real de una opción
            // del menú, se manda su id: así el frontend puede ofrecer "¿esta opción es lo
            // que buscabas?" y, si dice que sí, llevar directo a esa opción. Si el tag es
            // texto libre que no corresponde a ninguna ruta real, no se manda (el frontend
            // hace el fallback de solo mostrarlo como dato informativo).
            const menuOpcion = tags
                .map(tag => opcionesMenu.find(op => normalizar(op.ruta) === normalizar(tag)))
                .find(Boolean) || null;

            return res.json({
                respuesta: coincidencia.item.respuesta,
                fuente: 'cache_semantico',
                similitud: Number(coincidencia.score.toFixed(4)),
                pendiente_revision: false,
                tags,
                menu_opcion: menuOpcion ? { id: menuOpcion.id, ruta: menuOpcion.ruta, label: menuOpcion.label, icono: menuOpcion.icono || '' } : null
            });
        }

        // Nivel 3: RAG real
        const contextoRAG = buscarTopN(embeddingPregunta, aprobadas, config.ragTopN, config.ragMinScore)
            .map(r => ({
                pregunta: r.item.pregunta,
                respuesta: r.item.respuesta,
                score: Number(r.score.toFixed(4))
            }));

        const menuMention = (mejorOpcionMenu && mejorOpcionMenu.score >= config.menuMentionThreshold)
            ? {
                id: mejorOpcionMenu.item.id,
                ruta: mejorOpcionMenu.item.ruta,
                label: mejorOpcionMenu.item.label,
                icono: mejorOpcionMenu.item.icono || '',
                similitud: Number(mejorOpcionMenu.score.toFixed(4))
            }
            : null;

        const respuestaModelo = await ollama.generarRespuesta(pregunta, contextoRAG);

        const pendiente = await store.addPendiente({
            pregunta,
            pregunta_normalizada: preguntaNormalizada,
            respuesta: respuestaModelo,
            embedding: embeddingPregunta,
            agente,
            contexto_usado: contextoRAG,
            menu_mention: menuMention
        });

        return res.json({
            respuesta: respuestaModelo,
            fuente: 'modelo_ia',
            pendiente_revision: true,
            pendiente_id: pendiente.id,
            similitud_mas_cercana: coincidencia ? Number(coincidencia.score.toFixed(4)) : null,
            contexto_usado: contextoRAG.length,
            menu_mention: menuMention
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