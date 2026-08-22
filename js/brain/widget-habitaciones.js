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

