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
function dirigirAOpcionMenu(id, { silencioso = false } = {}) {
    // `silencioso` evita repetir un log('TU', ...) con el nombre de la opción: se usa
    // cuando quien llama (p.ej. la confirmación Sí/No de consultarBackend) ya dejó
    // constancia de la elección del usuario por otro medio (el propio widget de
    // confirmación ya mostró "TU: Sí"), así que loguear aquí el label sería redundante.
    const itemFaq = BASE_CONOCIMIENTO.find(f => f.id === id);
    if (itemFaq) {
        if (!silencioso) log('TU', itemFaq.label);
        responderItem(itemFaq);
        return;
    }

    // Caso especial: 'guia' no tiene 'resp' propio, su flujo real es elegir destino
    // y mostrar la guía interactiva (igual que en el submenú, ver seleccionarCategoriaMenu).
    if (id === 'guia' && ITEMS_MENU.guia) {
        const item = ITEMS_MENU.guia;
        if (!silencioso) log('TU', `📘 ${item.label}`);
        estado = 'GUIA_DESTINO_UI';
        bloquearInputTexto();
        hablar('¿De qué destino te gustaría ver la guía interactiva?', () => mostrarSelectorDestinoGuia());
        return;
    }

    const itemExtra = ITEMS_MENU[id];
    if (itemExtra) {
        if (!silencioso) log('TU', itemExtra.label);
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
            if (!silencioso) log('TU', `▶️ ${categoria.flujoLabel || categoria.label}`);
            iniciarFlujoMenu(categoria);
            return;
        }

        // Para el resto de tipos ('flujo', 'accion', 'submenu') sí se delega en
        // seleccionarCategoriaMenu (ya hace su propio log('TU', ...)), que se comporta
        // igual que un click real en el menú.
        seleccionarCategoriaMenu(categoria, { silencioso });
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