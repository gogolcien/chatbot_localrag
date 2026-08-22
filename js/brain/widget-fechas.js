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

