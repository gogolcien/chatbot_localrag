const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido, buscarTopN } = require('../similarity');
const { obtenerOpcionesMenuConEmbedding } = require('../menuOpciones');
const rateLimit = require('express-rate-limit'); 

const router = express.Router();

// Embeddings de tags ya calculados (los tags del panel de revisión se repiten mucho
// entre requests, sobre todo los de un mismo item aprobado que se sigue disparando
// una y otra vez desde el caché semántico), así no se le pide a Ollama el mismo
// texto una y otra vez.
const tagEmbeddingCache = new Map();

async function embeddingParaTag(tag) {
    const key = normalizar(tag);
    if (tagEmbeddingCache.has(key)) return tagEmbeddingCache.get(key);
    const embedding = await ollama.generarEmbedding(tag);
    tagEmbeddingCache.set(key, embedding);
    return embedding;
}

/**
 * Busca, entre los tags guardados en el panel de revisión para una respuesta del
 * caché semántico, cuál corresponde a una opción real del menú.
 *
 * Primero intenta una coincidencia EXACTA de texto (rápida, sin llamar a Ollama):
 * cubre el caso normal, en que el admin dejó tal cual la "ruta" que el propio panel
 * le sugirió al aprobar (ver menu_mention en admin.js).
 *
 * Si no hay coincidencia exacta, cae a una coincidencia SEMÁNTICA por embeddings:
 * cubre los casos en que el tag no es letra por letra la ruta actual del menú (el
 * admin lo escribió a mano con otras palabras, p.ej. "Cotizar ahora" en vez de
 * "Cotizar hotel", o el menú cambió de numeración/redacción desde que se guardó el
 * tag). Así, si el tag realmente corresponde a una opción del menú, esa opción se
 * ofrece/ejecuta igual, en vez de mostrarse solo como texto informativo.
 * @returns {object|null} la opción del menú (con id/ruta/label/icono) o null
 */
async function encontrarOpcionMenuPorTags(tags, opcionesMenu) {
    if (!Array.isArray(tags) || tags.length === 0 || opcionesMenu.length === 0) return null;

    const exacta = tags
        .map(tag => opcionesMenu.find(op => normalizar(op.ruta) === normalizar(tag)))
        .find(Boolean);
    if (exacta) return exacta;

    let mejor = null;
    for (const tag of tags) {
        try {
            const embeddingTag = await embeddingParaTag(tag);
            const candidato = buscarMasParecido(embeddingTag, opcionesMenu);
            if (candidato && candidato.score >= config.menuMentionThreshold) {
                if (!mejor || candidato.score > mejor.score) mejor = candidato;
            }
        } catch (err) {
            console.warn('[chat] No se pudo generar embedding para el tag "%s":', tag, err.message);
        }
    }
    return mejor ? mejor.item : null;
}

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
            // Si algún tag corresponde (exacto o semánticamente, ver encontrarOpcionMenuPorTags)
            // a una opción real del menú, se manda su id: así el frontend puede ofrecer "¿esta
            // opción es lo que buscabas?" y, si dice que sí, llevar directo a esa opción y
            // ejecutarla. Si el tag es texto libre que no corresponde a ninguna opción real,
            // no se manda (el frontend hace el fallback de solo mostrarlo como dato informativo).
            const menuOpcion = await encontrarOpcionMenuPorTags(tags, opcionesMenu);

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