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
    habitaciones: 0,
    habActual: 1,
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
                log('SISTEMA', `🏷️ Categoría: ${data.tags.join(', ')}`);
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
    const botones = MENU_PRINCIPAL.map(cat => ({
        icono: cat.icono,
        label: cat.label,
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
    if (input) {
        input.disabled = false;
        input.value = '';
        input.focus();
    }
    if (btn) btn.disabled = false;
}

function enviarTexto() {
    const input = document.getElementById('text-input');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto) return;

    const input2 = input; // deshabilitar mientras se procesa
    input2.disabled = true;
    const btn = document.getElementById('btn-send');
    if (btn) btn.disabled = true;

    log('TU', texto);
    input.value = '';
    setAvatar('pensar');

    setTimeout(() => {
        cerebro(texto.toLowerCase());
    }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('text-input');
    const btn = document.getElementById('btn-send');

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
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

            estado = 'FECHA_IN';
            hablar(`Perfecto, ${destinoEncontrado}. Fecha cuando inicia el viaje. (Ejemplo: 29 de julio).`);
        } else {
            hablar(`No encontré "${txt}" en la base de datos. Intenta con otro.`);
        }
        return;
    }

    if (estado === 'FECHA_IN') {
        const fechaObj = parsearFecha(txt);
        if (!fechaObj) {
            hablar("No entendí la fecha. Intenta: Día y Mes.");
            return;
        }
        let hoy = new Date(); hoy.setHours(0,0,0,0);
        if (fechaObj < hoy) {
            hablar("Esa fecha ya pasó. Dime una fecha futura.");
            return;
        }
        datos.fechaEntrada = fechaObj;
        datos.strEntrada = txt;
        estado = 'FECHA_OUT';
        hablar("Ok. Ahora dime la fecha cuando termina el viaje.");
        return;
    }

    if (estado === 'FECHA_OUT') {
        const fechaObj = parsearFecha(txt);
        if (!fechaObj) {
            hablar("Repite la fecha cuando termina el viaje.");
            return;
        }
        if (fechaObj <= datos.fechaEntrada) {
            hablar(`La fecha de cuando termina el viaje debe ser posterior a la fecha cuando inicia el viaje. Dime otra fecha.`);
            return;
        }
        datos.fechaSalida = fechaObj;
        estado = 'HABITACIONES';
        hablar("Fechas correctas. ¿Cuántas habitaciones necesitan?");
        return;
    }

    if (estado === 'HABITACIONES') {
        let cant = obtenerNumero(txt) || 1;
        datos.habitaciones = cant;
        datos.habActual = 1;
        datos.habData = [];
        for(let i=0; i<cant; i++) datos.habData.push({adultos:0, menores:0, edades:''});

        estado = 'ADULTOS';
        let preg = cant === 1 ? "¿Cuántos adultos van?" : "Habitación 1. ¿Cuántos adultos?";
        hablar(preg);
        return;
    }

    if (estado === 'ADULTOS') {
        let num = obtenerNumero(txt);
        if (num === 0) num = 2;
        datos.habData[datos.habActual-1].adultos = num;

        estado = 'MENORES';
        hablar("¿Cuántos menores? (Escribe cero si no hay).");
        return;
    }

    if (estado === 'MENORES') {
        let num = obtenerNumero(txt);
        if (num === 0) {
            if (txt.includes('cero') || txt.includes('no') || txt.includes('ninguno') || txt.includes('nadie')) {
                num = 0;
            } else if (txt.includes('niño') || txt.includes('menor') || txt.includes('bebe') || txt.includes('hijo')) {
                num = 1;
            }
        }
        datos.habData[datos.habActual-1].menores = num;
        if (num > 0) {
            estado = 'EDADES';
            hablar(`Entendido, ${num} menores. Dime sus edades.`);
        } else {
            siguienteHabitacion();
        }
        return;
    }

    if (estado === 'EDADES') {
        datos.habData[datos.habActual-1].edades = txt;
        siguienteHabitacion();
        return;
    }
}

function siguienteHabitacion() {
    if (datos.habActual < datos.habitaciones) {
        datos.habActual++;
        estado = 'ADULTOS';
        hablar(`Listo. Vamos con la habitación ${datos.habActual}. ¿Cuántos adultos?`);
    } else {
        finalizar('cotizar', null);
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