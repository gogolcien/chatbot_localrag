const express = require('express');
const store = require('../store');
const config = require('../config');
const ollama = require('../ollama');
const { normalizar, buscarMasParecido, buscarTopN, buscarMasParecidoHibrido } = require('../similarity');
const { obtenerOpcionesMenuConEmbedding } = require('../menuOpciones');
const spellfix = require('../spellfix');
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
        // Se traen antes del embedding porque Capa 1 (spellfix) necesita el
        // vocabulario de dominio, y Capa 2 (score híbrido) necesita comparar
        // contra pregunta_normalizada de cada aprobada.
        const aprobadas = await store.listAprobadas();
        let opcionesMenu = [];
        try {
            opcionesMenu = await obtenerOpcionesMenuConEmbedding();
        } catch (errMenu) {
            console.warn('[chat] No se pudieron cargar las opciones de menú:', errMenu.message);
        }

        // Capa 1: corrección léxica ligera contra el vocabulario de dominio,
        // ANTES de generar el embedding (ver spellfix.js). No usa el LLM: es
        // literal, así que no hay riesgo de que "reinterprete" la pregunta.
        const vocabulario = spellfix.construirVocabulario(aprobadas, opcionesMenu);
        const preguntaCorregida = spellfix.corregirTexto(preguntaNormalizada, vocabulario);
        if (preguntaCorregida !== preguntaNormalizada) {
            console.log('[chat] Spellfix: "%s" -> "%s"', preguntaNormalizada, preguntaCorregida);
        }

        const embeddingPregunta = await ollama.generarEmbedding(preguntaCorregida);

        let mejorOpcionMenu = null;
        try {
            mejorOpcionMenu = buscarMasParecido(embeddingPregunta, opcionesMenu);
        } catch (errMenu) {
            console.warn('[chat] No se pudieron comparar las opciones de menú:', errMenu.message);
        }

        /**
         * Resuelve la opción de menú a ofrecer para una respuesta de caché (ya sea
         * un match fuerte de Nivel 2, o uno "de zona gris" de Capa 3): primero por
         * los tags de la aprobada (exacto o semántico, ver encontrarOpcionMenuPorTags);
         * si eso no resuelve nada (tags vacíos, mal puestos, o de una aprobada
         * duplicada sin tagear), cae a comparar la pregunta directo contra el menú
         * (mejorOpcionMenu, ya calculado arriba), igual que hace Nivel 3.
         */
        async function resolverMenuOpcion(tags) {
            const porTag = await encontrarOpcionMenuPorTags(tags, opcionesMenu);
            if (porTag) return porTag;
            if (mejorOpcionMenu && mejorOpcionMenu.score >= config.menuMentionThreshold) {
                return mejorOpcionMenu.item;
            }
            return null;
        }

        // Nivel 2: caché semántico (tabla "aprobadas"). Capa 2: en vez de solo
        // coseno, se usa un score híbrido (coseno + similitud léxica) para que
        // un typo chico no tumbe el match por debajo del umbral.
        const coincidencia = buscarMasParecidoHibrido(embeddingPregunta, preguntaCorregida, aprobadas);

        if (coincidencia && coincidencia.score >= config.similarityThreshold) {
            await store.incrementUso(coincidencia.item.id);
            const tags = coincidencia.item.tags || [];
            // Si algún tag corresponde (exacto o semánticamente) a una opción real del
            // menú, o si la pregunta se parece lo suficiente al menú directamente, se
            // manda su id: así el frontend puede ofrecer "¿esta opción es lo que
            // buscabas?" y, si dice que sí, llevar directo a esa opción y ejecutarla.
            const menuOpcion = await resolverMenuOpcion(tags);

            return res.json({
                respuesta: coincidencia.item.respuesta,
                fuente: 'cache_semantico',
                similitud: Number(coincidencia.score.toFixed(4)),
                similitud_coseno: Number(coincidencia.coseno.toFixed(4)),
                similitud_lexica: Number(coincidencia.lexica.toFixed(4)),
                pendiente_revision: false,
                tags,
                menu_opcion: menuOpcion ? { id: menuOpcion.id, ruta: menuOpcion.ruta, label: menuOpcion.label, icono: menuOpcion.icono || '' } : null
            });
        }

        // Capa 3: "zona gris". Lo bastante parecido como para sugerirlo, pero
        // no como para servirlo automático como si fuera la misma pregunta.
        // En vez de gastar una llamada al LLM y crear un pendiente duplicado
        // en la cola de revisión, se devuelve como sugerencia para que el
        // frontend pueda ofrecer un "¿quisiste decir...?" antes de generar
        // una respuesta nueva. También se resuelve menu_opcion aquí (antes no
        // se hacía, y por eso preguntas cortas y sin typo -que igual caían en
        // esta zona gris por no matchear ninguna aprobada al 0.86+- nunca
        // ofrecían el botón del menú aunque el parecido con el menú fuera alto).
        if (coincidencia && coincidencia.score >= config.cacheZonaGrisMin) {
            const tags = coincidencia.item.tags || [];
            const menuOpcion = await resolverMenuOpcion(tags);

            return res.json({
                respuesta: coincidencia.item.respuesta,
                fuente: 'sugerencia_revision',
                similitud: Number(coincidencia.score.toFixed(4)),
                similitud_coseno: Number(coincidencia.coseno.toFixed(4)),
                similitud_lexica: Number(coincidencia.lexica.toFixed(4)),
                pendiente_revision: false,
                pregunta_sugerida: coincidencia.item.pregunta,
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