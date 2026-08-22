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

