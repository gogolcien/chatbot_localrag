let AGENTE_ACTIVO = null;
let AUTO_INICIAR_PENDIENTE = false; // true si el usuario ya eligió agente pero aún no cargan los destinos

// ================= CONFIGURACIÓN =================
// Valores por defecto antes de elegir agente (IAN/MIA). #avatar-img es un <video>, así
// que estos valores nunca llegan a asignarse como src real (bloque-avatar permanece
// oculto hasta seleccionarAgente(), que sobreescribe esto con AGENTES[tipo].avatar antes
// de mostrarlo). Si algún día se muestra sin haber elegido agente, el atributo
// poster="./assets/logo.png" del <video> se sigue viendo igual como respaldo.
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

        // Si viene una redirección de menú pendiente (ver más abajo, ya sea por
        // menu_mention o por menu_opcion), "volverAMenu()" no se dispara aquí: se
        // dispararía en paralelo a dirigirAOpcionMenu() y terminaría reactivando el
        // input/menú (vía escuchar() y renderBotonesMenuPrincipal()) por encima del
        // flujo al que se está redirigiendo. Ese flujo es quien controla cuándo se
        // vuelve al menú.
        const hayConfirmacionMenuPendiente = !!(data.menu_mention || data.menu_opcion);

        hablar(data.respuesta, () => {
            if (!hayConfirmacionMenuPendiente) {
                volverAMenu();
            }
        });

        // Si el backend detectó (en la respuesta del modelo) una opción de menú
        // razonablemente parecida a la pregunta (MENU_MENTION_THRESHOLD), se le
        // pregunta Sí/No antes de llevarlo a esa opción (ver mostrarConfirmacionOpcion).
        // Solo si confirma "Sí" se ejecuta, con el mismo efecto que si hubiera hecho
        // click en el panel de menú.
        if (data.menu_mention) {
            setTimeout(() => {
                mostrarConfirmacionOpcion(data.menu_mention.label, {
                    onSi: () => dirigirAOpcionMenu(data.menu_mention.id)
                });
            }, 350);
        }

        // Cuando la respuesta viene del caché semántico (ya fue aprobada por un admin) y
        // tiene una categoría asignada que coincide con una opción real del menú, se
        // pregunta Sí/No antes de llevarlo a esa opción. Si el tag es texto libre sin
        // coincidencia real, se muestra solo como dato informativo (comportamiento anterior).
        if (data.fuente === 'cache_semantico' && Array.isArray(data.tags) && data.tags.length > 0) {
            setTimeout(() => {
                if (data.menu_opcion) {
                    mostrarConfirmacionOpcion(data.menu_opcion.label, {
                        onSi: () => dirigirAOpcionMenu(data.menu_opcion.id)
                    });
                } else {
                    log('SISTEMA', `Te recomiendo consultar dentro del menú de opciones 🏷️ Categoría: ${data.tags.join(', ')}`);
                }
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

    fetch(`${BACKEND_URL}/api/destinos`)
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

        // Si el usuario ya había elegido agente mientras se cargaban los destinos,
        // arrancamos el chat automáticamente ahora que ya están listos.
        if (AUTO_INICIAR_PENDIENTE) {
            AUTO_INICIAR_PENDIENTE = false;
            iniciar();
        }
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
    const video = document.getElementById('avatar-img');
    const txt = document.getElementById('estado-texto');
    video.className = "w-24 h-24 object-contain border-4 border-indigo-500 bg-white shadow-xl transition-all duration-200";

    let src;
    if (tipo === 'hablar') {
        src = AVATAR.hablar;
        video.classList.add('hablando');
        txt.innerText = "RESPONDIENDO...";
    } else if (tipo === 'pensar') {
        src = AVATAR.pensar;
        txt.innerText = "PROCESANDO...";
    } else if (tipo === 'exito') {
        src = AVATAR.exito;
        txt.innerText = "TERMINADO";
    } else {
        src = AVATAR.neutral;
        txt.innerText = "ESCRIBE TU DUDA...";
    }

    // Los 4 estados de un mismo agente comparten un único archivo .webm (igual que antes
    // con el .gif), así que solo hace falta recargar el <video> cuando de verdad cambia
    // el archivo (p.ej. al cambiar de IAN a MIA), no en cada cambio de estado.
    const srcAbsoluto = new URL(src, window.location.href).href;
    if (video.currentSrc !== srcAbsoluto) {
        video.src = src;
        video.load();
        video.play().catch(() => {}); // el navegador puede bloquear el autoplay; no es crítico
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

/**
 * Pinta en la consola de interacción (#chat-box) una confirmación Sí/No. Se usa desde
 * consultarBackend() cuando el backend (caché semántico o modelo de IA) detecta que la
 * pregunta de texto libre coincide con una opción real del menú: en vez de redirigir
 * directo, se pregunta "¿esta opción es lo que buscabas?" y solo se ejecuta si el
 * usuario confirma. Bloquea el campo de texto/micrófono generales mientras está
 * pendiente de respuesta (igual que los demás widgets de la consola).
 * - "Sí": llama a onSi(), que es quien decide cómo continuar.
 * - "No": llama a onNo() si se pasa, y vuelve a dejar disponible el campo de texto.
 */
function mostrarConfirmacionOpcion(label, { onSi, onNo }) {
    const box = document.getElementById('chat-box');
    if (!box) return;

    bloquearInputTexto();

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="confirmacion-opcion-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <p class="text-sm">¿Esta opción es lo que buscabas: <strong>"${label}"</strong>?</p>
                <div class="flex gap-2">
                    <button id="btn-confirmar-opcion-si" type="button"
                        class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                        Sí
                    </button>
                    <button id="btn-confirmar-opcion-no" type="button"
                        class="flex-1 bg-slate-300 hover:bg-slate-400 text-slate-800 py-2 rounded-lg font-semibold text-sm transition">
                        No
                    </button>
                </div>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    const widget = box.lastElementChild;
    const btnSi = widget.querySelector('#btn-confirmar-opcion-si');
    const btnNo = widget.querySelector('#btn-confirmar-opcion-no');

    btnSi.addEventListener('click', () => {
        btnSi.disabled = true;
        btnNo.disabled = true;
        btnSi.innerText = '✓ Sí';
        btnNo.classList.add('opacity-40');
        log('TU', 'Sí');
        onSi();
    });

    btnNo.addEventListener('click', () => {
        btnSi.disabled = true;
        btnNo.disabled = true;
        btnNo.innerText = '✓ No';
        btnSi.classList.add('opacity-40');
        log('TU', 'No');
        desbloquearInputTexto();
        if (onNo) {
            onNo();
        } else {
            hablar('Entendido. Escribe tu pregunta de otra forma o elige una opción del menú.', () => volverAMenu());
        }
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

/**
 * Arranca un flujo de menú (categoria.tipo 'flujo' o 'submenu_flujo'). Centralizado aquí
 * porque se dispara desde 3 lugares distintos (click directo, botón dentro de submenu_flujo,
 * y dirigirAOpcionMenu). El flujo 'DESTINO' (cotizar) es un caso especial: en vez de esperar
 * texto libre, muestra el selector de destinos (ver mostrarSelectorDestino).
 */
function iniciarFlujoMenu(categoria) {
    if (categoria.flujo === 'DESTINO') {
        estado = 'DESTINO_UI';
        // Mientras se elige el destino (y el resto de pasos del flujo de cotización)
        // se bloquean el campo de texto y el micrófono: el usuario debe usar los
        // widgets de arriba. Se vuelven a habilitar en volverAMenu() al terminar.
        bloquearInputTexto();
        hablar(categoria.mensaje, () => mostrarSelectorDestino());
        return;
    }
    if (categoria.flujo === 'PAGO') {
        estado = 'PAGO_UI';
        // Igual que en el flujo de cotización y en la guía interactiva: mientras se
        // pide el GDL/localizador se bloquean el campo de texto y el micrófono
        // generales, y se usa en su lugar el widget con su propio campo + micrófono.
        bloquearInputTexto();
        hablar(categoria.mensaje, () => mostrarCampoPago());
        return;
    }
    estado = categoria.flujo;
    hablar(categoria.mensaje);
}

/** Maneja el click de una categoría del primer nivel según su tipo. */
function seleccionarCategoriaMenu(categoria) {
    log('TU', `${categoria.icono} ${categoria.label}`);

    if (categoria.tipo === 'flujo') {
        iniciarFlujoMenu(categoria);
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
                .map(key => ({ key, item: ITEMS_MENU[key] }))
                .filter(x => x.item)
                .map(({ key, item }) => ({
                    label: item.label,
                    onClick: () => {
                        if (key === 'guia') {
                            log('TU', `📘 ${item.label}`);
                            estado = 'GUIA_DESTINO_UI';
                            // Igual que en el flujo de cotización: mientras se elige el
                            // destino de la guía se bloquean texto y micrófono.
                            bloquearInputTexto();
                            hablar('¿De qué destino te gustaría ver la guía interactiva?', () => mostrarSelectorDestinoGuia());
                        } else {
                            responderItem(item);
                        }
                    }
                }));
            botones = extras.concat(botones);
        }

        // 'submenu_flujo': el primer botón no responde una FAQ, inicia el mismo
        // flujo de varios pasos que antes disparaba directo la categoría (p.ej. cotizar).
        if (categoria.tipo === 'submenu_flujo') {
            botones = [{
                icono: '▶️',
                label: categoria.flujoLabel || 'Iniciar',
                onClick: () => iniciarFlujoMenu(categoria)
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

// ================= MICRÓFONO POR CAMPO (widgets de cotización) =================
// Además del micrófono general del chat, cada campo de los formularios de cotización
// (Ubicación, Fecha de entrada, Fecha de salida, Noches, Habitaciones, Plan de
// alimentos, Categoría de hotel, Nacionalidad) tiene su propio micrófono. Dictar por
// voz solo LLENA el campo y muestra lo capturado: nunca confirma nada por sí solo.
// La confirmación de cada paso siempre se hace con el botón "Continuar" (clic) o
// diciendo la palabra "continuar" con cualquiera de los micrófonos del widget.

/** HTML del botón de micrófono individual de un campo. */
function microfonoCampoHTML(id) {
    return `
        <button type="button" id="${id}" title="Dictar por voz"
            class="mic-campo shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-red-600 transition">
            🎙️
        </button>`;
}

/** HTML del texto (oculto por defecto) donde se muestra lo que el micrófono capturó. */
function capturaCampoHTML(id) {
    return `<p id="${id}" class="text-[11px] text-slate-500 italic hidden"></p>`;
}

/**
 * Activa el micrófono de un campo individual dentro de un widget de cotización.
 * - Si lo dictado es la palabra "continuar", NO se llena el campo: se dispara
 *   directamente el botón "Continuar" del widget (btnConfirmar), igual que si el
 *   usuario hubiera hecho clic en él.
 * - En cualquier otro caso, se muestra el texto capturado en `capturadoEl` y se
 *   llama a onResultado(transcript) para que cada widget decida cómo aplicarlo
 *   (llenar un input, elegir una opción de un select, interpretar una fecha, etc.).
 */
function activarMicrofonoCampo({ btn, capturadoEl, onResultado, btnConfirmar, palabrasConfirmar = [] }) {
    if (!btn) return;

    // btnConfirmar puede ser un elemento fijo, o una función que devuelve el botón
    // "vigente" en ese momento (p.ej. en habitaciones, cambia entre "Continuar" y
    // "Hablar con un agente" según la cantidad elegida).
    const resolverBtnConfirmar = () => (typeof btnConfirmar === 'function' ? btnConfirmar() : btnConfirmar);

    // "continuar" siempre confirma; cada widget puede sumar otras frases equivalentes
    // al texto de su propio botón (p.ej. "ver guía" en la guía interactiva).
    const palabrasClaveConfirmar = ['continuar', 'continua', ...palabrasConfirmar.map(p => normalizar(p).trim())];

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        btn.disabled = true;
        btn.title = 'Tu navegador no soporta dictado por voz';
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        return;
    }

    let escuchandoCampo = false;

    btn.addEventListener('click', async () => {
        if (escuchandoCampo || btn.disabled) return;

        const permiso = await solicitarPermisoMicrofono();
        if (!permiso) return;

        const rec = new SpeechRecognitionAPI();
        rec.lang = 'es-MX';
        rec.continuous = false;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        btn._reconocimientoActivo = rec; // referencia para poder abortarlo si se bloquea el campo

        rec.onstart = () => {
            escuchandoCampo = true;
            btn.classList.add('escuchando-campo');
            if (capturadoEl) {
                capturadoEl.textContent = '🎙️ Escuchando...';
                capturadoEl.classList.remove('hidden');
            }
        };

        rec.onresult = (e) => {
            const transcript = (e.results[0][0].transcript || '').trim();
            const dicho = normalizar(transcript).trim();

            if (palabrasClaveConfirmar.includes(dicho)) {
                if (capturadoEl) capturadoEl.classList.add('hidden');
                const boton = resolverBtnConfirmar();
                if (boton && !boton.disabled && !boton.classList.contains('hidden')) boton.click();
                return;
            }

            if (capturadoEl) {
                capturadoEl.textContent = `🎙️ Escuché: "${transcript}"`;
                capturadoEl.classList.remove('hidden');
            }
            if (typeof onResultado === 'function') onResultado(transcript);
        };

        rec.onerror = (e) => {
            console.error('Error de voz en campo:', e.error, e);
            if (capturadoEl && e.error !== 'aborted') {
                capturadoEl.textContent = '🎙️ No entendí. Intenta de nuevo o hazlo manualmente.';
                capturadoEl.classList.remove('hidden');
            }
        };

        rec.onend = () => {
            escuchandoCampo = false;
            btn.classList.remove('escuchando-campo');
            if (btn._reconocimientoActivo === rec) btn._reconocimientoActivo = null;
        };

        try { rec.start(); } catch (err) { console.warn('No se pudo iniciar el reconocimiento del campo', err); }
    });
}

/**
 * Bloquea un micrófono de campo ya confirmado: aborta el reconocimiento si estaba
 * escuchando en ese momento, lo deshabilita y lo pinta como inactivo (igual que los
 * demás inputs/selects/botones del widget al confirmarse).
 */
function bloquearMicrofonoCampo(btn) {
    if (!btn) return;
    if (btn._reconocimientoActivo) {
        try { btn._reconocimientoActivo.abort(); } catch (e) { /* vacío */ }
        btn._reconocimientoActivo = null;
    }
    btn.disabled = true;
    btn.classList.remove('escuchando-campo');
    btn.classList.add('opacity-40', 'cursor-not-allowed');
}

/** Bloquea todos los micrófonos de campo (.mic-campo) dentro de un widget ya confirmado. */
function bloquearMicrofonosDelWidget(widget) {
    if (!widget) return;
    widget.querySelectorAll('.mic-campo').forEach(bloquearMicrofonoCampo);
}

/** Convierte un número dictado en palabras ("seis", "veinte y uno", etc.) a su valor numérico, o null si no reconoce ninguno. */
const PALABRAS_NUMERO = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
    ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
    veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
    veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30
};

function palabraANumero(dicho) {
    const palabras = dicho.split(/\s+/).filter(Boolean);

    // Compuestos tipo "veinte y uno" -> 21, "veinte y dos" -> 22, etc.
    for (let i = 0; i < palabras.length - 2; i++) {
        if (palabras[i] === 'veinte' && palabras[i + 1] === 'y' && PALABRAS_NUMERO[palabras[i + 2]] !== undefined) {
            return 20 + PALABRAS_NUMERO[palabras[i + 2]];
        }
    }
    // Si dijo el mismo número dos veces ("seis seis") o mezclado con otras palabras,
    // se toma la primera palabra reconocida como número.
    for (const palabra of palabras) {
        if (PALABRAS_NUMERO[palabra] !== undefined) return PALABRAS_NUMERO[palabra];
    }
    return null;
}

/** Busca en un <select> la opción cuyo texto se parezca más a lo dictado, y la selecciona. Devuelve el texto elegido o null. */
function elegirOpcionPorVoz(selectEl, transcript) {
    if (!selectEl) return null;
    const dicho = normalizar(transcript).trim();

    // 1) Coincidencia exacta contra el texto de cada opción
    for (const opt of selectEl.options) {
        if (normalizar(opt.text).trim() === dicho) {
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event('change'));
            return opt.text;
        }
    }
    // 2) Coincidencia parcial (p.ej. dijo "todo incluido" y la opción es "Todo incluido especial")
    for (const opt of selectEl.options) {
        const texto = normalizar(opt.text).trim();
        if (texto.includes(dicho) || dicho.includes(texto)) {
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event('change'));
            return opt.text;
        }
    }
    // 3) Número dicho (en dígitos como "3", o en palabras como "seis"/"tres estrellas superior")
    const numeroDigito = dicho.match(/\d+/);
    const numero = numeroDigito ? parseInt(numeroDigito[0], 10) : palabraANumero(dicho);

    if (numero !== null) {
        // Todas las opciones cuyo texto empieza justo con ese número (p.ej. para "5" reúne
        // "5 estrellas", "5 estrellas y media", "5 estrellas superior", "5 estrellas lujo").
        const candidatosNumero = [...selectEl.options].filter(o => {
            const t = normalizar(o.text).trim();
            return t === String(numero) || t.startsWith(`${numero} `);
        });

        if (candidatosNumero.length) {
            // Si lo dictado incluye un calificador ("superior", "lujo", "media"), se usa
            // para elegir la variante correcta entre las que comparten el mismo número.
            const calificadores = ['lujo', 'superior', 'media'];
            const calificadorDicho = calificadores.find(c => dicho.includes(c));

            let candidato = calificadorDicho
                ? candidatosNumero.find(o => normalizar(o.text).includes(calificadorDicho))
                : null;

            // Si no dijo ningún calificador (o no coincidió con ninguno), se prefiere la
            // opción "plana" sin calificadores (p.ej. "3 estrellas" en vez de "3 estrellas y media").
            if (!candidato) {
                candidato = candidatosNumero.find(o => calificadores.every(c => !normalizar(o.text).includes(c)));
            }
            // Último recurso: la primera opción que empiece con ese número.
            if (!candidato) candidato = candidatosNumero[0];

            selectEl.value = candidato.value;
            selectEl.dispatchEvent(new Event('change'));
            return candidato.text;
        }

        // Si ninguna opción de texto empieza con el número (p.ej. selects como Noches/
        // Habitaciones donde el value ES el número), se busca por el value directamente.
        const candidatoPorValue = [...selectEl.options].find(o => normalizar(o.value).trim() === String(numero));
        if (candidatoPorValue) {
            selectEl.value = candidatoPorValue.value;
            selectEl.dispatchEvent(new Event('change'));
            return candidatoPorValue.text;
        }
    }
    return null;
}

/** Interpreta una fecha dictada ("12 de agosto de 2026", "12/08/2026", "hoy", "mañana") y la devuelve en formato ISO yyyy-mm-dd, o null si no se pudo interpretar. */
function interpretarFechaVoz(transcript) {
    const dicho = normalizar(transcript).trim();
    const hoyISO = new Date().toISOString().split('T')[0];

    if (dicho === 'hoy') return hoyISO;
    if (dicho === 'manana' || dicho === 'mañana') return sumarDiasISO(hoyISO, 1);

    // dd/mm/yyyy o dd-mm-yyyy
    let m = dicho.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
        let [, d, mo, y] = m;
        if (y.length === 2) y = '20' + y;
        const iso = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (!isNaN(new Date(iso + 'T00:00:00').getTime())) return iso;
    }

    // "12 de agosto de 2026" o "12 de agosto"
    const meses = {
        enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
        julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
        noviembre: '11', diciembre: '12'
    };
    m = dicho.match(/(\d{1,2})\s*(?:de)?\s*([a-z]+)(?:\s*(?:de)?\s*(\d{4}))?/);
    if (m) {
        const [, d, mesTexto, yTexto] = m;
        const mesNum = meses[mesTexto];
        if (mesNum) {
            const y = yTexto || hoyISO.split('-')[0];
            const iso = `${y}-${mesNum}-${d.padStart(2, '0')}`;
            if (!isNaN(new Date(iso + 'T00:00:00').getTime())) return iso;
        }
    }

    return null;
}

function seleccionarAgente(tipo) {
    AGENTE_ACTIVO = AGENTES[tipo];
    AVATAR = AGENTE_ACTIVO.avatar;

    // Ocultar selector
    document.getElementById('selector-agente').style.display = 'none';

    // Mostrar avatar y consola de interacción (el botón "EMPEZAR" ya no se usa: se arranca directo)
    document.getElementById('bloque-avatar').classList.remove('hidden');
    document.getElementById('consola-interaccion').classList.remove('hidden');

    setAvatar('neutral');

    const btnStart = document.getElementById('btn-start');

    if (btnStart && !btnStart.disabled) {
        // Los destinos ya están cargados: arrancamos de inmediato.
        document.getElementById('estado-texto').innerText =
            `Te atenderá ${AGENTE_ACTIVO.nombre}`;
        iniciar();
    } else {
        // Aún cargan los destinos: mostramos el estado y arrancamos en cuanto
        // terminen (ver AUTO_INICIAR_PENDIENTE en la carga de datos, más arriba).
        AUTO_INICIAR_PENDIENTE = true;
        document.getElementById('estado-texto').innerText =
            `Te atenderá ${AGENTE_ACTIVO.nombre} — cargando destinos...`;
    }
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

    if (estado === 'PAGO_UI') {
        // Mientras el widget de pago está activo no se procesa texto libre del chat
        // general: el usuario debe escribir o dictar en el campo de arriba.
        hablar("Usa el campo de arriba para escribir o dictar tu GDL o localizador.", () => {});
        return;
    }

    if (estado === 'DESTINO_UI') {
        // Mientras el widget de destino está activo no se procesa texto libre:
        // el usuario debe elegir de la lista/botón "Continuar" de arriba.
        hablar("Usa la lista de arriba para elegir tu destino.", () => {});
        return;
    }

    if (estado === 'GUIA_DESTINO_UI') {
        // Mientras el widget de destino de la guía está activo no se procesa texto libre:
        // el usuario debe elegir de la lista/botón "Continuar" de arriba.
        hablar("Usa la lista de arriba para elegir el destino.", () => {});
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

    if (estado === 'PREFERENCIAS_UI') {
        // Mientras el widget de plan de alimentos/categoría está activo no se procesa
        // texto libre: el usuario debe usar los selects/botón "Continuar" de arriba.
        hablar("Usa las opciones de arriba para elegir plan de alimentos y categoría.", () => {});
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

// ================= WIDGET DE DESTINO (input + datalist: se puede escribir o elegir de la lista) =================

/** Pinta en la consola de interacción (#chat-box) el campo de destino con su datalist de sugerencias. */
function mostrarSelectorDestino() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const destinosOrdenados = [...DESTINOS_VALIDOS].sort((a, b) => a.localeCompare(b, 'es'));
    const opcionesDestino = destinosOrdenados
        .map(d => `<option value="${d}"></option>`)
        .join('');

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="destino-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Destino</label>
                    <div class="flex items-center gap-1.5">
                        <input type="text" id="destino-input" list="destino-datalist" autocomplete="off"
                            placeholder="Escribe o elige un destino"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${microfonoCampoHTML('destino-mic')}
                    </div>
                    <datalist id="destino-datalist">
                        ${opcionesDestino}
                    </datalist>
                    ${capturaCampoHTML('destino-captura')}
                </div>
                <p id="destino-error" class="text-xs text-red-600 hidden"></p>
                <button id="btn-confirmar-destino" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    // Igual que en los demás widgets: se busca dentro del nodo recién insertado,
    // no con document.getElementById a secas, por si queda un widget viejo en el historial.
    const widget = box.lastElementChild;
    const inputDestino = widget.querySelector('#destino-input');
    const errorEl = widget.querySelector('#destino-error');
    const btnConfirmar = widget.querySelector('#btn-confirmar-destino');
    const btnMic = widget.querySelector('#destino-mic');
    const capturaEl = widget.querySelector('#destino-captura');

    inputDestino.focus();

    // Enter dentro del campo confirma igual que el botón (comportamiento esperado de un buscador).
    inputDestino.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmarDestino(inputDestino, errorEl, btnConfirmar, widget);
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarDestino(inputDestino, errorEl, btnConfirmar, widget);
    });

    // Micrófono del campo: solo dicta el destino en el input, no confirma nada.
    // La confirmación sigue siendo con el botón "Continuar" (clic o diciendo "continuar").
    activarMicrofonoCampo({
        btn: btnMic,
        capturadoEl: capturaEl,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            const destinoExacto = DESTINOS_VALIDOS.find(d => normalizar(d) === normalizar(transcript).trim());
            const destinoEncontrado = destinoExacto || validarDestino(transcript);
            inputDestino.value = destinoEncontrado || transcript;
        }
    });
}

/** Valida el destino escrito/elegido (exacto o por coincidencia parcial), y si es válido continúa el flujo. */
function confirmarDestino(inputDestino, errorEl, btnConfirmar, widget) {
    const texto = (inputDestino.value || '').trim();
    errorEl.classList.add('hidden');

    if (!texto) {
        errorEl.textContent = 'Escribe o elige un destino.';
        errorEl.classList.remove('hidden');
        return;
    }

    // Coincidencia exacta primero (lo normal si lo eligió del datalist); si no,
    // se intenta una coincidencia parcial (p.ej. escribió "vallarta" a mano).
    const destinoExacto = DESTINOS_VALIDOS.find(d => normalizar(d) === normalizar(texto));
    const destinoElegido = destinoExacto || validarDestino(texto);

    if (!destinoElegido) {
        errorEl.textContent = `No encontré "${texto}" en la lista. Intenta con otro nombre o elige uno de las sugerencias.`;
        errorEl.classList.remove('hidden');
        return;
    }

    datos.destino = destinoElegido;

    datos.imagenDestino = DESTINOS_MAP[destinoElegido]?.imagen || null;
    let imagen_destino_completa = 'https://nuevo.sistemaimacop.com.mx/' + datos.imagenDestino;
    logDestinoVisual(destinoElegido, imagen_destino_completa);

    // Se muestra el nombre real y completo del destino (aunque el usuario haya escrito
    // algo parcial como "vallarta"), y luego se bloquea el widget para que no se pueda cambiar.
    inputDestino.value = destinoElegido;
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
        btnConfirmar.innerText = '✓ Destino confirmado';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    estado = 'FECHA_UI';
    hablar(`Perfecto, ${destinoElegido}. Selecciona tus fechas de viaje:`, () => {
        mostrarSelectorFechas();
    });
}

// ================= WIDGET DE DESTINO PARA LA GUÍA INTERACTIVA (usa DESTINOS_GUIA) =================

/** Pinta el mismo tipo de selector que mostrarSelectorDestino(), pero usando DESTINOS_GUIA
 *  (la lista curada con id+nombre) en vez de DESTINOS_VALIDOS (la que trae la API). Al
 *  confirmar, redirige a la guía interactiva específica de ese destino. */
function mostrarSelectorDestinoGuia() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const destinosOrdenados = [...DESTINOS_GUIA].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const opcionesDestino = destinosOrdenados
        .map(d => `<option value="${d.nombre}"></option>`)
        .join('');

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="destino-guia-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Destino</label>
                    <div class="flex items-center gap-1.5">
                        <input type="text" id="destino-guia-input" list="destino-guia-datalist" autocomplete="off"
                            placeholder="Escribe o elige un destino"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${microfonoCampoHTML('destino-guia-mic')}
                    </div>
                    <datalist id="destino-guia-datalist">
                        ${opcionesDestino}
                    </datalist>
                    ${capturaCampoHTML('destino-guia-captura')}
                </div>
                <p id="destino-guia-error" class="text-xs text-red-600 hidden"></p>
                <button id="btn-confirmar-destino-guia" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    const widget = box.lastElementChild;
    const inputDestino = widget.querySelector('#destino-guia-input');
    const errorEl = widget.querySelector('#destino-guia-error');
    const btnConfirmar = widget.querySelector('#btn-confirmar-destino-guia');
    const btnMic = widget.querySelector('#destino-guia-mic');
    const capturaEl = widget.querySelector('#destino-guia-captura');

    inputDestino.focus();

    inputDestino.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmarDestinoGuia(inputDestino, errorEl, btnConfirmar, widget);
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarDestinoGuia(inputDestino, errorEl, btnConfirmar, widget);
    });

    // Micrófono del campo: solo dicta el destino en el input; la confirmación sigue
    // siendo con el botón "Continuar" (clic o diciendo "continuar").
    activarMicrofonoCampo({
        btn: btnMic,
        capturadoEl: capturaEl,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            const input = normalizar(transcript).trim();
            const destinoEncontrado = DESTINOS_GUIA.find(d => normalizar(d.nombre) === input)
                || DESTINOS_GUIA.find(d => normalizar(d.nombre).includes(input) || input.includes(normalizar(d.nombre)));
            inputDestino.value = destinoEncontrado ? destinoEncontrado.nombre : transcript;
        }
    });
}

/** Valida el destino contra DESTINOS_GUIA y, si es válido, redirige a la guía específica. */
function confirmarDestinoGuia(inputDestino, errorEl, btnConfirmar, widget) {
    const texto = (inputDestino.value || '').trim();
    errorEl.classList.add('hidden');

    if (!texto) {
        errorEl.textContent = 'Escribe o elige un destino.';
        errorEl.classList.remove('hidden');
        return;
    }

    const input = normalizar(texto);
    const destinoElegido = DESTINOS_GUIA.find(d => normalizar(d.nombre) === input)
        || DESTINOS_GUIA.find(d => normalizar(d.nombre).includes(input) || input.includes(normalizar(d.nombre)));

    if (!destinoElegido) {
        errorEl.textContent = `No encontré "${texto}" en la lista. Intenta con otro nombre o elige uno de las sugerencias.`;
        errorEl.classList.remove('hidden');
        return;
    }

    inputDestino.value = destinoElegido.nombre;
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
        btnConfirmar.innerText = '✓ Destino confirmado';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    estado = 'MENU';
    hablar(`Perfecto, aquí tienes la guía interactiva de ${destinoElegido.nombre}.`, () => volverAMenu());
    mostrarBotonAbrir(
        `Consulta destinos, hoteles, habitaciones e instalaciones de ${destinoElegido.nombre} para asesorar mejor a tus clientes.`,
        `https://guiainteractivadehoteles.com/Destino/${destinoElegido.id}`
    );
}

// ================= WIDGET DE PAGO (pide el GDL/localizador) =================

/** Pinta en la consola de interacción (#chat-box) el campo para escribir o dictar
 *  el GDL/localizador, igual estilo que el selector de destino de la guía
 *  interactiva (campo de texto + micrófono propio + botón "Continuar"). */
function mostrarCampoPago() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="pago-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">GDL / Localizador</label>
                    <div class="flex items-center gap-1.5">
                        <input type="text" id="pago-input" autocomplete="off" inputmode="numeric"
                            placeholder="Escribe el número de GDL o localizador"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${microfonoCampoHTML('pago-mic')}
                    </div>
                    ${capturaCampoHTML('pago-captura')}
                </div>
                <p id="pago-error" class="text-xs text-red-600 hidden"></p>
                <button id="btn-confirmar-pago" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    const widget = box.lastElementChild;
    const inputPago = widget.querySelector('#pago-input');
    const errorEl = widget.querySelector('#pago-error');
    const btnConfirmar = widget.querySelector('#btn-confirmar-pago');
    const btnMic = widget.querySelector('#pago-mic');
    const capturaEl = widget.querySelector('#pago-captura');

    inputPago.focus();

    inputPago.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmarPago(inputPago, errorEl, btnConfirmar, widget);
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarPago(inputPago, errorEl, btnConfirmar, widget);
    });

    // Micrófono del campo: solo dicta el GDL/localizador en el input (quedándose con
    // los dígitos de lo dictado); la confirmación sigue siendo con el botón
    // "Continuar" (clic o diciendo "continuar").
    activarMicrofonoCampo({
        btn: btnMic,
        capturadoEl: capturaEl,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            const nums = transcript.replace(/\D/g, '');
            inputPago.value = nums || transcript;
        }
    });
}

/** Valida el GDL/localizador escrito o dictado (debe traer al menos un dígito) y, si es válido, continúa el flujo de pago. */
function confirmarPago(inputPago, errorEl, btnConfirmar, widget) {
    const texto = (inputPago.value || '').trim();
    errorEl.classList.add('hidden');

    const nums = texto.replace(/\D/g, '');
    if (!nums) {
        errorEl.textContent = 'Escribe o dicta el número de GDL o localizador.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (widget) {
        widget.querySelectorAll('input, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
        btnConfirmar.innerText = '✓ Localizador confirmado';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    finalizar('pago', nums);
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
    const salidaMaximaISO = sumarDiasISO(hoyISO, 30);

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
                    <div class="flex items-center gap-1.5">
                        <input type="date" id="fecha-entrada-input" min="${hoyISO}" value="${hoyISO}"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${microfonoCampoHTML('fecha-entrada-mic')}
                    </div>
                    ${capturaCampoHTML('fecha-entrada-captura')}
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Fecha de salida</label>
                    <div class="flex items-center gap-1.5">
                        <input type="date" id="fecha-salida-input" min="${salidaInicialISO}" max="${salidaMaximaISO}" value="${salidaInicialISO}"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                        ${microfonoCampoHTML('fecha-salida-mic')}
                    </div>
                    ${capturaCampoHTML('fecha-salida-captura')}
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Noches</label>
                    <div class="flex items-center gap-1.5">
                        <select id="noches-select"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ${opcionesNoches}
                        </select>
                        ${microfonoCampoHTML('noches-mic')}
                    </div>
                    ${capturaCampoHTML('noches-captura')}
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

    // Se busca dentro del widget recién insertado (no con document.getElementById a secas):
    // si el usuario vuelve a pasar por "Cotizar ahora", el widget anterior sigue en el
    // historial del chat con los mismos ids, y getElementById siempre devolvería el primero
    // (el viejo, ya deshabilitado) en vez del que se acaba de mostrar.
    const widget = box.lastElementChild;
    const inputEntrada = widget.querySelector('#fecha-entrada-input');
    const inputSalida = widget.querySelector('#fecha-salida-input');
    const selectNoches = widget.querySelector('#noches-select');
    const errorEl = widget.querySelector('#fecha-error');
    const btnConfirmar = widget.querySelector('#btn-confirmar-fechas');
    const btnMicEntrada = widget.querySelector('#fecha-entrada-mic');
    const capturaEntrada = widget.querySelector('#fecha-entrada-captura');
    const btnMicSalida = widget.querySelector('#fecha-salida-mic');
    const capturaSalida = widget.querySelector('#fecha-salida-captura');
    const btnMicNoches = widget.querySelector('#noches-mic');
    const capturaNoches = widget.querySelector('#noches-captura');

    // Cambiar la fecha de entrada: ajusta el mínimo de salida y recalcula noches
    inputEntrada.addEventListener('change', () => {
        if (!inputEntrada.value) return;
        const minSalida = sumarDiasISO(inputEntrada.value, 1);
        const maxSalida = sumarDiasISO(inputEntrada.value, 30);
        inputSalida.min = minSalida;
        inputSalida.max = maxSalida;
        if (!inputSalida.value || inputSalida.value <= inputEntrada.value || inputSalida.value > maxSalida) {
            inputSalida.value = sumarDiasISO(inputEntrada.value, parseInt(selectNoches.value) || 1);
        }
        const n = diffNochesISO(inputEntrada.value, inputSalida.value);
        if (n >= 1 && n <= 30) selectNoches.value = n;
    });

    inputSalida.addEventListener('change', () => {
        if (!inputEntrada.value || !inputSalida.value) return;
        const n = diffNochesISO(inputEntrada.value, inputSalida.value);
        if (n >= 1 && n <= 30) selectNoches.value = n;
    });

    selectNoches.addEventListener('change', () => {
        if (!inputEntrada.value) return;
        const n = parseInt(selectNoches.value);
        if (!n || n < 1 || n > 30) return;
        inputSalida.value = sumarDiasISO(inputEntrada.value, n);
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarFechas(inputEntrada, inputSalida, selectNoches, errorEl, btnConfirmar, widget);
    });

    // Micrófonos de campo: solo dictan el valor y disparan los mismos eventos "change"
    // que ya sincronizan fechas/noches entre sí. La confirmación sigue siendo aparte
    // (botón "Continuar" o decir "continuar").
    activarMicrofonoCampo({
        btn: btnMicEntrada,
        capturadoEl: capturaEntrada,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            const iso = interpretarFechaVoz(transcript);
            if (iso) {
                inputEntrada.value = iso;
                inputEntrada.dispatchEvent(new Event('change'));
            }
        }
    });

    activarMicrofonoCampo({
        btn: btnMicSalida,
        capturadoEl: capturaSalida,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            const iso = interpretarFechaVoz(transcript);
            if (iso) {
                inputSalida.value = iso;
                inputSalida.dispatchEvent(new Event('change'));
            }
        }
    });

    activarMicrofonoCampo({
        btn: btnMicNoches,
        capturadoEl: capturaNoches,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => {
            elegirOpcionPorVoz(selectNoches, transcript);
        }
    });
}

/** Valida y confirma las fechas elegidas en el widget, luego avanza el flujo. */
function confirmarFechas(inputEntrada, inputSalida, selectNoches, errorEl, btnConfirmar, widget) {
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

    if (inputSalida.value > sumarDiasISO(inputEntrada.value, 30)) {
        errorEl.textContent = 'La fecha de salida no puede ser mayor a 30 días después de la entrada. Elige otra fecha.';
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
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
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
                    <div class="flex items-center gap-1.5">
                        <select id="hab-cantidad-input"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            <option value="1" selected>1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6 o más (grupal)</option>
                        </select>
                        ${microfonoCampoHTML('hab-cantidad-mic')}
                    </div>
                    ${capturaCampoHTML('hab-cantidad-captura')}
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

    // Igual que en el widget de fechas: se busca dentro del nodo recién insertado,
    // no con document.getElementById a secas, para no chocar con un widget anterior
    // que haya quedado en el historial del chat con los mismos ids.
    const widget = box.lastElementChild;
    const inputCantidad = widget.querySelector('#hab-cantidad-input');
    const contenedorTarjetas = widget.querySelector('#hab-tarjetas-container');
    const msgGrupal = widget.querySelector('#hab-grupal-msg');
    const errorEl = widget.querySelector('#hab-error');
    const btnConfirmar = widget.querySelector('#btn-confirmar-habitaciones');
    const btnAgente = widget.querySelector('#btn-hablar-agente');
    const btnMicCantidad = widget.querySelector('#hab-cantidad-mic');
    const capturaCantidad = widget.querySelector('#hab-cantidad-captura');

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
        if (widget) {
            widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
            bloquearMicrofonosDelWidget(widget);
        }
        hablar(
            `Detecté ${inputCantidad.value} habitaciones. A partir de 6 habitaciones esto se maneja como ` +
            `<b>reservación grupal</b>, con condiciones y tarifas especiales. Un agente debe atenderte ` +
            `directamente para armar esa cotización.`,
            () => volverAMenu()
        );
    });

    btnConfirmar.addEventListener('click', () => {
        confirmarHabitaciones(inputCantidad, contenedorTarjetas, errorEl, btnConfirmar, widget);
    });

    // Micrófono del campo "Habitaciones": solo dicta la cantidad. Al decir "continuar"
    // dispara el botón visible en ese momento (Continuar, o Hablar con un agente si
    // se detectaron 6 o más habitaciones).
    activarMicrofonoCampo({
        btn: btnMicCantidad,
        capturadoEl: capturaCantidad,
        btnConfirmar: () => (btnAgente.classList.contains('hidden') ? btnConfirmar : btnAgente),
        onResultado: (transcript) => {
            elegirOpcionPorVoz(inputCantidad, transcript);
        }
    });
}

/** Valida las tarjetas de habitaciones, guarda los datos y continúa el flujo (finalizar). */
function confirmarHabitaciones(inputCantidad, contenedorTarjetas, errorEl, btnConfirmar, widget) {
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
    if (widget) {
        widget.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
        btnConfirmar.innerText = '✓ Habitaciones confirmadas';
        btnConfirmar.classList.remove('bg-red-600', 'hover:bg-red-500');
        btnConfirmar.classList.add('bg-green-600', 'opacity-70', 'cursor-not-allowed');
    }

    estado = 'PREFERENCIAS_UI';
    hablar(
        `Por último, dime tu plan de alimentos, categoría de hotel y nacionalidad:`,
        () => mostrarSelectorPreferencias()
    );
}

// ================= WIDGET DE PREFERENCIAS (Plan de alimentos / Categoría de hotel / Nacionalidad) =================

const PLANES_ALIMENTOS = [
    'Todos',
    'Solo habitación',
    'Todo incluido',
    'Todo incluido especial',
    'Alojamiento y desayuno',
    'Desayuno buffet',
    'Desayuno continental',
    'Media pensión',
    'Pensión completa'
];

const CATEGORIAS_HOTEL = [
    'Todas',
    '5 estrellas lujo',
    '5 estrellas superior',
    '5 estrellas y media',
    '5 estrellas',
    '4 estrellas y media',
    '4 estrellas',
    '3 estrellas y media',
    '3 estrellas',
    '2 estrellas y media'
];

// Lista de nacionalidades (países). "México" queda como valor por defecto ya que
// es el mercado principal de la agencia.
const NACIONALIDADES = [
    'México', 'Afganistán', 'Albania', 'Alemania', 'Andorra', 'Angola', 'Anguila',
    'Antártida', 'Antigua y Barbuda', 'Arabia Saudita', 'Argelia', 'Argentina', 'Armenia',
    'Aruba', 'Australia', 'Austria', 'Azerbaiyán', 'Bahamas', 'Bangladés', 'Barbados',
    'Baréin', 'Bélgica', 'Belice', 'Benín', 'Bermudas', 'Bielorrusia', 'Bolivia',
    'Bosnia y Herzegovina', 'Botsuana', 'Brasil', 'Brunéi', 'Bulgaria', 'Burkina Faso',
    'Burundi', 'Bután', 'Cabo Verde', 'Camboya', 'Camerún', 'Canadá', 'Catar', 'Chad',
    'Chile', 'China', 'Chipre', 'Ciudad del Vaticano', 'Colombia', 'Comoras', 'Corea del Norte',
    'Corea del Sur', 'Costa de Marfil', 'Costa Rica', 'Croacia', 'Cuba', 'Curazao', 'Dinamarca',
    'Dominica', 'Ecuador', 'Egipto', 'El Salvador', 'Emiratos Árabes Unidos', 'Eritrea',
    'Eslovaquia', 'Eslovenia', 'España', 'Estados Unidos', 'Estonia', 'Etiopía', 'Fiyi',
    'Filipinas', 'Finlandia', 'Francia', 'Gabón', 'Gambia', 'Georgia', 'Ghana', 'Gibraltar',
    'Granada', 'Grecia', 'Groenlandia', 'Guadalupe', 'Guam', 'Guatemala', 'Guayana Francesa',
    'Guernsey', 'Guinea', 'Guinea Ecuatorial', 'Guinea-Bisáu', 'Guyana', 'Haití', 'Honduras',
    'Hong Kong', 'Hungría', 'India', 'Indonesia', 'Irak', 'Irán', 'Irlanda', 'Isla de Man',
    'Islandia', 'Islas Caimán', 'Islas Cook', 'Islas Feroe', 'Islas Malvinas', 'Islas Marianas del Norte',
    'Islas Marshall', 'Islas Salomón', 'Islas Turcas y Caicos', 'Islas Vírgenes Británicas',
    'Islas Vírgenes de EE. UU.', 'Israel', 'Italia', 'Jamaica', 'Japón', 'Jersey', 'Jordania',
    'Kazajistán', 'Kenia', 'Kirguistán', 'Kiribati', 'Kuwait', 'Laos', 'Lesoto', 'Letonia',
    'Líbano', 'Liberia', 'Libia', 'Liechtenstein', 'Lituania', 'Luxemburgo', 'Macao',
    'Macedonia del Norte', 'Madagascar', 'Malasia', 'Malaui', 'Maldivas', 'Malí', 'Malta',
    'Marruecos', 'Martinica', 'Mauricio', 'Mauritania', 'Mayotte', 'Micronesia', 'Moldavia',
    'Mónaco', 'Mongolia', 'Montenegro', 'Montserrat', 'Mozambique', 'Myanmar (Birmania)',
    'Namibia', 'Nauru', 'Nepal', 'Nicaragua', 'Níger', 'Nigeria', 'Niue', 'Noruega',
    'Nueva Caledonia', 'Nueva Zelanda', 'Omán', 'Países Bajos', 'Pakistán', 'Palaos',
    'Palestina', 'Panamá', 'Papúa Nueva Guinea', 'Paraguay', 'Perú', 'Polinesia Francesa',
    'Polonia', 'Portugal', 'Puerto Rico', 'Reino Unido', 'República Centroafricana',
    'República Checa', 'República del Congo', 'República Democrática del Congo',
    'República Dominicana', 'Ruanda', 'Rumanía', 'Rusia', 'Samoa', 'San Cristóbal y Nieves',
    'San Marino', 'San Vicente y las Granadinas', 'Santa Lucía', 'Santo Tomé y Príncipe',
    'Senegal', 'Serbia', 'Seychelles', 'Sierra Leona', 'Singapur', 'Siria', 'Somalia',
    'Sri Lanka', 'Suazilandia', 'Sudáfrica', 'Sudán', 'Sudán del Sur', 'Suecia', 'Suiza',
    'Surinam', 'Tailandia', 'Taiwán', 'Tanzania', 'Tayikistán', 'Timor Oriental', 'Togo',
    'Tonga', 'Trinidad y Tobago', 'Túnez', 'Turkmenistán', 'Turquía', 'Tuvalu', 'Ucrania',
    'Uganda', 'Uruguay', 'Uzbekistán', 'Vanuatu', 'Venezuela', 'Vietnam', 'Yemen', 'Yibuti',
    'Zambia', 'Zimbabue'
];

/** Pinta en la consola de interacción (#chat-box) los selects de Plan de alimentos, Categoría de hotel y Nacionalidad. */
function mostrarSelectorPreferencias() {
    const box = document.getElementById('chat-box');
    if (!box) return;

    const opcionesPlan = PLANES_ALIMENTOS
        .map((p, i) => `<option value="${p}" ${i === 0 ? 'selected' : ''}>${p}</option>`)
        .join('');
    const opcionesCategoria = CATEGORIAS_HOTEL
        .map((c, i) => `<option value="${c}" ${i === 0 ? 'selected' : ''}>${c}</option>`)
        .join('');
    const opcionesNacionalidad = NACIONALIDADES
        .map((n, i) => `<option value="${n}" ${i === 0 ? 'selected' : ''}>${n}</option>`)
        .join('');

    box.innerHTML += `
        <div class="text-left space-y-2 animate-fade-in" id="preferencias-widget">
            <span class="text-indigo-400 font-bold text-xs">BOT</span>

            <div class="bg-white text-slate-800 rounded-xl p-4 space-y-3 max-w-xs shadow-lg">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plan de alimentos</label>
                    <div class="flex items-center gap-1.5">
                        <select id="plan-alimentos-select"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ${opcionesPlan}
                        </select>
                        ${microfonoCampoHTML('plan-alimentos-mic')}
                    </div>
                    ${capturaCampoHTML('plan-alimentos-captura')}
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Categoría de hotel</label>
                    <div class="flex items-center gap-1.5">
                        <select id="categoria-select"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ${opcionesCategoria}
                        </select>
                        ${microfonoCampoHTML('categoria-mic')}
                    </div>
                    ${capturaCampoHTML('categoria-captura')}
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Nacionalidad</label>
                    <div class="flex items-center gap-1.5">
                        <select id="nacionalidad-select"
                            class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500">
                            ${opcionesNacionalidad}
                        </select>
                        ${microfonoCampoHTML('nacionalidad-mic')}
                    </div>
                    ${capturaCampoHTML('nacionalidad-captura')}
                </div>
                <button id="btn-confirmar-preferencias" type="button"
                    class="w-full bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-semibold text-sm transition">
                    Continuar
                </button>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;

    // Igual que en los widgets anteriores: se busca dentro del nodo recién insertado,
    // no con document.getElementById a secas, por si queda un widget viejo en el historial.
    const widget = box.lastElementChild;
    const selectPlan = widget.querySelector('#plan-alimentos-select');
    const selectCategoria = widget.querySelector('#categoria-select');
    const selectNacionalidad = widget.querySelector('#nacionalidad-select');
    const btnConfirmar = widget.querySelector('#btn-confirmar-preferencias');
    const btnMicPlan = widget.querySelector('#plan-alimentos-mic');
    const capturaPlan = widget.querySelector('#plan-alimentos-captura');
    const btnMicCategoria = widget.querySelector('#categoria-mic');
    const capturaCategoria = widget.querySelector('#categoria-captura');
    const btnMicNacionalidad = widget.querySelector('#nacionalidad-mic');
    const capturaNacionalidad = widget.querySelector('#nacionalidad-captura');

    btnConfirmar.addEventListener('click', () => {
        confirmarPreferencias(selectPlan, selectCategoria, selectNacionalidad, btnConfirmar, widget);
    });

    activarMicrofonoCampo({
        btn: btnMicPlan,
        capturadoEl: capturaPlan,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => elegirOpcionPorVoz(selectPlan, transcript)
    });

    activarMicrofonoCampo({
        btn: btnMicCategoria,
        capturadoEl: capturaCategoria,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => elegirOpcionPorVoz(selectCategoria, transcript)
    });

    activarMicrofonoCampo({
        btn: btnMicNacionalidad,
        capturadoEl: capturaNacionalidad,
        btnConfirmar: btnConfirmar,
        onResultado: (transcript) => elegirOpcionPorVoz(selectNacionalidad, transcript)
    });
}

/** Guarda el plan de alimentos, la categoría de hotel y la nacionalidad elegidos, y termina el flujo de cotización. */
function confirmarPreferencias(selectPlan, selectCategoria, selectNacionalidad, btnConfirmar, widget) {
    datos.planAlimentos = selectPlan.value;
    datos.categoria = selectCategoria.value;
    datos.nacionalidad = selectNacionalidad.value;

    // Bloquear el widget una vez confirmado, para que no se pueda reenviar
    if (widget) {
        widget.querySelectorAll('select, button').forEach(el => el.disabled = true);
        bloquearMicrofonosDelWidget(widget);
        btnConfirmar.innerText = '✓ Preferencias confirmadas';
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
        console.log("PLAN DE ALIMENTOS:", datos.planAlimentos);
        console.log("CATEGORÍA:", datos.categoria);
        console.log("NACIONALIDAD:", datos.nacionalidad);
        console.table(datos.habData);

        hablar(
            `He terminado de cotizar , encontre los mejores resultados para ${datos.destino}, te entrego la lista` ,
        () => {
            volverAMenu();
        } );

        mostrarBotonAbrir(
            `He terminado de cotizar , encontre los mejores resultados para ${datos.destino}, te entrego la lista`,
            `https://agentes.imacop.com.mx/busquedas/resultados/12045191oghs5/Hoteles`
        );
    }
}

function logDestinoVisual(destino, imagenUrl) {
    const box = document.getElementById('chat-box');

    // Importante: se usa appendChild (no box.innerHTML +=) porque esta función se llama
    // DESPUÉS de que el widget de destino ya guardó referencias a su input/botón (para
    // bloquearlos). "innerHTML +=" reconstruye TODO el contenido de #chat-box desde cero,
    // lo que dejaría esas referencias apuntando a nodos ya fuera de pantalla.
    const entrada = document.createElement('div');
    entrada.className = 'text-left space-y-2';
    entrada.innerHTML = `
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
    `;
    box.appendChild(entrada);

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

/**
 * Lleva al usuario directo a una opción del menú por su id (misma respuesta que si
 * hubiera hecho click en el botón real): busca primero en las FAQ de BASE_CONOCIMIENTO,
 * luego el caso especial 'guia' (no tiene 'resp', su flujo vive en
 * mostrarSelectorDestinoGuia), luego el resto de los items fijos de ITEMS_MENU, y por
 * último las categorías de MENU_PRINCIPAL — delegando en seleccionarCategoriaMenu para
 * cubrir TODOS sus tipos ('flujo', 'accion', 'submenu', 'submenu_flujo') exactamente
 * igual que si el usuario hubiera hecho click real en el panel de menú.
 */
function dirigirAOpcionMenu(id) {
    const itemFaq = BASE_CONOCIMIENTO.find(f => f.id === id);
    if (itemFaq) {
        log('TU', itemFaq.label);
        responderItem(itemFaq);
        return;
    }

    // Caso especial: 'guia' no tiene 'resp' propio, su flujo real es elegir destino
    // y mostrar la guía interactiva (igual que en el submenú, ver seleccionarCategoriaMenu).
    if (id === 'guia' && ITEMS_MENU.guia) {
        const item = ITEMS_MENU.guia;
        log('TU', `📘 ${item.label}`);
        estado = 'GUIA_DESTINO_UI';
        bloquearInputTexto();
        hablar('¿De qué destino te gustaría ver la guía interactiva?', () => mostrarSelectorDestinoGuia());
        return;
    }

    const itemExtra = ITEMS_MENU[id];
    if (itemExtra) {
        log('TU', itemExtra.label);
        responderItem(itemExtra);
        return;
    }

    const categoria = MENU_PRINCIPAL.find(cat => cat.id === id);
    if (categoria) {
        // 'submenu_flujo' reutiliza el id de la categoría para su propio botón de
        // flujo (ver construirOpcionesMenu en el backend: el flujoBtn se registra con
        // id: cat.id). Por eso, si el id coincide con una categoría 'submenu_flujo',
        // SIEMPRE se refiere a ese botón de flujo (p.ej. "Cotizar hotel" dentro de
        // "Cotizar precio de hoteles y circuitos"), nunca a "abrir el submenú" en
        // general. Se arranca el flujo directo, igual que el botón ▶️ dentro del
        // submenú, en vez de delegar en seleccionarCategoriaMenu (que solo listaría
        // las opciones del submenú sin iniciar nada).
        if (categoria.tipo === 'submenu_flujo') {
            log('TU', `▶️ ${categoria.flujoLabel || categoria.label}`);
            iniciarFlujoMenu(categoria);
            return;
        }

        // Para el resto de tipos ('flujo', 'accion', 'submenu') sí se delega en
        // seleccionarCategoriaMenu (ya hace su propio log('TU', ...)), que se comporta
        // igual que un click real en el menú.
        seleccionarCategoriaMenu(categoria);
        return;
    }

    console.warn('[dirigirAOpcionMenu] No se encontró ninguna opción con id:', id);
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