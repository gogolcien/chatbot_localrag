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
        // cargó las embeddings). Se reutiliza tanto para el redirect directo de Nivel 1.5 como
        // para la sugerencia "secundaria" de Nivel 3 más abajo, así siempre es la MISMA opción
        // (la más acorde), sin volver a calcularla ni depender de que el modelo la copie bien.
        let mejorOpcionMenu = null;
        try {
            const opcionesMenu = await obtenerOpcionesMenuConEmbedding();
            mejorOpcionMenu = buscarMasParecido(embeddingPregunta, opcionesMenu);
        } catch (errMenu) {
            // Si falla el cálculo de embeddings de las opciones de menú (p.ej. Ollama
            // aún no cargaba), no tumbamos el chat: seguimos con cache/RAG normal.
            console.warn('[chat] No se pudieron comparar las opciones de menú:', errMenu.message);
        }

        // Nivel 1.5: ¿la pregunta se parece MUCHO a una opción del menú que ya tiene
        // respuesta instantánea (incluye las FAQs de cada submenú, no solo la categoría)?
        // Si es así, mejor redirigir ahí que gastar una llamada al modelo (más rápido, y
        // con contenido curado en vez de generado por IA).
        if (mejorOpcionMenu && mejorOpcionMenu.score >= config.menuRedirectThreshold) {
            return res.json({
                respuesta: `Lo que escribiste sugiere que este botón del menú "${mejorOpcionMenu.item.ruta}" podría ayudarte.`,
                fuente: 'sugerencia_menu',
                similitud: Number(mejorOpcionMenu.score.toFixed(4)),
                sugerencia_menu: {
                    id: mejorOpcionMenu.item.id,
                    label: mejorOpcionMenu.item.label,
                    ruta: mejorOpcionMenu.item.ruta
                },
                pendiente_revision: false
            });
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

        // La opción de menú más parecida (mejorOpcionMenu) no llegó al umbral de redirect
        // directo, pero si aun así se parece lo suficiente, se manda como sugerencia
        // ESTRUCTURADA (botón real en el panel de menú, vía "sugerencia_menu") en vez de
        // pedirle al modelo que la mencione como texto: así siempre es exacta y siempre
        // apunta al submenú/FAQ correcto, sin depender de que la IA copie bien la ruta.
        const sugerenciaSecundaria = (mejorOpcionMenu && mejorOpcionMenu.score >= config.menuMentionThreshold)
            ? {
                id: mejorOpcionMenu.item.id,
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
            contexto_usado: contextoRAG
        });

        return res.json({
            respuesta: respuestaModelo,
            fuente: 'modelo_ia',
            pendiente_revision: true,
            pendiente_id: pendiente.id,
            // la mejor coincidencia encontrada, por si el frontend quiere mostrar contexto/depurar
            similitud_mas_cercana: coincidencia ? Number(coincidencia.score.toFixed(4)) : null,
            contexto_usado: contextoRAG.length,
            // opción del submenú más acorde (si hubo alguna razonablemente parecida), para
            // que el frontend siempre la muestre como botón en el panel de menú
            sugerencia_menu: sugerenciaSecundaria
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
