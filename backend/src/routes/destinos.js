const express = require('express');
const config = require('../config');

const router = express.Router();

// Antes esta llamada (con usuario y contraseña) se hacía directo desde el
// frontend (js/brain.js), lo que dejaba las credenciales visibles para
// cualquiera que abriera el chatbot ("Ver código fuente"). Ahora el backend
// es quien llama a la API externa y el frontend solo consulta este endpoint,
// sin ver ni manejar ninguna credencial.
router.get('/destinos', async (req, res) => {
    try {
        const apiRes = await fetch(config.destinosApiUrl, {
            method: 'POST',
            body: new URLSearchParams({
                user: config.destinosApiUser,
                password: config.destinosApiPassword,
                gih: '0',
                pagina: '0',
                num_reg: '5000'
            })
        });

        if (!apiRes.ok) {
            throw new Error(`La API de destinos respondió ${apiRes.status}`);
        }

        const data = await apiRes.json();
        res.json(data);
    } catch (err) {
        console.error('[destinos] Error consultando la API externa:', err.message);
        res.status(502).json({
            error: 'No se pudo obtener la lista de destinos desde el API.',
            detalle: err.message
        });
    }
});

module.exports = router;