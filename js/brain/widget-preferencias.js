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

