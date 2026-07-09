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
 * Busca en una lista de items (que tienen .embedding) el más parecido a un embedding dado.
 * @returns {{item: object, score: number} | null}
 */
function buscarMasParecido(embedding, items) {
    let mejor = null;
    let mejorScore = -1;
    for (const item of items) {
        if (!Array.isArray(item.embedding)) continue;
        const score = cosineSimilarity(embedding, item.embedding);
        if (score > mejorScore) {
            mejorScore = score;
            mejor = item;
        }
    }
    if (!mejor) return null;
    return { item: mejor, score: mejorScore };
}

module.exports = { cosineSimilarity, normalizar, buscarMasParecido };
