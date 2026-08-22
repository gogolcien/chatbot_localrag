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

