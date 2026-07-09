const config = require('./config');

const SYSTEM_PROMPT = `Eres un asistente virtual de una operadora de viajes (Imacop) que atiende a agentes de viajes.
Responde en español, de forma breve, clara y profesional (máximo 4-5 líneas).
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
 * Pide al modelo de chat local una respuesta a la pregunta del usuario.
 * @param {string} pregunta
 * @returns {Promise<string>}
 */
async function generarRespuesta(pregunta) {
    const data = await ollamaFetch('/api/chat', {
        model: config.chatModel,
        stream: false,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: pregunta }
        ]
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
