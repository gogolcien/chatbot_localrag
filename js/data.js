// ================= BASE DE CONOCIMIENTO (FAQ) =================
// Cada item se muestra como botón en el menú de 2do nivel, agrupado por "categoria":
// 'cotizar_faq' (cuelga de "Cotizar precio de hoteles y circuitos") | 'guia_faq' (cuelga de "Guía para asesorar a tus clientes") | 'agentes' (cuelga de "Agentes")
// Nota: "tags" ya no se usa para comparar texto libre (esa lógica se quitó de cerebro()
// al pasar todo a navegación por botones). Se deja como referencia de qué cubre cada FAQ.
const BASE_CONOCIMIENTO = [
    {
        id: 'cuentas_deposito',
        categoria: 'agentes',
        label: '¿Dónde deposito mi pago?',
        tags: ['cuentas', 'depositar', 'banco', 'transferencia', 'donde deposito', 'subir mi pago'],
        resp: "Nuestras cuentas son en Santander y Banamex.,Deberá enviar comprobante de pago a tu agente especificando el folio de la reservación, así como el nombre del titular de la misma. El depósito o transferencia puede realizarlo en cualquiera de las cuentas a nombre de Corporation Travel S.A de C.V. que se listan a continuación",
        url: null,
        info: ` Deberá enviar comprobante de pago a tu agente especificando el folio de la reservación, así como el nombre del titular de la misma. El depósito o transferencia puede realizarlo en cualquiera de las cuentas a nombre de Corporation Travel S.A de C.V. que se listan a continuación:<br>
                Santander: 1234567890
                <br>
                Banamex: 0987654321    
            `
    },
    {
        id: 'comision',
        categoria: 'agentes',
        label: 'Comisión y porcentaje',
        tags: ['comisión', 'comision', 'porcentaje'],
        resp: "Tu porcentaje de comisión depende de tu nivel de agencia y el tipo de servicio. Consulta tu perfil para ver el tabulador vigente.",
        url: "https://agentes.imacop.com.mx/perfil"
    },
    {
        id: 'colores_descuento',
        categoria: 'agentes',
        label: 'Colores y descuentos',
        tags: ['colores', 'descuento', 'color'],
        resp: "Los colores indican la disponibilidad y el descuento especial aplicado. Verde es disponible inmediato, Amarillo requiere verificación.",
        url: null
    },
    {
        id: 'horarios',
        categoria: 'guia_faq',
        label: 'Horario de atención',
        tags: ['horarios imacop', 'hora imacop', 'abierto en imacop'],
        resp: "Nuestro horario de atención es de Lunes a Viernes de 9 de la mañana a 7 de la tarde, y sábados de 9 a 2.",
        url: null
    },
    {
        id: 'contacto_ventas',
        categoria: 'agentes',
        label: 'Contacto a ventas',
        tags: ['contacto a ventas', 'chicos de ventas', 'telefono de ventas', 'contacto a ventas'],
        resp: "Puedes contactar al equipo de ventas al teléfono 33-3333-3333 o por el chat de soporte.",
        url: null
    },
    {
        id: 'publicidad_whatsapp',
        categoria: 'agentes',
        label: 'Publicidad por WhatsApp',
        tags: ['publicidad por whatsapp', 'publicidad por celular', 'publicidad por mensaje'],
        resp: "Claro, para recibir publicidad por WhatsApp, por favor regístrate en el siguiente enlace.",
        url: "https://wa.me/5213333333333"
    },
    {
        id: 'amenidades',
        categoria: 'cotizar_faq',
        label: 'Amenidades del hotel',
        tags: ['donde consulto las amenidades', 'donde veo que incluye el hotel', 'donde consulto que incluye el hotel'],
        resp: "Las amenidades específicas aparecen en la ficha de cada hotel dentro de la plataforma al momento de cotizar.",
        url: null
    },
    {
        id: 'white_label',
        categoria: 'agentes',
        label: 'White Label / Mi marca',
        tags: ['white label', 'mi marca', 'actualizar mi logo'],
        resp: "Para actualizar tu White Label y que tus clientes vean tu logo, entra a la configuración de 'Mi Agente'.",
        url: "https://agentes.imacop.com.mx/whitelabel"
    },
    {
        id: 'cupon',
        categoria: 'agentes',
        label: 'Descargar cupón / voucher',
        tags: ['cupón', 'cupon', 'boucher', 'voucher'],
        resp: "Puedes descargar tu cupón desde la sección 'Mis Reservaciones'. Si tienes crédito, puedes descargarlo sin pagar inmediatamente.",
        url: "https://agentes.imacop.com.mx/reservaciones"
    },
    {
        id: 'estatus_reserva',
        categoria: 'cotizar_faq',
        label: 'Estatus de mi reserva',
        tags: ['estatus reserva', 'cambio de estatus'],
        resp: "El estatus de pago se actualiza automáticamente al subir tu comprobante. Si tarda más de 24 horas, contacta a cobranza.",
        url: null
    },
    {
        id: 'tarifas',
        categoria: 'agentes',
        label: 'Tarifas netas y públicas',
        tags: ['tarifa netas', 'tarifas publicas', 'ver tarifa'],
        resp: "En la plataforma puedes visualizar tanto tarifas netas para ti, como públicas para tu cliente, dependiendo de tu configuración.",
        url: null
    },
    {
        id: 'no_show',
        categoria: 'guia_faq',
        label: 'Política de No Show',
        tags: ['no show'],
        resp: "En caso de No Show, se aplican las políticas específicas del hotel. Generalmente se cobra la primera noche o el total dependiendo la temporada.",
        url: null
    },
    {
        id: 'cambio_nombre',
        categoria: 'agentes',
        label: 'Cambio de nombre / pasajero',
        tags: ['cambio de nombre', 'cambiar nombre', 'cambio de pasajero'],
        resp: "El cambio de nombre está sujeto a las políticas del operador o aerolínea. En hoteles suele ser posible antes de 72 horas.",
        url: null
    },
    {
        id: 'reembolso',
        categoria: 'guia_faq',
        label: 'Reembolsos y devoluciones',
        tags: ['reembolso', 'devolución'],
        resp: "Los tiempos de reembolso varían de 15 a 45 días hábiles dependiendo del proveedor final.",
        url: null
    },
    {
        id: 'grupos',
        categoria: 'cotizar_faq',
        label: 'Cotización de grupos',
        tags: ['grupo', 'grupales'],
        resp: "Para cotizar grupos (más de 10 habitaciones), por favor usa el módulo de 'Cotización Grupal' para obtener tarifas preferenciales.",
        url: "https://agentes.imacop.com.mx/grupos"
    },
    {
        id: 'visa_documentacion',
        categoria: 'guia_faq',
        label: 'Visa y documentación',
        tags: ['visa', 'pasaporte', 'documentación'],
        resp: "Nosotros te asesoramos, pero el trámite de visados y pasaportes es responsabilidad directa del pasajero.",
        url: null
    },
    {
        id: 'seguro',
        categoria: 'guia_faq',
        label: 'Seguro de viajero',
        tags: ['seguro', 'aseguradora'],
        resp: "Nuestros paquetes pueden incluir seguro de viajero si lo seleccionas al momento de reservar. Te recomendamos siempre ofrecerlo.",
        url: null
    }
];

// ================= ITEMS DE ACCIÓN FIJA (respuesta + link, sin flujo de varios pasos) =================
// Misma forma que un item de BASE_CONOCIMIENTO (resp/url/info), pero no dependen de
// coincidencia de tags: se disparan directo por botón o por las palabras clave de cerebro().
const ITEMS_MENU = {
    facturacion: {
        id: 'facturacion',
        label: 'Facturación',
        resp: "Perfecto. Aquí tienes el acceso a nuestro portal de facturación electrónica,Recuerda que solo se puede facturar el mes en curso. Te recomendamos hacerlo a tiempo.",
        url: "https://facturacion.imacoponline.com/index.php",
        info: "Recuerda que solo se puede facturar el mes en curso. Te recomendamos hacerlo a tiempo."
    },
    capacitacion: {
        id: 'capacitacion',
        label: 'Capacitación',
        resp: "Entendido, excelente elección. Te redirigiré a nuestro portal de capacitación, donde podrás mantenerte actualizado y fortalecer tus conocimientos como agente de viajes.",
        url: "https://agentes.imacop.com.mx/backoffice/imacop/capacitaciones",
        info: "Entendido, excelente elección. Te redirigiré a nuestro portal de capacitación, donde podrás mantenerte actualizado y fortalecer tus conocimientos como agente de viajes."
    },
    guia: {
        id: 'guia',
        label: 'Guía interactiva de hoteles',
        resp: "Excelente elección. Te dejo el acceso a nuestra guía interactiva de hoteles, Consulta destinos, hoteles, habitaciones e instalaciones para asesorar mejor a tus clientes.",
        url: "https://guiainteractivadehoteles.com",
        info: "Consulta destinos, hoteles, habitaciones e instalaciones para asesorar mejor a tus clientes."
    },
    publicidad: {
        id: 'publicidad',
        label: 'Publicidad para tus clientes',
        resp: "Excelente decisión. Ya tengo listo el acceso a nuestra sección de publicidad, Aquí encontrarás un banco de promociones actualizadas que puedes descargar, personalizar con el logotipo de tu agencia y compartir libremente con tus clientes.",
        url: "https://agentes.imacop.com.mx/backoffice/imacop/publicidad",
        info: "Aquí encontrarás un banco de promociones actualizadas que puedes descargar, personalizar con el logotipo de tu agencia y compartir libremente con tus clientes."
    },
    alta_usuarios: {
        id: 'alta_usuarios',
        label: 'Alta de Usuarios',
        resp: "Para dar de alta usuarios, dirígete a Mundo Imacop, selecciona Mi Agente, y en el menú lateral izquierdo selecciona Tu Publicidad.",
        url: "https://agentes.imacop.com.mx/backoffice",
        info: "<b>Pasos para alta de Usuarios:</b><br>1. Ir a 'tu BackOffice : https://reservas.arenia.mx/backoffice'.<br>2. Menu lateral: Seleccionar 'Usuarios por Agencia'.<br>3. Menú superior: 'presionar el boton con simbolo de + <br> Llenar formulario: con los datos del nuevo Usuario'."
    }
};

// ================= MENÚ PRINCIPAL (primer nivel de botones) =================
// Estructura conforme a Menu.pdf (5 categorías). tipo:
//   'flujo'         -> inicia una conversación de varios pasos (cotizar, pago)
//   'accion'        -> respuesta fija + link, viene de ITEMS_MENU
//   'submenu'       -> segundo nivel de botones: FAQ de BASE_CONOCIMIENTO con esa "categoria",
//                      mas opcionalmente items fijos de ITEMS_MENU listados en "extra",
//                      mas un botón final de texto libre si "libre" es true.
//   'submenu_flujo' -> como 'submenu', pero el primer botón ("flujoLabel") no responde una
//                      FAQ: inicia el mismo flujo de varios pasos que antes tenía "flujo"
//                      (usado por "Cotizar precio de hoteles y circuitos", que ahora también
//                      agrupa FAQs relacionadas como Amenidades, Estatus de reserva, etc.)
const MENU_PRINCIPAL = [
    { id: 'pagos', icono: '💳', label: 'Subir pagos', tipo: 'flujo', flujo: 'PAGO', mensaje: 'Dime el GDL o localizador.' },
    { id: 'facturacion', icono: '📄', label: 'Facturación', tipo: 'accion', item: 'facturacion' },
    { id: 'cotizar', icono: '🏨', label: 'Cotizar precio de hoteles y circuitos', tipo: 'submenu_flujo', flujo: 'DESTINO', mensaje: '¿A qué destino viajan?', flujoLabel: 'Cotizar ahora', categoria: 'cotizar_faq' },
    { id: 'guia', icono: '📘', label: 'Guía para asesorar a tus clientes', tipo: 'submenu', categoria: 'guia_faq', extra: ['guia', 'publicidad'] },
    { id: 'agentes', icono: '🧑\u200d💼', label: 'Agentes', tipo: 'submenu', categoria: 'agentes', extra: ['alta_usuarios', 'capacitacion', 'guia'] }
];

// ================= AGENTES =================
const AGENTES = {
    ian: {
        nombre: 'Ian',
        genero: 'masculino',
        voz: 'male',
        avatar: {
            neutral: './assets/IAN.gif',
            hablar: './assets/IAN.gif',
            pensar: './assets/IAN.gif',
            exito: './assets/IAN.gif'
        }
    },
    mia: {
        nombre: 'Mia',
        genero: 'femenino',
        voz: 'female',
        avatar: {
            neutral: './assets/MIA.gif',
            hablar: './assets/MIA.gif',
            pensar: './assets/MIA.gif',
            exito: './assets/MIA.gif'
        }
    }
};

// ================= REUTILIZABLE DESDE EL BACKEND (Node) =================
// En el navegador esto no se ejecuta (no existe "module"), así que no cambia
// nada del comportamiento actual del frontend. Permite que el backend arme la
// lista de opciones del menú (para sugerírselas al usuario) sin duplicar esta
// información en dos archivos que se puedan desincronizar.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BASE_CONOCIMIENTO, ITEMS_MENU, MENU_PRINCIPAL, AGENTES };
}