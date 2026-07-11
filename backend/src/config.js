require('dotenv').config();

function required(name, fallback) {
    const val = process.env[name];
    if (val === undefined || val === '') return fallback;
    return val;
}

const config = {
    port: parseInt(required('PORT', '3000'), 10),

    ollamaBaseUrl: required('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
    chatModel: required('OLLAMA_CHAT_MODEL', 'qwen3:8b'),
    embedModel: required('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),

    similarityThreshold: parseFloat(required('SIMILARITY_THRESHOLD', '0.86')),

    // RAG real (nivel 3): cuantas aprobadas parecidas se le pasan como contexto al
    // modelo cuando no hubo hit de cache, y que tan parecidas deben ser para contar
    // (mas bajo que similarityThreshold a proposito: aqui no es "responder igual",
    // es "esto puede servir de referencia").
    ragTopN: parseInt(required('RAG_TOP_N', '3'), 10),
    ragMinScore: parseFloat(required('RAG_MIN_SCORE', '0.55')),

    // Sugerencia de opciones de menú (nivel intermedio, antes de gastar una llamada al modelo):
    // - menuRedirectThreshold: si la pregunta se parece MUCHO a un botón del menú, se redirige
    //   directo a esa opción (respuesta instantánea, sin usar el modelo de IA).
    // - menuMentionThreshold: si se parece pero no lo suficiente para redirigir, se le pasa
    //   igual al modelo como contexto extra, por si quiere sugerirla dentro de su respuesta.
    menuRedirectThreshold: parseFloat(required('MENU_REDIRECT_THRESHOLD', '0.82')),
    menuMentionThreshold: parseFloat(required('MENU_MENTION_THRESHOLD', '0.55')),

    adminPassword: required('ADMIN_PASSWORD', 'admin'),
    sessionSecret: required('SESSION_SECRET', 'dev-secret-change-me'),

    corsOrigin: required('CORS_ORIGIN', 'http://localhost:3000')
};

if (config.adminPassword === 'admin' || config.adminPassword === 'cambia-esta-contraseña') {
    console.warn('[AVISO] Estás usando la contraseña de administrador por defecto. Cámbiala en backend/.env (ADMIN_PASSWORD).');
}

module.exports = config;
