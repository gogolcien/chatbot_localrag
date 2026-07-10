const config = require('./config');

const SYSTEM_PROMPT = `Eres un asistente virtual de una operadora de viajes (Imacop) que atiende a agentes de viajes.
Responde en español, de forma breve, clara y profesional (máximo 5-6 líneas).
Si la pregunta no tiene relación con el negocio de viajes/agencia o no tienes información suficiente
para responder con certeza, dilo honestamente en vez de inventar datos, precios o políticas.`;

async function ollamaFetch(pathName, body) {
    const url = `${config.ollamaBaseUrl}${pathName}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error(`No se pudo conectar con Ollama en ${config.ollamaBaseUrl}. ¿Está corriendo? (${err.message})`);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama respondió ${res.status} en ${pathName}: ${text}`);
    }
    return res.json();
}

/**
 * Construye el bloque de contexto RAG a partir de preguntas/respuestas ya aprobadas
 * que resultaron parecidas a la pregunta actual (aunque no superen el umbral de caché).
 * @param {{pregunta: string, respuesta: string, score: number}[]} contexto
 * @returns {string}
 */
function formatearContextoRAG(contexto) {
    return contexto
        .map((c, i) => `[${i + 1}] (similitud ${c.score}) Pregunta previa: "${c.pregunta}"\nRespuesta aprobada: "${c.respuesta}"`)
        .join('\n\n');
}

/**
 * Pide al modelo de chat local una respuesta a la pregunta del usuario.
 * @param {string} pregunta
 * @param {{pregunta: string, respuesta: string, score: number}[]} contexto - referencias
 *        de preguntas/respuestas ya aprobadas, mas parecidas a la pregunta actual (RAG).
 *        Pasa un arreglo vacio si no hay ninguna referencia util.
 * @returns {Promise<string>}
 */
async function generarRespuesta(pregunta, contexto = []) {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (contexto.length > 0) {
        messages.push({
            role: 'system',
            content: `A continuacion tienes preguntas y respuestas YA APROBADAS por un humano, `
                + `las mas parecidas a la pregunta actual del usuario. Son tu fuente de verdad: `
                + `basa tu respuesta en ellas cuando sean relevantes, en vez de usar solo lo que `
                + `ya sabias de tu entrenamiento. Si ninguna aplica realmente a la pregunta, `
                + `ignoralas y dilo honestamente en vez de inventar.\n\n${formatearContextoRAG(contexto)}`
        });
    }

    messages.push({ role: 'user', content: pregunta });

    const data = await ollamaFetch('/api/chat', {
        model: config.chatModel,
        stream: false,
        messages
    });
    const contenido = data?.message?.content;
    if (!contenido) throw new Error('Ollama no devolvió contenido en la respuesta del chat.');
    // Los modelos qwen3 pueden incluir bloques de "pensamiento" tipo <think>...</think>;
    // los quitamos para no mostrárselos al usuario final.
    return contenido.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Obtiene el vector de embedding de un texto usando el modelo configurado.
 * @param {string} texto
 * @returns {Promise<number[]>}
 */
async function generarEmbedding(texto) {
    const data = await ollamaFetch('/api/embeddings', {
        model: config.embedModel,
        prompt: texto
    });
    if (!Array.isArray(data?.embedding)) {
        throw new Error('Ollama no devolvió un embedding válido. Verifica que OLLAMA_EMBED_MODEL esté descargado (ollama pull ' + config.embedModel + ').');
    }
    return data.embedding;
}

module.exports = { generarRespuesta, generarEmbedding };
