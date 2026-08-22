const config = require('./config');

/**
 * Capa 1: corrección léxica ligera de errores gramaticales/ortográficos pequeños,
 * ANTES de generar el embedding. Es determinista y local (no llama a Ollama):
 * compara cada palabra de la pregunta contra un vocabulario de dominio construido
 * a partir de preguntas ya aprobadas y de las opciones del menú, y la corrige si
 * hay una palabra muy parecida (distancia de edición chica) en ese vocabulario.
 *
 * Deliberadamente NO se usa el LLM para esto: una corrección "inteligente" podría
 * cambiar el sentido de la pregunta antes de buscarla en caché; esta es literal
 * y solo actúa cuando la distancia de edición es muy pequeña.
 */

/**
 * Distancia de Levenshtein clásica (inserción/borrado/sustitución).
 * Implementación propia para no sumar una dependencia externa solo por esto.
 */
function levenshtein(a, b) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;

    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;

    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        for (let j = 1; j <= lb; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,        // borrado
                curr[j - 1] + 1,    // inserción
                prev[j - 1] + costo // sustitución
            );
        }
        [prev, curr] = [curr, prev];
    }
    return prev[lb];
}

/**
 * Similitud léxica normalizada entre 0 y 1 (1 = idéntico), basada en Levenshtein.
 * Se usa como señal complementaria al coseno del embedding (ver similarity.js).
 */
function similitudLexica(a, b) {
    const maxLen = Math.max(String(a || '').length, String(b || '').length, 1);
    return 1 - levenshtein(String(a || ''), String(b || '')) / maxLen;
}

/**
 * Construye el set de palabras "válidas" del dominio a partir de preguntas ya
 * aprobadas y de las opciones del menú (label/textoBusqueda). Se recalcula en
 * cada request en chat.js; es barato de construir y así siempre refleja el
 * contenido más reciente del panel de revisión sin necesitar invalidar cache.
 * @param {object[]} aprobadas - filas de la tabla "aprobadas" (con pregunta_normalizada)
 * @param {object[]} opcionesMenu - opciones del menú (con textoBusqueda/label)
 * @returns {Set<string>}
 */
function construirVocabulario(aprobadas = [], opcionesMenu = []) {
    const vocab = new Set();

    const agregarTexto = (texto) => {
        String(texto || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter(p => p.length >= config.spellfixMinLongitudPalabra)
            .forEach(p => vocab.add(p));
    };

    aprobadas.forEach(a => agregarTexto(a.pregunta_normalizada || a.pregunta));
    opcionesMenu.forEach(op => {
        agregarTexto(op.label);
        agregarTexto(op.textoBusqueda);
    });

    return vocab;
}

// Mínimo para intentar corregir una palabra de la PREGUNTA (distinto del mínimo
// para que una palabra del VOCABULARIO cuente como candidata válida, ese sigue
// siendo config.spellfixMinLongitudPalabra). 3 en vez de 4: evita tocar
// palabras de función tipo "de"/"un"/"ya" (1-2 letras) pero sí evalúa palabras
// cortas de contenido como "gia" (typo de "guía"), que son justo el caso más
// sensible a un error de una sola letra.
const MIN_LONGITUD_A_EVALUAR = 3;

/**
 * Corrige, palabra por palabra, un texto ya normalizado (ver normalizar() en
 * similarity.js) contra el vocabulario de dominio. Solo corrige si:
 *  - la palabra no está ya en el vocabulario (no toca lo que ya es válido)
 *  - mide al menos MIN_LONGITUD_A_EVALUAR caracteres (evita falsos positivos
 *    en palabras de función como "de", "un", "ya", donde la distancia de
 *    edición casi no dice nada)
 *  - existe una palabra del vocabulario a una distancia de edición aceptable;
 *    en palabras cortas (3-4 letras) solo se acepta distancia 1 (un error de
 *    una sola letra cambia mucho el significado de una palabra tan corta);
 *    en palabras de 5+ letras se permite hasta SPELLFIX_MAX_DISTANCE (2 por
 *    defecto). Si hay varias candidatas, toma la más cercana.
 * @param {string} textoNormalizado
 * @param {Set<string>} vocabulario
 * @returns {string}
 */
function corregirTexto(textoNormalizado, vocabulario) {
    if (!vocabulario || vocabulario.size === 0) return textoNormalizado;

    return String(textoNormalizado || '')
        .split(' ')
        .map(palabra => {
            if (palabra.length < MIN_LONGITUD_A_EVALUAR) return palabra;
            if (vocabulario.has(palabra)) return palabra;

            const distanciaPermitida = palabra.length <= 4
                ? Math.min(1, config.spellfixMaxDistancia)
                : config.spellfixMaxDistancia;

            let mejor = null;
            let mejorDist = Infinity;
            for (const candidata of vocabulario) {
                // corte barato antes de calcular Levenshtein: si la diferencia de
                // longitud ya supera la distancia máxima permitida, ni se compara
                if (Math.abs(candidata.length - palabra.length) > distanciaPermitida) continue;
                const d = levenshtein(palabra, candidata);
                if (d < mejorDist) { mejorDist = d; mejor = candidata; }
                if (mejorDist === 1) break; // ya no se puede mejorar mucho más que esto
            }
            return (mejor && mejorDist <= distanciaPermitida) ? mejor : palabra;
        })
        .join(' ');
}

module.exports = { levenshtein, similitudLexica, construirVocabulario, corregirTexto };