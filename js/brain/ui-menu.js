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
function seleccionarCategoriaMenu(categoria, { silencioso = false } = {}) {
    if (!silencioso) log('TU', `${categoria.icono} ${categoria.label}`);

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

// Escapa HTML (<, >, &, comillas) para que un texto se pueda insertar de forma segura
// dentro de innerHTML sin que el navegador lo interprete como etiquetas/atributos.
// Se usa para todo texto que venga directo del usuario (lo que escribe o dicta por voz)
// antes de pasarlo a log(), ya que log() usa innerHTML para poder mostrar el formato
// (negritas, etc.) de los mensajes del bot que sí están controlados por nuestro propio
// código. Sin este escape, alguien podría escribir HTML/JS (p.ej. "<img src=x onerror=...>")
// en el chat y el navegador lo ejecutaría (XSS).
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

