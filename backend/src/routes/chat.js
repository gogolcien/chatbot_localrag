const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido, buscarTopN } = require('../similarity');
const { obtenerOpcionesMenuConEmbedding } = require('../menuOpciones');

const router = express.Router();

router.post('/chat', async (req, res) => {
    const pregunta = (req.body?.pregunta || '').trim();
    const agente = req.body?.agente || null;

    if (!pregunta) {
        return res.status(400).json({ error: 'Falta el campo "pregunta".' });
    }

    const preguntaNormalizada = normalizar(pregunta);

    try {
        const embeddingPregunta = await ollama.generarEmbedding(pregunta);

        // Se calcula una sola vez la opción de menú más parecida a la pregunta (si Ollama ya
        // cargó las embeddings). Se reutiliza más abajo, en el Nivel 3, para la mención de
        // texto en la consola de interacción, así siempre es la MISMA opción (la más acorde),
        // sin volver a calcularla ni depender de que el modelo la copie bien.
        let mejorOpcionMenu = null;
        try {
            const opcionesMenu = await obtenerOpcionesMenuConEmbedding();
            mejorOpcionMenu = buscarMasParecido(embeddingPregunta, opcionesMenu);
        } catch (errMenu) {
            // Si falla el cálculo de embeddings de las opciones de menú (p.ej. Ollama
            // aún no cargaba), no tumbamos el chat: seguimos con cache/RAG normal.
            console.warn('[chat] No se pudieron comparar las opciones de menú:', errMenu.message);
        }

        // Nivel 2: caché semántico (tabla "aprobadas")
        const aprobadas = store.listAprobadas();
        const coincidencia = buscarMasParecido(embeddingPregunta, aprobadas);

        if (coincidencia && coincidencia.score >= config.similarityThreshold) {
            store.incrementUso(coincidencia.item.id);
            return res.json({
                respuesta: coincidencia.item.respuesta,
                fuente: 'cache_semantico',
                similitud: Number(coincidencia.score.toFixed(4)),
                pendiente_revision: false,
                // categoría(s) que el administrador le puso a esta respuesta aprobada, solo
                // como dato informativo de texto para la consola de interacción
                tags: coincidencia.item.tags || []
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

        // La opción de menú más parecida (mejorOpcionMenu), si se parece lo suficiente,
        // ya NO se ofrece como botón real del panel de menú: solo se informa como texto
        // en la consola de interacción y queda registrada junto con el pendiente para que
        // el administrador la vea en el panel de revisión (id="menu-mention").
        const menuMention = (mejorOpcionMenu && mejorOpcionMenu.score >= config.menuMentionThreshold)
            ? {
                label: mejorOpcionMenu.item.label,
                ruta: mejorOpcionMenu.item.ruta,
                similitud: Number(mejorOpcionMenu.score.toFixed(4))
            }
            : null;

        const respuestaModelo = await ollama.generarRespuesta(pregunta, contextoRAG);

        const pendiente = store.addPendiente({
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
            // la mejor coincidencia encontrada, por si el frontend quiere mostrar contexto/depurar
            similitud_mas_cercana: coincidencia ? Number(coincidencia.score.toFixed(4)) : null,
            contexto_usado: contextoRAG.length,
            // opción del submenú más acorde (si hubo alguna razonablemente parecida), solo
            // como dato informativo de texto para la consola de interacción (ya no es un
            // botón del panel de menú)
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