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

