// Textos legales en español (idioma base). Mantener en/pt con el mismo contenido.
import type { LegalDocs } from './index';

const MAIL = '[gastos@cabrasky.net](mailto:gastos@cabrasky.net)';

const es: LegalDocs = {
  privacidad: {
    title: 'Política de privacidad',
    intro: 'Peculio es un proyecto personal y gratuito para llevar tus gastos. Aquí se explica qué datos guarda, para qué, con quién se comparten y cómo puedes borrarlos. En resumen: tus datos solo se usan para que la app funcione. No hay publicidad, ni analítica, ni venta de datos, y puedes eliminar tu cuenta con todo su contenido cuando quieras.',
    sections: [
      { h: 'Responsable', p: [[
        '**Responsable del tratamiento:** Javier Mateos.',
        `**Contacto:** ${MAIL}.`,
        '**Dónde están tus datos:** en un servidor administrado por el propio responsable, en España (Unión Europea).',
      ]] },
      { h: 'Qué datos guardamos', p: [[
        '**Datos de tu cuenta:** nombre y email. La contraseña se guarda solo como hash bcrypt, nunca en claro. También la foto de perfil, si pones una dirección, y tu identificador de Google, si entras con Google.',
        '**Preferencias:** idioma, tema y presupuesto semanal.',
        '**Lo que anotas en la app:** gastos (importe, fecha, descripción, categoría, método de pago…), fotos de tickets que subas, ingresos, metas de ahorro, suscripciones, proyectos y categorías propias.',
        '**Personas con las que compartes gastos:** los nombres que escribas y lo que te deben o te han devuelto.',
        '**Claves de API** del modo desarrollador: se guarda solo su huella (hash), no la clave.',
        '**Consultas de soporte:** lo que escribes al soporte y las respuestas que recibes.',
        '**Datos técnicos:** dirección IP, fecha y ruta de cada petición, en los registros del servidor, para la seguridad y para resolver errores.',
      ], 'No pedimos datos bancarios ni nos conectamos a tu banco.'] },
      { h: 'Para qué y con qué base legal', p: [[
        '**Darte el servicio:** crear tu cuenta, guardar y sincronizar tus datos entre la web y la app, y enviarte el email para recuperar la contraseña. Es necesario para cumplir los [Términos de uso](/legal/terminos) que aceptas al registrarte (art. 6.1.b del RGPD).',
        '**Atender el soporte:** responder a tus consultas en la app y por email (art. 6.1.b del RGPD).',
        '**Seguridad y funcionamiento:** guardar registros técnicos, detectar errores y evitar abusos, por interés legítimo en mantener el servicio seguro (art. 6.1.f del RGPD).',
      ], 'No usamos tus datos para publicidad ni para hacer perfiles. No hay analítica ni seguimiento, y no se venden ni se ceden a nadie.'] },
      { h: 'Con quién se comparten', p: [
        'Solo en estos casos, y solo si usas la función correspondiente:',
        [
          '**Google**, si eliges «Continuar con Google»: Google te identifica y nos devuelve tu nombre, email y foto. Google LLC puede tratar datos en EE. UU. al amparo del Marco de Privacidad de Datos UE-EE. UU.; además se aplica la [política de privacidad de Google](https://policies.google.com/privacy).',
          '**Cuentas Claras** (cuentas-claras.cabrasky.net), si envías allí un gasto compartido: se envían el título, la fecha, los importes, los nombres de las personas del reparto y tu email. Es un servicio del mismo responsable, y lo que envíes se gestiona en esa app.',
          '**Correo:** los emails de recuperación de contraseña y las respuestas del soporte salen de un servidor de correo propio (mail.cabrasky.net).',
        ],
        'La web no carga recursos de terceros: las fuentes y demás archivos se sirven desde nuestro propio servidor. Solo se darían datos a una autoridad si una ley lo exigiera.',
      ] },
      { h: 'Qué ve el administrador', p: [
        'El panel de administración muestra los datos de tu cuenta (nombre, email, fechas de alta y de último acceso, cómo entras y si usas la app móvil), **cuántos** registros tienes y tus consultas de soporte, para mantener el servicio y atenderte. No muestra el contenido de tus gastos, ingresos ni del resto de registros.',
        'El administrador puede suspender o eliminar una cuenta que incumpla los [Términos de uso](/legal/terminos), y enviarte el enlace para restablecer la contraseña si se lo pides.',
      ] },
      { h: 'Datos de otras personas', p: [
        'Si anotas nombres de otras personas en gastos compartidos, hazlo con su conocimiento y limítate a lo necesario: basta un nombre o un apodo. Esos datos solo se usan dentro de tu cuenta.',
      ] },
      { h: 'Cuánto tiempo los guardamos', p: [[
        'Tus datos se conservan mientras tengas la cuenta.',
        'Si **eliminas la cuenta**, se borran al momento de la base de datos: la cuenta, los gastos, las fotos, los ingresos, las metas, las suscripciones, los proyectos, las categorías y las claves de API. Las copias de seguridad se renuevan automáticamente, y los datos borrados desaparecen de ellas en **30 días como máximo**.',
        'Las consultas de soporte se guardan mientras tengas la cuenta y se borran al eliminarla.',
        'Los registros técnicos del servidor se borran a los **14 días**, y los errores del servidor (ruta, tipo de error e identificador, sin el contenido de tus datos) a los 30 días.',
      ]] },
      { h: 'Tus derechos', p: [
        'Tienes derecho de **acceso, rectificación, supresión, oposición, limitación y portabilidad**. Puedes ejercerlos así:',
        [
          'Desde la app o la web: en **Configuración** puedes editar tus datos, exportar tus gastos (CSV o Excel) y **eliminar tu cuenta** con todos sus datos. Tienes los pasos en [Eliminar tu cuenta](/legal/eliminar-cuenta).',
          `Por email a ${MAIL}, para cualquier otra petición.`,
        ],
        'Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos ([aepd.es](https://www.aepd.es)).',
      ] },
      { h: 'Seguridad', p: [
        'Las conexiones van cifradas (HTTPS), las contraseñas se guardan con hash y el acceso al servidor está restringido. Ningún sistema es infalible, así que usa una contraseña que no uses en otros sitios.',
      ] },
      { h: 'App móvil', p: [
        'La app de Android guarda en tu móvil una copia de tus datos para funcionar sin conexión, y sincroniza los cambios cuando vuelve la red. Esa copia se borra al cerrar sesión o al eliminar la cuenta. La app se instala desde Google Play, que se encarga de actualizarla, o desde esta web: en ese caso consulta aquí si hay versiones nuevas.',
      ] },
      { h: 'Cuenta demo', p: [
        'La demo de la [portada](/) es una cuenta pública de ejemplo y de solo lectura: no guarda datos de quien la prueba. El idioma o el tema que elijas en ella se quedan solo en tu navegador.',
      ] },
      { h: 'Menores', p: ['Peculio no está dirigido a menores de 14 años.'] },
      { h: 'Cambios', p: ['Si esta política cambia, la nueva versión se publicará aquí con la fecha actualizada.'] },
    ],
  },

  cookies: {
    title: 'Política de cookies',
    intro: 'Peculio no usa cookies de publicidad, ni de analítica, ni de terceros. Solo guarda en tu navegador lo imprescindible para que la app funcione y recuerde tus preferencias. Por eso no necesita pedirte consentimiento ni mostrar un aviso de cookies.',
    sections: [
      { h: 'Qué son', p: [
        'Las cookies y el almacenamiento local son pequeños datos que una web guarda en tu navegador para recordarlos en la siguiente visita.',
      ] },
      { h: 'Cookies que usamos', p: [
        'Todas son propias y duran 1 año:',
        [
          '**mb_locale**: el idioma elegido.',
          '**mb_theme**: el tema (sistema, claro u oscuro).',
          '**mb_weekly_goal**: el presupuesto semanal que se usa en el resumen.',
        ],
      ] },
      { h: 'Almacenamiento local', p: [
        'Con la sesión iniciada también se usa el almacenamiento local del navegador. No son cookies y no se envían solas al servidor:',
        [
          '**gastos_token**: tu sesión, para que no tengas que entrar en cada visita. Dura hasta que cierres sesión.',
          '**gastos_user**: tu nombre y tus preferencias, para mostrarlos nada más abrir. Dura hasta que cierres sesión.',
          '**gastos_app_data**: una copia de tus datos para que la app cargue rápido. Se borra al cerrar sesión o al eliminar la cuenta.',
        ],
        'Las claves de versiones anteriores (gastos_locale, gastos_dark, gastos_goal y gastos_layout_pin) se borran solas al abrir la web.',
      ] },
      { h: 'Por qué no hay aviso de cookies', p: [
        'Todas son técnicas o de personalización elegida por ti, y sirven para darte el servicio que pides. Por eso están exentas de consentimiento (art. 22.2 de la LSSI y guía sobre cookies de la AEPD). No hay cookies de terceros: ni analítica, ni publicidad, ni redes sociales. Las fuentes se sirven desde nuestro propio servidor.',
        'Si entras con Google, la página de inicio de sesión es de Google y usa sus propias cookies, según su política.',
      ] },
      { h: 'Cómo borrarlas', p: [
        'Al cerrar sesión se borran la sesión y la copia de tus datos. Para borrar también las preferencias, elimina las cookies y los datos del sitio en la configuración de tu navegador. La app seguirá funcionando, pero tendrás que volver a entrar y a elegir tus preferencias.',
      ] },
    ],
  },

  'aviso-legal': {
    title: 'Aviso legal',
    intro: 'Estos son los datos del titular de este sitio web, según el artículo 10 de la Ley 34/2002 de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI).',
    sections: [
      { h: 'Titular', p: [[
        '**Titular:** Javier Mateos.',
        `**Contacto:** ${MAIL}.`,
        '**Sitio web:** peculio.cabrasky.net.',
        '**Actividad:** proyecto personal, gratuito y sin ánimo de lucro para controlar los gastos personales. No tiene actividad comercial ni publicidad.',
      ]] },
      { h: 'Uso del sitio', p: [
        'Usar la web y la app implica aceptar este aviso y los [Términos de uso](/legal/terminos). El tratamiento de los datos se explica en la [Política de privacidad](/legal/privacidad) y el uso de cookies en la [Política de cookies](/legal/cookies).',
      ] },
      { h: 'Propiedad intelectual', p: [
        'El diseño, los textos, el logotipo y el código de Peculio pertenecen a su titular, salvo los componentes de código abierto, que mantienen sus propias licencias. Tus datos son tuyos: puedes exportarlos y eliminarlos cuando quieras.',
      ] },
      { h: 'Responsabilidad', p: [
        'Peculio sirve para organizar tus finanzas personales, pero no es asesoramiento financiero, fiscal ni contable. El titular procura que funcione bien y sin interrupciones, pero no garantiza que no haya errores. En la medida en que la ley lo permita, no responde de las decisiones que tomes con la información de la app ni de los daños causados por fallos técnicos.',
      ] },
      { h: 'Enlaces', p: [
        'Los enlaces a sitios de terceros, como Google o la AEPD, se ofrecen por comodidad; el titular no controla su contenido.',
      ] },
      { h: 'Ley aplicable', p: [
        'Este aviso se rige por la ley española. Si eres consumidor, puedes acudir a los juzgados de tu domicilio.',
      ] },
    ],
  },

  terminos: {
    title: 'Términos de uso',
    intro: `Estas condiciones regulan el uso de Peculio, tanto la web como la app de Android. Al crear una cuenta las aceptas. Son cortas a propósito; si algo no queda claro, escribe a ${MAIL}.`,
    sections: [
      { h: 'El servicio', p: [
        'Peculio te permite anotar gastos, ingresos, metas, suscripciones y proyectos, compartir gastos y ver estadísticas. Es gratuito, no tiene publicidad y se ofrece «tal cual». Puede cambiar o mejorar y, avisando con tiempo razonable, podría dejar de ofrecerse.',
      ] },
      { h: 'Tu cuenta', p: [[
        'Necesitas tener 14 años o más.',
        'Usa un email válido y una contraseña segura. Eres responsable de lo que se haga con tu cuenta.',
        'Puedes darte de baja cuando quieras en **Configuración → Eliminar cuenta**: se borran tu cuenta y todos tus datos.',
      ]] },
      { h: 'Uso correcto', p: [
        'No uses Peculio para nada ilegal. No intentes acceder a datos de otros usuarios, no ataques ni sobrecargues el servicio y no abuses de la API. Si anotas nombres de otras personas, hazlo con su conocimiento. El titular puede suspender las cuentas que incumplan estas normas.',
      ] },
      { h: 'Tus datos', p: [
        'El contenido que introduces es tuyo. El titular solo lo usa para darte el servicio, como explica la [Política de privacidad](/legal/privacidad). Puedes exportarlo en CSV o Excel.',
      ] },
      { h: 'Cuenta demo', p: [
        'La demo es una cuenta pública de solo lectura con datos de ejemplo, que se renuevan cada día. No se puede modificar ni eliminar.',
      ] },
      { h: 'Sin garantías', p: [
        'La información de la app es orientativa, depende de lo que anotes y no es asesoramiento financiero. Se procura que todo funcione, pero puede haber errores, pérdidas de datos o interrupciones, así que exporta tus datos de vez en cuando. En la medida en que la ley lo permita, el titular no responde de los daños indirectos que cause el uso de la app.',
      ] },
      { h: 'Cambios', p: [
        'Si estos términos cambian, la nueva versión se publicará aquí con su fecha. Si sigues usando la app después, se entiende que aceptas los cambios. Si no estás de acuerdo, puedes eliminar tu cuenta.',
      ] },
      { h: 'Ley aplicable', p: [
        'Estos términos se rigen por la ley española. Si eres consumidor, puedes acudir a los juzgados de tu domicilio.',
      ] },
    ],
  },

  'eliminar-cuenta': {
    title: 'Eliminar tu cuenta',
    intro: 'Cómo eliminar tu cuenta de **Peculio** (la app de Android y la web peculio.cabrasky.net, de Javier Mateos) con todos sus datos, qué se borra y qué se conserva durante un tiempo. No hace falta tener la app instalada: también puedes hacerlo desde la web o por email.',
    sections: [
      { h: 'Desde la app de Android', p: [[
        'Abre **Más → Configuración**.',
        'Baja hasta **Eliminar cuenta** y escribe tu email para confirmar.',
        'Pulsa **Eliminar mi cuenta y mis datos**.',
      ]] },
      { h: 'Desde la web', p: [[
        'Entra en [peculio.cabrasky.net](/login) con tu cuenta.',
        'Abre **Configuración**: en el ordenador, pulsando tu nombre en el menú lateral; en el móvil, desde **Más**.',
        'En **Eliminar cuenta**, pulsa **Eliminar mi cuenta**, escribe tu email y confirma con **Eliminar mi cuenta y mis datos**.',
      ], 'Si no recuerdas la contraseña, puedes [restablecerla](/forgot-password). Si entras con Google, usa «Continuar con Google».'] },
      { h: 'Si no puedes entrar', p: [
        `Escribe a ${MAIL} desde el email de tu cuenta y pide que la eliminemos. Lo haremos en un plazo máximo de 30 días y te lo confirmaremos por email.`,
      ] },
      { h: 'Qué se borra', p: [
        'Al momento, y sin posibilidad de recuperarlo, se borra de la base de datos:',
        [
          'Tu cuenta: nombre, email, contraseña (su hash), foto de perfil, identificador de Google y preferencias.',
          'Gastos, fotos de tickets, ingresos, metas de ahorro, suscripciones, proyectos, categorías y personas con las que compartes gastos.',
          'Claves de API y consultas de soporte.',
        ],
        'La copia de tus datos que guarda la app en el móvil también se borra al eliminar la cuenta.',
      ] },
      { h: 'Qué se conserva y cuánto tiempo', p: [[
        '**Copias de seguridad:** los datos borrados desaparecen de ellas en **30 días como máximo**, al renovarse.',
        '**Registros técnicos del servidor** (dirección IP, fecha y ruta de cada petición): se borran a los **14 días**.',
        '**Errores del servidor:** se borran a los **30 días**. Solo guardan la ruta, el tipo de error y un identificador, sin datos tuyos.',
        '**Cuentas Claras:** los repartos que hayas enviado a Cuentas Claras se gestionan en esa app y no se borran con tu cuenta de Peculio.',
      ], 'No se guarda nada más, ni para otros fines.'] },
      { h: 'Borrar datos sin eliminar la cuenta', p: [
        'Desde la app o la web puedes borrar cuando quieras cualquier gasto, foto de ticket, ingreso, meta, suscripción, proyecto o categoría, y revocar tus claves de API. Se borran al momento, y de las copias de seguridad en 30 días como máximo.',
        `Para borrar cualquier otro dato, como tus consultas de soporte, escribe a ${MAIL}.`,
      ] },
    ],
  },
};

export default es;
