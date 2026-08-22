// ================= OVERLAY DE PROCESAMIENTO (pantalla completa) =================
// Se muestra mientras se espera la respuesta del backend/modelo, para que quede claro
// que la app sigue trabajando aunque tarde unos segundos. Solo aparece si la respuesta
// tarda mas de OVERLAY_DELAY_MS: si es un hit de cache semantico (responde casi al
// instante), nunca llega a mostrarse.
const OVERLAY_DELAY_MS = 500;
let overlayTimeoutId = null;

// Bloquea el panel del menú de opciones (#menu-panel-content) para que no se pueda
// hacer click en ningún botón mientras se está esperando la respuesta del backend/modelo.
// Se llama en paralelo al overlay de procesando, pero sin el retraso de OVERLAY_DELAY_MS:
// el bloqueo aplica desde el instante en que arranca la petición, aunque el overlay
// visual tarde un poco más en aparecer.
function bloquearMenuOpciones() {
    const panel = document.getElementById('menu-panel-content');
    if (!panel) return;
    panel.querySelectorAll('button').forEach(btn => btn.disabled = true);
    panel.classList.add('opacity-50', 'pointer-events-none');
}

function desbloquearMenuOpciones() {
    const panel = document.getElementById('menu-panel-content');
    if (!panel) return;
    panel.querySelectorAll('button').forEach(btn => btn.disabled = false);
    panel.classList.remove('opacity-50', 'pointer-events-none');
}

// Bloquea el campo de texto y los botones de enviar/micrófono. A diferencia del bloqueo
// que ya hace enviarTexto() mientras espera al backend, este par se usa para cualquier
// otro momento en que no tenga sentido dejar escribir (p.ej. mientras se responde la
// confirmación de "¿esta opción es lo que buscabas?"): si el usuario pudiera seguir
// escribiendo y mandar otra pregunta, el botón Sí/No de la confirmación anterior seguiría
// viéndose activo pero ya no haría nada, porque la conversación ya avanzó a otra consulta.
function bloquearInputTexto() {
    const input = document.getElementById('text-input');
    const btn = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    if (btnMic) btnMic.disabled = true;
}

function desbloquearInputTexto() {
    const input = document.getElementById('text-input');
    const btn = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
    if (btnMic && reconocimientoDisponible) btnMic.disabled = false;
}

function mostrarOverlayProcesando() {
    bloquearMenuOpciones();
    overlayTimeoutId = setTimeout(() => {
        const overlay = document.getElementById('overlay-procesando');
        if (overlay) overlay.classList.remove('hidden');
        overlayTimeoutId = null;
    }, OVERLAY_DELAY_MS);
}

function ocultarOverlayProcesando() {
    if (overlayTimeoutId) {
        clearTimeout(overlayTimeoutId);
        overlayTimeoutId = null;
    }
    const overlay = document.getElementById('overlay-procesando');
    if (overlay) overlay.classList.add('hidden');
    desbloquearMenuOpciones();
}

function hablar(texto, callback)
{
    setAvatar('hablar');
    log('BOT', texto);

    setTimeout(() => {
        if (callback) {
            callback();
        } else {
            escuchar();
        }
    }, 300);
}

function escuchar() {
    setAvatar('neutral');
    const input = document.getElementById('text-input');
    const btn = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');
    if (input) {
        input.disabled = false;
        input.value = '';
        input.focus();
    }
    if (btn) btn.disabled = false;
    if (btnMic && reconocimientoDisponible) btnMic.disabled = false;
}

function enviarTexto() {
    const input = document.getElementById('text-input');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto) return;

    detenerEscuchaVoz(); // por si el micrófono seguía activo

    const input2 = input; // deshabilitar mientras se procesa
    input2.disabled = true;
    const btn = document.getElementById('btn-send');
    if (btn) btn.disabled = true;
    const btnMic = document.getElementById('btn-mic');
    if (btnMic) btnMic.disabled = true;

    // Se escapa antes de mostrarlo porque log() usa innerHTML: `texto` viene directo del
    // usuario (escrito o dictado por voz) y no debe poder inyectar HTML/JS en el chat.
    log('TU', escapeHtml(texto));
    input.value = '';
    setAvatar('pensar');

    setTimeout(() => {
        cerebro(texto.toLowerCase());
    }, 300);
}

// ================= ENTRADA POR VOZ (dictado en el campo de texto) =================
// El chat sigue funcionando 100% por texto; el micrófono es solo un atajo opcional
// para dictar el mensaje. Al terminar de hablar, el mensaje se transcribe en el
// input y se envía automáticamente, igual que si el usuario hubiera escrito y
// presionado "Enviar".
let reconocimientoVoz = null;
let reconocimientoDisponible = false;
let escuchandoVoz = false;

(function inicializarReconocimientoVoz() {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btnMic = document.getElementById('btn-mic');

    if (!SpeechRecognitionAPI) {
        reconocimientoDisponible = false;
        if (btnMic) {
            btnMic.disabled = true;
            btnMic.title = 'Tu navegador no soporta dictado por voz';
            btnMic.classList.add('opacity-40', 'cursor-not-allowed');
        }
        return;
    }

    reconocimientoDisponible = true;
    reconocimientoVoz = new SpeechRecognitionAPI();
    reconocimientoVoz.lang = 'es-MX';
    reconocimientoVoz.continuous = false;
    reconocimientoVoz.interimResults = false; // 💡 Cambiado a false para evitar errores de audio prematuros
    reconocimientoVoz.maxAlternatives = 1;

    reconocimientoVoz.onstart = () => {
        escuchandoVoz = true;
        const btn = document.getElementById('btn-mic');
        const input = document.getElementById('text-input');
        if (btn) btn.classList.add('escuchando');
        if (input) input.placeholder = 'Escuchando... habla ahora';
    };

    reconocimientoVoz.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        const input = document.getElementById('text-input');
        if (input) input.value = transcript;

        detenerEscuchaVoz();
        enviarTexto();
    };

    reconocimientoVoz.onerror = (e) => {
        // 💡 ESTO TE DIRÁ EL ERROR EXACTO EN LA CONSOLA (F12)
        console.error("Detalle del error SpeechRecognition:", e.error, e); 
        detenerEscuchaVoz();

        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            log('SISTEMA', '🎙️ Permiso denegado o servicio no disponible en este origen.');
        } else if (e.error === 'network') {
            log('SISTEMA', '🎙️ Error de red: No hay conexión con el servicio de voz de Google.');
        } else if (e.error === 'audio-capture') {
            log('SISTEMA', '🎙️ No se detectó hardware de micrófono en uso.');
        } else if (e.error === 'no-speech') {
            log('SISTEMA', '🎙️ No se detectó ninguna voz.');
        } else if (e.error !== 'aborted') {
            log('SISTEMA', `🎙️ Error (${e.error}): Intenta de nuevo o escribe tu mensaje.`);
        }
    };

    reconocimientoVoz.onend = () => {
        detenerEscuchaVoz();
    };
})();

function iniciarEscuchaVoz() {
    if (!reconocimientoDisponible || escuchandoVoz) return;
    const input = document.getElementById('text-input');
    if (input && input.disabled) return; 

    try {
        if (input) input.value = '';
        reconocimientoVoz.start();
    } catch (e) {
        console.warn('El reconocimiento de voz ya estaba activo', e);
    }
}

function detenerEscuchaVoz() {
    escuchandoVoz = false;
    try { reconocimientoVoz.stop(); } catch (e) { /* vacio */ }
    const btn = document.getElementById('btn-mic');
    const input = document.getElementById('text-input');
    if (btn) btn.classList.remove('escuchando');
    if (input) input.placeholder = 'Escribe tu mensaje...';
}

// Pide explícitamente permiso de micrófono al navegador (getUserMedia). Esto
// hace que el diálogo de "Permitir/Bloquear" aparezca de forma predecible la
// primera vez que el usuario usa el botón, y nos permite dar un mensaje claro
// si lo bloquea, en vez de que el reconocimiento falle en silencio.
async function solicitarPermisoMicrofono() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Solo necesitábamos el permiso, no el audio en sí (SpeechRecognition
        // abre su propio canal), así que cerramos el stream de inmediato.
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        mostrarAyudaPermisoMicrofono(err);
        return false;
    }
}

function mostrarAyudaPermisoMicrofono(err) {
    let msg = '🎙️ No pude acceder al micrófono.';
    if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        msg += ' Bloqueaste el permiso. Haz clic en el ícono de candado (🔒) junto a la dirección del sitio, activa "Micrófono" y recarga la página.';
    } else if (err && err.name === 'NotFoundError') {
        msg += ' No se detectó ningún micrófono conectado en este dispositivo.';
    } else {
        msg += ' Revisa los permisos de micrófono de tu navegador e inténtalo de nuevo.';
    }
    log('SISTEMA', msg);
}

function toggleMic() {
    if (!reconocimientoDisponible) return;

    if (escuchandoVoz) {
        detenerEscuchaVoz();
    } else {
        iniciarEscuchaVoz();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('text-input');
    const btn = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                detenerEscuchaVoz();
                enviarTexto();
            }
        });
    }
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            enviarTexto();
        });
    }
    if (btnMic) {
        btnMic.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMic();
        });
    }
});

