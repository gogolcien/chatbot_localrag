let AGENTE_ACTIVO = null;
let AUTO_INICIAR_PENDIENTE = false; // true si el usuario ya eligió agente pero aún no cargan los destinos

// ================= CONFIGURACIÓN =================
// Valores por defecto antes de elegir agente (IAN/MIA): apuntan a un archivo que sí
// existe (logo.png) para evitar 404s en la carga inicial de la página. En cuanto el
// usuario elige agente, seleccionarAgente() sobreescribe esto con AGENTES[tipo].avatar
// (./assets/IAN.gif o ./assets/MIA.gif).
AVATAR = {
    neutral: './assets/logo.png',
    hablar: './assets/logo.png',
    pensar: './assets/logo.png',
    exito: './assets/logo.png'
};

// VARIABLE DINÁMICA (Se llenará con el JSON)
let DESTINOS_VALIDOS = [];
DESTINOS_MAP = {};

let estado = 'OFF';
let datos = {
    destino: '',
    fechaEntrada: null,
    fechaSalida: null,
    strEntrada: '',
    noches: 0,
    habitaciones: 0,
    habData: [],
    planAlimentos: '',
    categoria: '',
    nacionalidad: ''
};

// ================= NIVEL 2/3: BACKEND (caché semántico + modelo local Ollama) =================
// BACKEND_URL vacío = mismo origen (recomendado: abrir la app desde http://localhost:3000
// que sirve el backend, así este fetch va al mismo servidor sin problemas de CORS).
const BACKEND_URL = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : '';

async function consultarBackend(txt) {
    setAvatar('pensar');
    mostrarOverlayProcesando();
    try {
        const res = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pregunta: txt,
                agente: AGENTE_ACTIVO ? AGENTE_ACTIVO.nombre : null
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Error ${res.status}`);
        }

        const data = await res.json();
        ocultarOverlayProcesando();

        // Si el backend detectó una opción de menú razonablemente parecida a la pregunta
        // (menu_mention del modelo, o menu_opcion desde el caché semántico o desde la
        // zona gris de Capa 3), la respuesta de la IA NO se muestra todavía: primero se
        // pregunta "¿esta opción es lo que buscabas?" (ver mostrarConfirmacionOpcion) y
        // solo se revela si el usuario confirma con "Sí" (además de redirigirlo a esa
        // opción, con el mismo efecto que si hubiera hecho click en el panel de menú).
        // Si responde "No", la respuesta de la IA nunca llega a mostrarse:
        // mostrarConfirmacionOpcion ya se encarga del mensaje de fallback y de volver al menú.
        const opcionSugerida = data.menu_mention
            || (['cache_semantico', 'sugerencia_revision'].includes(data.fuente) && data.menu_opcion ? data.menu_opcion : null);

        // Muestra la respuesta de la IA (y, si aplica, el aviso de "pendiente de revisión").
        // `callback` decide qué pasa después de mostrarla; por defecto vuelve al menú.
        function mostrarRespuestaIA(callback) {
            hablar(data.respuesta, callback || (() => volverAMenu()));

            if (data.pendiente_revision) {
                setTimeout(() => {
                    log('SISTEMA', 'ℹ️ Esta respuesta fue generada por IA y quedó pendiente de revisión por un administrador.');
                }, 350);
            }
        }

        if (opcionSugerida) {
            setTimeout(() => {
                mostrarConfirmacionOpcion(opcionSugerida.label, {
                    onSi: () => {
                        mostrarRespuestaIA(() => dirigirAOpcionMenu(opcionSugerida.id, { silencioso: true }));
                    }
                });
            }, 350);
        } else {
            mostrarRespuestaIA();

            // Sin coincidencia real con una opción del menú: la categoría del caché
            // semántico (o de la sugerencia de zona gris) se muestra solo como dato
            // informativo (comportamiento anterior).
            if (['cache_semantico', 'sugerencia_revision'].includes(data.fuente) && Array.isArray(data.tags) && data.tags.length > 0) {
                setTimeout(() => {
                    log('SISTEMA', `Te recomiendo consultar dentro del menú de opciones 🏷️ Categoría: ${data.tags.join(', ')}`);
                }, 350);
            }
        }
    } catch (err) {
        ocultarOverlayProcesando();
        // El detalle técnico solo va a la consola (para depuración); al usuario se le
        // muestra un mensaje genérico, sin mencionar backend/Ollama ni nada de infraestructura.
        console.error('Error consultando backend:', err);
        hablar(
            "Tuvimos un problema para responder tu pregunta. Intenta de nuevo en un momento, o elige una opción del menú: Cotizar, Subir Pago o Facturar.",
            () => volverAMenu()
        );
    }
}