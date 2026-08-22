const config = require('./config');
const { similitudLexica } = require('./spellfix');

function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizar(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Devuelve los N items mas parecidos a un embedding dado, ordenados de mayor a menor
 * similitud. A diferencia de buscarMasParecido, no se detiene en el mejor: sirve para
 * armar contexto tipo RAG con varias referencias en vez de una sola.
 * @param {number[]} embedding
 * @param {object[]} items - cada uno con .embedding
 * @param {number} n - cuantos resultados devolver como maximo
 * @param {number} minScore - piso de similitud; resultados por debajo se descartan (ruido)
 * @returns {{item: object, score: number}[]}
 */
function buscarTopN(embedding, items, n = 3, minScore = 0) {
    return items
        .filter(item => Array.isArray(item.embedding))
        .map(item => ({ item, score: cosineSimilarity(embedding, item.embedding) }))
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
}

/**
 * Busca en una lista de items (que tienen .embedding) el más parecido a un embedding dado.
 * @returns {{item: object, score: number} | null}
 */
function buscarMasParecido(embedding, items) {
    const [mejor] = buscarTopN(embedding, items, 1, -1);
    return mejor || null;
}

/**
 * Capa 2: combina la similitud semántica (coseno del embedding) con la
 * similitud léxica (distancia de edición, ver spellfix.js) entre los textos
 * normalizados. El peso léxico es chico por defecto (config.pesoLexicoHibrido):
 * la idea es que empuje el score cuando el coseno se queda corto por un error
 * de tipeo, no que domine sobre el significado real de la pregunta.
 * @param {number} coseno
 * @param {number} lexica
 * @param {number} [pesoLexico] - entre 0 y 1; si no se pasa, usa config.pesoLexicoHibrido
 */
function scoreHibrido(coseno, lexica, pesoLexico) {
    const peso = typeof pesoLexico === 'number' ? pesoLexico : config.pesoLexicoHibrido;
    return coseno * (1 - peso) + lexica * peso;
}

/**
 * Igual que buscarTopN, pero el score de cada item combina coseno + similitud
 * léxica (scoreHibrido) en vez de solo coseno. Requiere el texto normalizado
 * de la consulta, y que cada item tenga .pregunta_normalizada (o
 * .textoNormalizado) para poder comparar léxicamente.
 * @param {number[]} embedding
 * @param {string} textoNormalizado - pregunta normalizada (y opcionalmente
 *        corregida por spellfix.corregirTexto)
 * @param {object[]} items
 * @param {number} n
 * @param {number} minScore
 * @param {number} [pesoLexico]
 * @returns {{item: object, score: number, coseno: number, lexica: number}[]}
 */
function buscarTopNHibrido(embedding, textoNormalizado, items, n = 3, minScore = 0, pesoLexico) {
    return items
        .filter(item => Array.isArray(item.embedding))
        .map(item => {
            const coseno = cosineSimilarity(embedding, item.embedding);
            const textoItem = item.pregunta_normalizada || item.textoNormalizado || '';
            const lexica = similitudLexica(textoNormalizado, textoItem);
            return { item, score: scoreHibrido(coseno, lexica, pesoLexico), coseno, lexica };
        })
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
}

/**
 * Version "top 1" de buscarTopNHibrido. Devuelve tambien coseno/lexica por
 * separado para poder loguear o mostrar por qué hizo (o no) match.
 * @returns {{item: object, score: number, coseno: number, lexica: number} | null}
 */
function buscarMasParecidoHibrido(embedding, textoNormalizado, items, pesoLexico) {
    const [mejor] = buscarTopNHibrido(embedding, textoNormalizado, items, 1, -1, pesoLexico);
    return mejor || null;
}

module.exports = {
    cosineSimilarity,
    normalizar,
    buscarMasParecido,
    buscarTopN,
    scoreHibrido,
    buscarTopNHibrido,
    buscarMasParecidoHibrido
};