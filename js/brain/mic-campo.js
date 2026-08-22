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

