// ================= CARGA DE DATOS (JSON) =================
window.onload = function () {

    fetch(`${BACKEND_URL}/api/destinos`)
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

        // Si el usuario ya había elegido agente mientras se cargaban los destinos,
        // arrancamos el chat automáticamente ahora que ya están listos.
        if (AUTO_INICIAR_PENDIENTE) {
            AUTO_INICIAR_PENDIENTE = false;
            iniciar();
        }
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

