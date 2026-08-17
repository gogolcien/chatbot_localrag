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

module.exports = { cosineSimilarity, normalizar, buscarMasParecido, buscarTopN };
