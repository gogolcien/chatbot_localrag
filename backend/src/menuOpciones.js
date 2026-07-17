const path = require('path');
const { BASE_CONOCIMIENTO, ITEMS_MENU, MENU_PRINCIPAL } = require(path.join(__dirname, '..', '..', 'js', 'data.js'));
const ollama = require('./ollama');

/**
 * Construye la lista plana de las opciones "hoja" del menú (las que ya
 * tienen una respuesta instantánea y curada, sin pasar por el modelo de IA):
 * los items de acción directa ('accion'), el botón que inicia cada flujo
 * ('flujo' y el botón inicial de 'submenu_flujo'), y las FAQs/extras que
 * cuelgan de cada 'submenu' o 'submenu_flujo'.
 *
 * Cada opción incluye "ruta": la numeración exacta tal como la ve el usuario
 * en el menú (ej. `5.- Agentes" -> "1.- Comisión y porcentaje`), para
 * poder decirle con precisión dónde hacer clic. El orden replica a propósito
 * el mismo que arma seleccionarCategoriaMenu() en brain.js (el botón de
 * flujo, si existe, va primero; luego los "extra" de ITEMS_MENU; luego las
 * FAQs de BASE_CONOCIMIENTO), para que el número nunca quede desfasado del
 * botón real.
 * @returns {{id: string, label: string, ruta: string, textoBusqueda: string}[]}
 */
function construirOpcionesMenu() {
    const opciones = [];

    MENU_PRINCIPAL.forEach((cat, i) => {
        const numTop = i + 1;

        if (cat.tipo === 'accion') {
            const item = ITEMS_MENU[cat.item];
            if (item) {
                opciones.push({
                    id: item.id,
                    label: item.label,
                    ruta: `${numTop}.- ${cat.label}`,
                    textoBusqueda: item.label
                });
            }
        } else if (cat.tipo === 'flujo') {
            opciones.push({
                id: cat.id,
                label: cat.label,
                ruta: `${numTop}.- ${cat.label}`,
                textoBusqueda: `${cat.label}. ${cat.mensaje || ''}`
            });
        } else if (cat.tipo === 'submenu' || cat.tipo === 'submenu_flujo') {
            // Mismo orden que ve el usuario: en 'submenu_flujo' el botón que inicia el
            // flujo va primero, luego los extras, luego las FAQs.
            const flujoBtn = cat.tipo === 'submenu_flujo'
                ? [{ id: cat.id, label: cat.flujoLabel || cat.label, textoBusqueda: `${cat.flujoLabel || cat.label}. ${cat.mensaje || ''}` }]
                : [];

            const extras = (cat.extra || [])
                .map(key => ITEMS_MENU[key])
                .filter(Boolean)
                .map(item => ({ id: item.id, label: item.label, textoBusqueda: item.label }));

            const faqs = BASE_CONOCIMIENTO
                .filter(f => f.categoria === cat.categoria)
                .map(f => ({ id: f.id, label: f.label, textoBusqueda: `${f.label}. ${(f.tags || []).join(', ')}` }));

            flujoBtn.concat(extras).concat(faqs).forEach((sub, j) => {
                const numSub = j + 1;
                opciones.push({
                    id: sub.id,
                    label: sub.label,
                    ruta: `${numTop}.- ${cat.label} -> ${numSub}.- ${sub.label}`,
                    textoBusqueda: sub.textoBusqueda
                });
            });
        }
    });

    return opciones;
}

// Las embeddings de estas 24 opciones no cambian mientras el servidor esté
// corriendo (solo cambian si editas js/data.js y reinicias), así que se
// calculan una sola vez y se reutilizan en cada request de chat.
let opcionesConEmbeddingPromise = null;

async function obtenerOpcionesMenuConEmbedding() {
    if (!opcionesConEmbeddingPromise) {
        opcionesConEmbeddingPromise = (async () => {
            const opciones = construirOpcionesMenu();
            const conEmbedding = [];
            for (const opcion of opciones) {
                const embedding = await ollama.generarEmbedding(opcion.textoBusqueda);
                conEmbedding.push({ ...opcion, embedding });
            }
            console.log(`[menuOpciones] Embeddings calculados para ${conEmbedding.length} opciones del menú.`);
            return conEmbedding;
        })().catch(err => {
            // Si falla (p.ej. Ollama no está corriendo todavía), no dejamos la promesa
            // "envenenada": la próxima consulta de chat vuelve a intentarlo.
            opcionesConEmbeddingPromise = null;
            throw err;
        });
    }
    return opcionesConEmbeddingPromise;
}

module.exports = { construirOpcionesMenu, obtenerOpcionesMenuConEmbedding };
