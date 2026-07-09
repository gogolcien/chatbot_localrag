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

    adminPassword: required('ADMIN_PASSWORD', 'admin'),
    sessionSecret: required('SESSION_SECRET', 'dev-secret-change-me'),

    corsOrigin: required('CORS_ORIGIN', 'http://localhost:3000')
};

if (config.adminPassword === 'admin' || config.adminPassword === 'cambia-esta-contraseña') {
    console.warn('[AVISO] Estás usando la contraseña de administrador por defecto. Cámbiala en backend/.env (ADMIN_PASSWORD).');
}

module.exports = config;
