require('dotenv').config();

function required(name, fallback) {
    const val = process.env[name];
    if (val === undefined || val === '') return fallback;
    return val;
}

// Para campos sensibles: si no está en .env, el servidor NO arranca.
// Evita que credenciales de ejemplo terminen corriendo en producción por descuido.
function requiredSecret(name) {
    const val = process.env[name];
    if (val === undefined || val === '') {
        throw new Error(
            `[config] Falta la variable de entorno obligatoria "${name}" en backend/.env. ` +
            `El servidor no puede arrancar sin ella.`
        );
    }
    return val;
}

const config = {
    port: parseInt(required('PORT', '3000'), 10),

    ollamaBaseUrl: required('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
    chatModel: required('OLLAMA_CHAT_MODEL', 'qwen3:8b'),
    embedModel: required('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),

    similarityThreshold: parseFloat(required('SIMILARITY_THRESHOLD', '0.86')),

    ragTopN: parseInt(required('RAG_TOP_N', '3'), 10),
    ragMinScore: parseFloat(required('RAG_MIN_SCORE', '0.55')),

    menuMentionThreshold: parseFloat(required('MENU_MENTION_THRESHOLD', '0.55')),

    // --- Precisión semántica ante errores gramaticales/ortográficos chicos ---
    // Capa 1 (spellfix.js): corrección léxica antes de embeber.
    spellfixMinLongitudPalabra: parseInt(required('SPELLFIX_MIN_WORD_LENGTH', '4'), 10),
    spellfixMaxDistancia: parseInt(required('SPELLFIX_MAX_DISTANCE', '2'), 10),
    // Capa 2 (similarity.js): score híbrido = coseno + similitud léxica.
    // Peso de la parte léxica (0 a 1); el resto del peso lo lleva el coseno.
    pesoLexicoHibrido: parseFloat(required('HYBRID_LEXICAL_WEIGHT', '0.25')),
    // Capa 3 (routes/chat.js): "zona gris" de sugerencia. Si el score híbrido
    // cae entre este valor y SIMILARITY_THRESHOLD, no se sirve como caché
    // automático ni se manda al LLM: se devuelve como sugerencia a confirmar.
    cacheZonaGrisMin: parseFloat(required('CACHE_GRAY_ZONE_MIN', '0.75')),

    // Sensibles: sin fallback, deben venir de .env sí o sí
    adminPassword: requiredSecret('ADMIN_PASSWORD'),
    sessionSecret: requiredSecret('SESSION_SECRET'),

    corsOrigin: required('CORS_ORIGIN', 'http://localhost:3000'),

    // Conexión a MySQL
    dbHost: required('DB_HOST', 'localhost'),
    dbPort: parseInt(required('DB_PORT', '3306'), 10),
    dbUser: requiredSecret('DB_USER'),
    dbPassword: requiredSecret('DB_PASSWORD'),
    dbName: required('DB_NAME', 'chatbot_localrag'),

    // API externa de destinos (antes se llamaba directo desde el frontend con
    // credenciales expuestas en el JS del cliente; ahora el backend hace la
    // llamada y el frontend solo consulta /api/destinos en este mismo servidor).
    destinosApiUrl: required('DESTINOS_API_URL', 'https://nuevo.sistemaimacop.com.mx/API/ApiDestinos'),
    destinosApiUser: requiredSecret('DESTINOS_API_USER'),
    destinosApiPassword: requiredSecret('DESTINOS_API_PASSWORD')
};

module.exports = config;