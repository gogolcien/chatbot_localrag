let AGENTE_ACTIVO = null;

// ================= CONFIGURACIÓN =================
AVATAR = {
    neutral: './assets/saludo.gif',
    hablar: './assets/explicando.gif',
    pensar: './assets/pensando.gif',
    exito: './assets/exito.gif'
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
    habData: []
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

        hablar(data.respuesta, () => {
            volverAMenu();
        });

        // Si el backend detectó una opción de menú razonablemente parecida a la pregunta
        // (MENU_MENTION_THRESHOLD), ya no se ofrece como botón del panel de menú: solo se
        // informa como texto en la consola de interacción (#chat-box), a modo de dato.
        if (data.menu_mention) {
            setTimeout(() => {
                log('SISTEMA', `ℹ️ Te recomiendo consultar dentro del menú de opciones (${data.menu_mention.ruta}).`);
            }, 350);
        }

        // Cuando la respuesta viene del caché semántico (ya fue aprobada por un admin),
        // si tiene categoría(s) asignada(s), se muestran como texto en la consola de
        // interacción, a modo de dato (no como botón del menú).
        if (data.fuente === 'cache_semantico' && Array.isArray(data.tags) && data.tags.length > 0) {
            setTimeout(() => {
                log('SISTEMA', `Te recomiendo consultar dentro del menú de opciones 🏷️ Categoría: ${data.tags.join(', ')}`);
            }, 350);
        }

        // Aviso discreto cuando la respuesta viene del modelo y está pendiente de revisión
        if (data.pendiente_revision) {
            setTimeout(() => {
                log('SISTEMA', 'ℹ️ Esta respuesta fue generada por IA y quedó pendiente de revisión por un administrador.');
            }, 350);
        }
    } catch (err) {
        ocultarOverlayProcesando();
        console.error('Error consultando backend:', err);
        hablar(
            "No pude conectarme con el asistente de IA local. Verifica que el backend y Ollama estén corriendo, o intenta con: Cotizar, Subir Pago o Facturar.",
            () => volverAMenu()
        );
    }
}

// ================= CARGA DE DATOS (JSON) =================
window.onload = function () {

    fetch('https://nuevo.sistemaimacop.com.mx/API/ApiDestinos', {
        method: 'POST',
        body: new URLSearchParams({
            user: 'Imacop',
            password: '25041988',
            gih: '0',
            pagina: '0',
            num_reg: '5000'
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Error en la respuesta del servidor');
        }
        return response.json();
    })
    .then(data => {
        // 🔹 Nos quedamos solo con los nombres de destinos
        DESTINOS_VALIDOS = data.map(d => d.destinationName.toUpperCase());

        data.forEach(d => {
            DESTINOS_MAP[d.destinationName.toUpperCase()] = {
                id: d.destinationId,
                nombre: d.destinationName,
                imagen: d.destinationImage,
                descripcion: d.destinationDescription,
                lat: d.latitude,
                lng: d.longitude
            };
        });

        // 🔹 Habilitar botón
        const btn = document.getElementById('btn-start');
        const txt = document.getElementById('estado-texto');

        btn.disabled = false;
        btn.innerText = "EMPEZAR";
        btn.classList.remove('bg-gray-600', 'cursor-not-allowed', 'opacity-50');
        btn.classList.add('bg-indigo-600', 'hover:bg-indigo-500');
        txt.innerText = "";
    })
    .catch(error => {
        document.getElementById('estado-texto').innerText = "ERROR CARGANDO DESTINOS";
        log('SISTEMA', 'No se pudo obtener la lista de destinos desde el API.');
    });
};

// ================= UTILIDADES DE TEXTO =================
function normalizar(texto) {
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function validarDestino(textoUsuario) {
    let input = normalizar(textoUsuario);

    for (let destino of DESTINOS_VALIDOS) {
        let destinoClean = normalizar(destino);
        // Búsqueda flexible (si dice "vallarta" encuentra "Puerto Vallarta")
        if (destinoClean.includes(input) || input.includes(destinoClean)) {
            return destino;
        }
    }
    return null;
}

// ================= INTERFAZ =================
function setAvatar(tipo) {
    const img = document.getElementById('avatar-img');
    const txt = document.getElementById('estado-texto');
    img.className = "w-24 h-24 object-contain border-4 border-indigo-500 bg-white shadow-xl transition-all duration-200";

    if (tipo === 'hablar') {
        img.src = AVATAR.hablar;
        img.classList.add('hablando');
        txt.innerText = "RESPONDIENDO...";
    } else if (tipo === 'pensar') {
        img.src = AVATAR.pensar;
        txt.innerText = "PROCESANDO...";
    } else if (tipo === 'exito') {
        img.src = AVATAR.exito;
        txt.innerText = "TERMINADO";
    } else {
        img.src = AVATAR.neutral;
        txt.innerText = "ESCRIBE TU DUDA...";
    }
}

// ================= MENÚ POR BOTONES (2 niveles) =================

/**
 * Responde usando un item con forma {resp, url, info} — funciona igual para un match
 * de BASE_CONOCIMIENTO por texto libre que para un click de botón en ITEMS_MENU.
 * Es la única fuente de verdad para este tipo de respuesta fija + link.
 */
function responderItem(item) {
    hablar(item.resp, () => volverAMenu());
    if (item.url) {
        mostrarBotonAbrir(item.info || "Haz clic para ver más detalles", item.url);
    } else if (item.info) {
        log('BOT', item.info);
    }
}

/** Devuelve las FAQ de BASE_CONOCIMIENTO que pertenecen a una categoría del menú. */
function obtenerFAQPorCategoria(categoria) {
    return BASE_CONOCIMIENTO.filter(item => item.categoria === categoria);
}

/**
 * Pinta un grupo de botones en el panel lateral exclusivo para el menú de opciones
 * (#menu-panel-content), separado de la consola de interacción (#chat-box). Cada
 * boton trae su propio onClick, así que sirve tanto para el menú principal como
 * para cualquier submenú. Cada llamada reemplaza el contenido anterior del panel,
 * ya que el panel siempre debe reflejar únicamente las opciones vigentes.
 */
function mostrarBotones(botones) {
    const panel = document.getElementById('menu-panel-content');
    if (!panel) return;

    const idUnico = 'menu-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    let html = `<div class="space-y-1.5 animate-fade-in" id="${idUnico}">`;

    botones.forEach((b, i) => {
        html += `<button data-menu-idx="${i}" class="w-full text-left bg-slate-700 hover:bg-indigo-600 transition text-white text-sm px-3 py-2.5 rounded-lg flex items-center gap-2">
            ${b.icono ? `<span>${b.icono}</span>` : ''}<span>${b.label}</span>
        </button>`;
    });

    html += `</div>`;
    panel.innerHTML = html;

    // Enlazamos los eventos aparte (no inline) para poder usar closures sin
    // preocuparnos de escapar comillas/emojis dentro del HTML.
    const contenedor = document.getElementById(idUnico);
    botones.forEach((b, i) => {
        const btnEl = contenedor.querySelector(`[data-menu-idx="${i}"]`);
        if (!btnEl) return;
        btnEl.addEventListener('click', () => {
            // Evita doble click y deja constancia visual de cuál se eligió
            contenedor.querySelectorAll('button').forEach(el => el.disabled = true);
            contenedor.classList.add('opacity-50');
            b.onClick();
        });
    });
}

/** Limpia el panel de menú y vuelve a mostrar el mensaje de "sin opciones". */
function limpiarPanelMenu() {
    const panel = document.getElementById('menu-panel-content');
    if (!panel) return;
    panel.innerHTML = `<p id="menu-panel-vacio" class="text-gray-500 text-center italic text-xs mt-4">Aún no hay opciones disponibles.</p>`;
}

/** Construye y muestra los botones del primer nivel (las 8 categorías). */
function renderBotonesMenuPrincipal() {
    const botones = MENU_PRINCIPAL.map((cat, i) => ({
        icono: cat.icono,
        label: `${i + 1}.- ${cat.label}`,
        onClick: () => seleccionarCategoriaMenu(cat)
    }));
    mostrarBotones(botones);
}

/** Maneja el click de una categoría del primer nivel según su tipo. */
function seleccionarCategoriaMenu(categoria) {
    log('TU', `${categoria.icono} ${categoria.label}`);

    if (categoria.tipo === 'flujo') {
        estado = categoria.flujo;
        hablar(categoria.mensaje);
        return;
    }

    if (categoria.tipo === 'accion') {
        responderItem(ITEMS_MENU[categoria.item]);
        return;
    }

    if (categoria.tipo === 'submenu' || categoria.tipo === 'submenu_flujo') {
        let opciones = obtenerFAQPorCategoria(categoria.categoria);
        let botones = opciones.map(item => ({
            label: item.label,
            onClick: () => responderItem(item)
        }));

        if (Array.isArray(categoria.extra)) {
            const extras = categoria.extra
                .map(key => ITEMS_MENU[key])
                .filter(Boolean)
                .map(item => ({ label: item.label, onClick: () => responderItem(item) }));
            botones = extras.concat(botones);
        }

        // 'submenu_flujo': el primer botón no responde una FAQ, inicia el mismo
        // flujo de varios pasos que antes disparaba directo la categoría (p.ej. cotizar).
        if (categoria.tipo === 'submenu_flujo') {
            botones = [{
                icono: '▶️',
                label: categoria.flujoLabel || 'Iniciar',
                onClick: () => {
                    estado = categoria.flujo;
                    hablar(categoria.mensaje);
                }
            }].concat(botones);
        }

        if (categoria.libre) {
            botones.push({
                icono: '✍️',
                label: 'Otra pregunta (escríbela abajo)',
                onClick: () => {
                    estado = 'MENU';
                    hablar('Perfecto, escribe tu pregunta abajo y te ayudo con eso.', () => escuchar());
                }
            });
        }

        botones = botones.map((b, i) => ({ ...b, label: `${i + 1}.- ${b.label}` }));

        setTimeout(() => mostrarBotones(botones), 150);
        return;
    }
}

function log(user, msg) {
    const box = document.getElementById('chat-box');
    const color = user === 'BOT' ? 'text-indigo-400' : 'text-green-400';
    const align = user === 'BOT' ? 'text-left' : 'text-right';
    const entrada = document.createElement('div');
    entrada.className = align;
    entrada.innerHTML = `<span class="${color} font-bold text-xs">${user}</span><br>${msg}`;
    box.appendChild(entrada);
    box.scrollTop = box.scrollHeight;
}

// ================= OVERLAY DE PROCESAMIENTO (pantalla completa) =================
// Se muestra mientras se espera la respuesta del backend/modelo, para que quede claro
// que la app sigue trabajando aunque tarde unos segundos. Solo aparece si la respuesta
// tarda mas de OVERLAY_DELAY_MS: si es un hit de cache semantico (responde casi al
// instante), nunca llega a mostrarse.
const OVERLAY_DELAY_MS = 500;
let overlayTimeoutId = null;

function mostrarOverlayProcesando() {
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

    log('TU', texto);
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

function seleccionarAgente(tipo) {
    AGENTE_ACTIVO = AGENTES[tipo];
    AVATAR = AGENTE_ACTIVO.avatar;

    // Ocultar selector
    document.getElementById('selector-agente').style.display = 'none';

    // Mostrar avatar y botón
    document.getElementById('bloque-avatar').classList.remove('hidden');
    document.getElementById('btn-start').classList.remove('hidden');

    setAvatar('neutral');

    document.getElementById('estado-texto').innerText =
        `Te atenderá ${AGENTE_ACTIVO.nombre}`;
}

function iniciar() {
    if (!AGENTE_ACTIVO) {
        alert("Por favor selecciona un agente (Ian o Mia) primero.");
        return;
    }

    estado = 'MENU';

    // 1. Ocultamos el botón de "EMPEZAR"
    const btnStart = document.getElementById('btn-start');
    btnStart.classList.add('hidden');

    // 2. Mostramos el área de input de texto
    const inputArea = document.getElementById('input-area');
    inputArea.classList.remove('hidden');

    // 3. Mostramos el panel del menú de opciones (oculto hasta este momento)
    const menuPanel = document.getElementById('menu-panel');
    if (menuPanel) menuPanel.classList.remove('hidden');

    setTimeout(() => {
        log('BOT',
            "<b>Hola, Bienvenido, soy tu Asistente Virtual.</b><br>" +
            "Elige una opción para continuar, o si prefieres, escribe tu pregunta directamente abajo."
        );

        setTimeout(() => renderBotonesMenuPrincipal(), 250);
        escuchar();

    }, 100);
}

function cerebro(txt)
{
    if (estado === 'MENU')
    {
        // Ya no se compara contra tags ni palabras clave: las 25 opciones de FAQ/trámites
        // se navegan por botones (ver MENU_PRINCIPAL / seleccionarCategoriaMenu en data.js
        // y arriba en este archivo). Cualquier texto libre que llegue aquí es una pregunta
        // que no cubre ningún botón, así que va directo al backend (cache semántico + IA).
        consultarBackend(txt);
        return;
    }

    if (estado === 'PAGO') {
        let nums = txt.replace(/\D/g, '');
        if (nums) finalizar('pago', nums);
        else hablar("Repite el número por favor.");
        return;
    }

    if (estado === 'DESTINO') {
        const destinoEncontrado = validarDestino(txt);

        if (destinoEncontrado) {
            datos.destino = destinoEncontrado;

             datos.imagenDestino = DESTINOS_MAP[destinoEncontrado]?.imagen || null;
             let imagen_destino_completa='https://nuevo.sistemaimacop.com.mx/'+datos.imagenDestino;
               logDestinoVisual(destinoEncontrado, imagen_destino_completa);

            estado = 'FECHA_UI';
            hablar(`Perfecto, ${destinoEncontrado}. Selecciona tus fechas de viaje:`, () => {
                mostrarSelectorFechas();
            });
        } else {
            hablar(`No encontré "${txt}" en la base de datos. Intenta con otro.`);
        }
        return;
    }

    if (estado === 'FECHA_UI') {
        // Mientras el widget de fechas está activo no se procesa texto libre:
        // el usuario debe usar los calendarios/botón "Continuar" de arriba.
        hablar("Usa el calendario de arriba para elegir tus fechas de entrada y salida.", () => {});
        return;
    }

    if (estado === 'HABITACIONES_UI') {
        // Mientras el widget de habitaciones está activo no se procesa texto libre:
        // el usuario debe usar las tarjetas/botón "Continuar" de arriba.
        hablar("Usa las tarjetas de arriba para indicar habitaciones, adultos y niños.", () => {});
        return;
    }
}

function obtenerNumero(txt) {
    let matches = txt.match(/\d+/);
    if (matches) return parseInt(matches[0]);
    const nums = { 'un': 1, 'uno':1, 'una':1, 'unos': 1, 'dos':2, 'tres':3, 'cuatro':4, 'cinco':5, 'seis':6 };
    for (let k in nums) {
        if (new RegExp(`\\b${k}\\b`, 'i').test(txt)) return nums[k];
    }
    return 0;
}

function parsearFecha(texto) {
    const meses = {
        'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
        'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    let diaMatch = texto.match(/\d+/);
    if (!diaMatch) return null;
    let dia = parseInt(diaMatch[0]);
    let mes = -1;
    for (let m in meses) { if (texto.includes(m)) { mes = meses[m]; break; } }
    if (mes === -1) return null;
    let hoy = new Date();
    let anio = hoy.getFullYear();
    if (hoy.getMonth() > 8 && mes < 3) anio++;
    return new Date(anio, mes, dia);
}

// ================= WIDGET DE FECHAS (estilo formulario: entrada, salida, noches) =================

/** Suma/resta días a una fecha en formato "yyyy-mm-dd" y devuelve el mismo formato. */
function sumarDiasISO(fechaISO, dias) {
    const f = new Date(fechaISO + 'T00:00:00');
    f.setDate(f.getDate() + dias);
    return f.toISOString().split('T')[0];
}

/** Diferencia en noches (días completos) entre dos fechas "yyyy-mm-dd". */
function diffNochesISO(entradaISO, salidaISO) {
    const a = new Date(entradaISO + 'T00:00:00');
    const b = new Date(salidaISO + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

/**
 * Pinta en la consola de interacción (#chat-box) un widget tipo formulario con
 * Fecha de entrada / Fecha de salida (calendarios nativos, formato dd/mm/aaaa)
 * y Noches (select), sincronizados entre sí igual que en el módulo de cotización
 * de referencia: cambiar una fecha recalcula noches, y cambiar noches recalcula
 * la fecha de salida.
 */
function mostrarSelectorFechas() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const salidaInicialISO = sumarDiasISO(hoyISO, 1);

    let opcionesNoches = '';
    for (let n = 1; n <= 30; n++) {
        opcionesNoches += `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n}</option>`;
    }

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="fecha-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha de entrada</label>
                    <input type="date" id="fecha-entrada-input" min="${hoyISO}" value="${hoyISO}"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha de salida</label>
                    <input type="date" id="fecha-salida-input" min="${salidaInicialISO}" value="${salidaInicialISO}"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Noches</label>
                    <select id="noches-select"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${opcionesNoches}
                    </select>
                </div>
                <p id="fecha-error" class="text-xs text-red-600 hidden"></p>
                <button id="btn-confirmar-fechas" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    const inputEntrada = document.getElementById('fecha-entrada-input');
    const inputSalida = document.getElementById('fecha-salida-input');
    const selectNoches = document.getElementById('noches-select');
    const btnConfirmar = document.getElementById('btn-confirmar-fechas');

    // Cambiar la fecha de entrada: ajusta el mínimo de salida y recalcula noches
    inputEntrada.addEventListener('change', () => {
        if (!inputEntrada.value) return;
        const minSalida = sumarDiasISO(inputEntrada.value, 1);
        inputSalida.min = minSalida;
        if (!inputSalida.value || inputSalida.value <= inputEntrada.value) {
            inputSalida.value = sumarDiasISO(inputEntrada.value, parseInt(selectNoches.value) || 1);
        }
        const n = diffNochesISO(inputEntrada.value, inputSalida.value);
        if (n >= 1 && n <= 30) selectNoches.value = n;
    });

    // Cambiar la fecha de salida: recalcula noches
    inputSalida.addEventListener('change', () => {
        if (!inputEntrada.value || !inputSalida.value) return;
        const n = diffNochesISO(inputEntrada.value, inputSalida.value);
        if (n >= 1 && n <= 30) selectNoches.value = n;
    });

    // Cambiar noches: recalcula la fecha de salida en automático
    selectNoches.addEventListener('change', () => {
        if (!inputEntrada.value) return;
        const n = parseInt(selectNoches.value);
        if (!n || n < 1 || n > 30) return;
        inputSalida.value = sumarDiasISO(inputEntrada.value, n);
    });

    btnConfirmar.addEventListener('click', confirmarFechas);
}

/** Valida y confirma las fechas elegidas en el widget, luego avanza el flujo. */
function confirmarFechas() {
    const inputEntrada = document.getElementById('fecha-entrada-input');
    const inputSalida = document.getElementById('fecha-salida-input');
    const selectNoches = document.getElementById('noches-select');
    const errorEl = document.getElementById('fecha-error');
    const btnConfirmar = document.getElementById('btn-confirmar-fechas');
    if (!inputEntrada || !inputSalida || !selectNoches) return;

    errorEl.classList.add('hidden');

    if (!inputEntrada.value || !inputSalida.value) {
        errorEl.textContent = 'Selecciona ambas fechas.';
        errorEl.classList.remove('hidden');
        return;
    }

    const nochesVal = parseInt(selectNoches.value);
    if (!nochesVal || nochesVal < 1 || nochesVal > 30) {
        errorEl.textContent = 'Indica un número de noches válido (entre 1 y 30).';
        errorEl.classList.remove('hidden');
        return;
    }

    const fechaEntrada = new Date(inputEntrada.value + 'T00:00:00');
    const fechaSalida = new Date(inputSalida.value + 'T00:00:00');
    let hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    if (fechaEntrada < hoy) {
        errorEl.textContent = 'La fecha de entrada ya pasó. Elige una fecha futura.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (fechaSalida <= fechaEntrada) {
        errorEl.textContent = 'La fecha de salida debe ser posterior a la de entrada.';
        errorEl.classList.remove('hidden');
        return;
    }

    datos.fechaEntrada = fechaEntrada;
    datos.fechaSalida = fechaSalida;
    datos.strEntrada = fechaEntrada.toLocaleDateString('es-MX'); // formato dd/mm/aaaa
    datos.noches = parseInt(selectNoches.value) || diffNochesISO(inputEntrada.value, inputSalida.value);

    // Bloquear el widget una vez confirmado, para que no se pueda reenviar
    const widget = document.getElementById('fecha-widget');
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        btnConfirmar.innerText = '✓ Fechas confirmadas';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    estado = 'HABITACIONES_UI';
    hablar(
        `Perfecto: del ${fechaEntrada.toLocaleDateString('es-MX')} al ${fechaSalida.toLocaleDateString('es-MX')} ` +
        `(${datos.noches} noche${datos.noches > 1 ? 's' : ''}). Ahora selecciona tus habitaciones:`,
        () => mostrarSelectorHabitaciones()
    );
}

// ================= WIDGET DE HABITACIONES (tarjetas: cantidad, adultos, niños, edades) =================
// Nota: aquí solo se captura la ocupación (cuántas habitaciones, adultos, niños y edades).
// Los tipos de habitación reales (foto, nombre, precio, amenidades) viven únicamente en la
// página de resultados real, a la que se redirige al final vía mostrarBotonAbrir() dentro de
// finalizar('cotizar', ...) — este widget no inventa ni muestra ese inventario.

/** Pinta las tarjetas de "Habitación N" (adultos/niños/edades) dentro del contenedor dado. */
function renderTarjetasHabitaciones(contenedor, cant) {
    let opcionesAdultos = '';
    for (let a = 1; a <= 8; a++) {
        opcionesAdultos += `<option value="${a}" ${a === 2 ? 'selected' : ''}>${a}</option>`;
    }
    let opcionesNinos = '';
    for (let n = 0; n <= 4; n++) {
        opcionesNinos += `<option value="${n}" ${n === 0 ? 'selected' : ''}>${n}</option>`;
    }

    contenedor.innerHTML = '';
    for (let i = 1; i <= cant; i++) {
        contenedor.innerHTML += `
            <div class="border border-slate-200 rounded-lg p-2.5 space-y-2" data-hab="${i}">
                <p class="text-xs font-bold text-slate-600">Habitación ${i}</p>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Adultos</label>
                    <select data-role="adultos" data-hab="${i}"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${opcionesAdultos}
                    </select>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Niños</label>
                    <select data-role="ninos" data-hab="${i}"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${opcionesNinos}
                    </select>
                </div>
                <div data-role="edades-contenedor" data-hab="${i}" class="space-y-1"></div>
            </div>
        `;
    }

    // Al cambiar "Niños" en una habitación, genera un campo de edad por cada menor
    let opcionesEdad = '';
    for (let ed = 0; ed <= 17; ed++) {
        opcionesEdad += `<option value="${ed}" ${ed === 0 ? 'selected' : ''}>${ed}</option>`;
    }

    contenedor.querySelectorAll('select[data-role="ninos"]').forEach(selectNinos => {
        selectNinos.addEventListener('change', () => {
            const hab = selectNinos.getAttribute('data-hab');
            const cantNinos = Math.max(0, parseInt(selectNinos.value) || 0);
            const edadesContenedor = contenedor.querySelector(`[data-role="edades-contenedor"][data-hab="${hab}"]`);
            edadesContenedor.innerHTML = '';
            for (let e = 1; e <= cantNinos; e++) {
                edadesContenedor.innerHTML += `
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Edad menor ${e}</label>
                        <select data-role="edad" data-hab="${hab}" data-menor="${e}"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ${opcionesEdad}
                        </select>
                    </div>
                `;
            }
        });
    });
}

/**
 * Pinta en la consola de interacción (#chat-box) el widget de habitaciones: un campo
 * "Habitaciones" (máx. 5) y una tarjeta por habitación con Adultos/Niños/Edades. A partir
 * de 6 habitaciones se muestra el aviso de reservación grupal y se ofrece hablar con un
 * agente en vez de continuar el flujo automático.
 */
function mostrarSelectorHabitaciones() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="habitaciones-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Habitaciones</label>
                    <select id="hab-cantidad-input"
                        class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        <option value="1" selected>1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6 o más (grupal)</option>
                    </select>
                </div>
                <p id="hab-grupal-msg" class="text-xs text-amber-600 hidden">
                    A partir de 6 habitaciones esto se maneja como <b>reservación grupal</b>, con condiciones
                    y tarifas especiales. Un agente debe atenderte directamente.
                </p>
                <div id="hab-tarjetas-container" class="space-y-3"></div>
                <p id="hab-error" class="text-xs text-red-600 hidden"></p>
                <button id="btn-confirmar-habitaciones" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
                <button id="btn-hablar-agente" type="button"
                    class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-semibold text-sm transition hidden">
                    Hablar con un agente
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    const inputCantidad = document.getElementById('hab-cantidad-input');
    const contenedorTarjetas = document.getElementById('hab-tarjetas-container');
    const msgGrupal = document.getElementById('hab-grupal-msg');
    const errorEl = document.getElementById('hab-error');
    const btnConfirmar = document.getElementById('btn-confirmar-habitaciones');
    const btnAgente = document.getElementById('btn-hablar-agente');

    function actualizarVistaPorCantidad() {
        const cant = parseInt(inputCantidad.value) || 1;
        errorEl.classList.add('hidden');

        if (cant >= 6) {
            msgGrupal.classList.remove('hidden');
            contenedorTarjetas.innerHTML = '';
            btnConfirmar.classList.add('hidden');
            btnAgente.classList.remove('hidden');
            return;
        }

        msgGrupal.classList.add('hidden');
        btnConfirmar.classList.remove('hidden');
        btnAgente.classList.add('hidden');
        renderTarjetasHabitaciones(contenedorTarjetas, cant);
    }

    inputCantidad.addEventListener('change', actualizarVistaPorCantidad);
    actualizarVistaPorCantidad(); // pinta la tarjeta inicial (1 habitación)

    btnAgente.addEventListener('click', () => {
        const widget = document.getElementById('habitaciones-widget');
        if (widget) widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        hablar(
            `Detecté ${inputCantidad.value} habitaciones. A partir de 6 habitaciones esto se maneja como ` +
            `<b>reservación grupal</b>, con condiciones y tarifas especiales. Un agente debe atenderte ` +
            `directamente para armar esa cotización.`,
            () => volverAMenu()
        );
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarHabitaciones(inputCantidad, contenedorTarjetas, errorEl, btnConfirmar);
    });
}

/** Valida las tarjetas de habitaciones, guarda los datos y continúa el flujo (finalizar). */
function confirmarHabitaciones(inputCantidad, contenedorTarjetas, errorEl, btnConfirmar) {
    errorEl.classList.add('hidden');
    const cant = parseInt(inputCantidad.value) || 1;
    const habData = [];

    for (let i = 1; i <= cant; i++) {
        const inputAdultos = contenedorTarjetas.querySelector(`select[data-role="adultos"][data-hab="${i}"]`);
        const inputNinos = contenedorTarjetas.querySelector(`select[data-role="ninos"][data-hab="${i}"]`);
        const adultos = parseInt(inputAdultos.value) || 0;
        const ninos = parseInt(inputNinos.value) || 0;

        if (adultos < 1) {
            errorEl.textContent = `Habitación ${i}: indica al menos 1 adulto.`;
            errorEl.classList.remove('hidden');
            return;
        }

        let edades = [];
        if (ninos > 0) {
            const inputsEdad = contenedorTarjetas.querySelectorAll(`select[data-role="edad"][data-hab="${i}"]`);
            if (inputsEdad.length < ninos) {
                errorEl.textContent = `Habitación ${i}: indica la edad de cada menor.`;
                errorEl.classList.remove('hidden');
                return;
            }
            inputsEdad.forEach(inp => edades.push(parseInt(inp.value) || 0));
        }

        habData.push({ adultos, menores: ninos, edades: edades.join(', ') });
    }

    datos.habitaciones = cant;
    datos.habData = habData;

    // Bloquear el widget una vez confirmado, para que no se pueda reenviar
    const widget = document.getElementById('habitaciones-widget');
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        btnConfirmar.innerText = '✓ Habitaciones confirmadas';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    finalizar('cotizar', null);
}

function finalizar(tipo, payload) {
    setAvatar('exito');
    estado = 'FIN';

    if (tipo === 'pago') {
        console.log("PAGO GDL:", payload);

        let id_agencia_dinamico=48384;
        hablar(
            `He detectado el GDL ${payload}. Te redirigiré a la sección de carga de pagos.`,
            () => {
                volverAMenu();
            }
        );
        mostrarBotonAbrir(
            "Aquí tienes el modulo de carga de pagos , aqui puedes subir los comprobantes de pagos de tus reservas",
            `https://nuevo.sistemaimacop.com.mx/subir_pago_agencia.php?id_agencia=${id_agencia_dinamico}`
        );
    }
    else {
        console.clear();
        console.log("%c DATOS COMPLETOS ", "background: #22c55e; color: white; padding: 5px; font-weight: bold;");
        console.log("DESTINO:", datos.destino);
        console.log("ENTRADA:", datos.fechaEntrada.toLocaleDateString());
        console.log("SALIDA: ", datos.fechaSalida.toLocaleDateString());
        console.table(datos.habData);

        hablar(
            `He terminado de cotizar , encontre losmejores resultados para ${datos.destino}, te entrego la lista` ,
        () => {
            volverAMenu();
        } );

        mostrarBotonAbrir(
            `He terminado de cotizar , encontre losmejores resultados para ${datos.destino}, te entrego la lista`,
            `https://agentes.imacop.com.mx/busquedas/resultados/12045191oghs5/Hoteles`
        );
    }
}

function logDestinoVisual(destino, imagenUrl) {
    const box = document.getElementById('chat-box');

    box.innerHTML += `
        <div class="text-left space-y-2">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-slate-800 border border-indigo-500 rounded-xl overflow-hidden shadow-lg max-w-xs">
                    <img src="${imagenUrl}"
                    onclick="window.open('${imagenUrl}','_blank')"
                    class="cursor-pointer w-full h-32 object-cover"  alt="${destino}">

                <div class="p-3 text-sm">
                    <p class="text-white font-semibold">${destino}</p>
                    <p class="text-xs text-indigo-300">Destino seleccionado</p>
                </div>
            </div>
        </div>
    `;

    box.scrollTop = box.scrollHeight;
}

function mostrarBotonAbrir(texto, url) {
    const box = document.getElementById('chat-box');

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-slate-800 border border-indigo-500 rounded-xl p-3 space-y-2 max-w-xs">
                <p class="text-sm text-white">${texto}</p>

                <button
                    onclick="window.open('${url}', '_blank')"
                    class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-semibold">
                    Abrir ahora
                </button>
            </div>
        </div>
    `;

    box.scrollTop = box.scrollHeight;
}

function volverAMenu(delay = 800) {
    setTimeout(() => {
        estado = 'MENU';
        hablar("<b>¿Puedo ayudarte en algo más?</b>", () => {
            setTimeout(() => renderBotonesMenuPrincipal(), 150);
            escuchar();
        });
    }, delay);
}