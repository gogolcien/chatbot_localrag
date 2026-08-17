const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const config = require('./src/config');
const chatRoutes = require('./src/routes/chat');
const adminRoutes = require('./src/routes/admin');
const destinosRoutes = require('./src/routes/destinos');

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 8 // 8 horas
    }
}));

// API
app.use('/api', chatRoutes);
app.use('/api', destinosRoutes);
app.use('/api/admin', adminRoutes);

// Panel de administración (estático)
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// Frontend del chatbot (el proyecto estático original, un nivel arriba de /backend)
// IMPORTANTE: FRONTEND_DIR es la carpeta raíz del proyecto, que también contiene
// esta misma carpeta "backend". Bloqueamos /backend/* ANTES del static para que
// nadie pueda descargar server.js, src/*, package.json, etc. desde el navegador.
app.use('/backend', (req, res) => res.status(404).end());

const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

app.listen(config.port, () => {
    console.log(`\nChatbot backend corriendo en http://localhost:${config.port}`);
    console.log(`Chat:  http://localhost:${config.port}/`);
    console.log(`Admin: http://localhost:${config.port}/admin`);
    console.log(`Ollama: ${config.ollamaBaseUrl}  |  chat=${config.chatModel}  embed=${config.embedModel}\n`);
});