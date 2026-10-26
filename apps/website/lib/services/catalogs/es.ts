/**
 * [INPUT]: ServiceCatalog, publication-stage content and verified hosted AI provider/storage boundaries.
 * [OUTPUT]: Localized service, billing and policy copy.
 * [POS]: lib/services/catalogs; interpolated by the shared catalog loader.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ServiceCatalog } from '../types'

export default {
  "mobile": {
    "q": "¿Hay una app para iPhone?",
    "a": "Todavía no. macOS 1.10.0 es compatible con Apple Silicon y macOS 14 o posterior. La descarga para Windows 11 x64 sigue siendo el cliente gratuito anterior 1.9.10, sin compras de Plus. Aquí no hay compras para iPhone ni descarga de App Store. Copia el enlace en el teléfono y ábrelo en el ordenador."
  },
  "navPricing": "Precios",
  "meta": {
    "title": "Precios de Goalloom — herramientas locales gratis y Plus opcional",
    "description": "Tareas locales, historial, copias y BYOK gratis. Goalloom Plus añade sincronización cifrada e IA integrada en macOS, con una prueba opcional de ocho días por cuenta."
  },
  "heading": "Tus herramientas locales siguen gratis.",
  "intro": "Elige servicios en la nube cuando te ayuden. Tus tareas, historial y copias pueden quedarse en tu dispositivo.",
  "eyebrow": "Local gratis · Nube opcional",
  "free": "Free",
  "plus": "Plus",
  "local": "Sin cuenta para el uso local",
  "comingSoon": "Próximamente",
  "availability": "Consultar disponibilidad",
  "download": "Descargar gratis",
  "details": "Ver planes",
  "billingCycle": "Ciclo de facturación",
  "monthly": "Mensual",
  "yearly": "Anual",
  "perMonth": "/ mes",
  "perYear": "/ año",
  "annualCharge": "Un cobro de {annual} cada año; no es un cargo mensual.",
  "freeFeatures": [
    "Tareas, metas e historial locales",
    "Copias, importación y exportación locales",
    "Tu propia clave de proveedor de IA (BYOK)",
    "Sin compra ni cuenta para trabajar localmente"
  ],
  "plusFeatures": [
    "Sincronización cifrada e IA integrada en un plan",
    "Una prueba por cuenta compartida entre dispositivos",
    "Uso local y BYOK disponibles tras el vencimiento",
    "Uso razonable y protección; sin paquetes de créditos"
  ],
  "homePricing": {
    "title": "Sincronización de pago, cuando la necesites.",
    "body": "Las funciones locales siguen gratis. Plus añade sincronización cifrada de extremo a extremo e IA integrada.",
    "freeDescription": "Organiza cada día desde tu propio dispositivo.",
    "freePeriod": "Gratis siempre",
    "freeBilling": "Sin cuenta ni suscripción",
    "freeIncludes": "Tu espacio local completo",
    "freeFeatures": [
      "Tableros de objetivos y líneas de relación",
      "Uso sin conexión y datos locales",
      "Copias locales, importación y exportación",
      "Usa tu propia clave API de IA"
    ],
    "byokInfoLabel": "Sobre los costes del proveedor del modelo",
    "byokNote": "El proveedor del modelo cobra por separado.",
    "annualSavings": "Ahorra {amount} al año (≈ {percent})",
    "tryNow": "Cómo iniciar la prueba",
    "plusIncludes": "Todo lo de Free, más",
    "plusFeatures": [
      {
        "title": "Sincronización cifrada de extremo a extremo",
        "description": "Sincroniza objetivos y tareas entre dispositivos.",
        "id": "sync"
      },
      {
        "title": "IA integrada",
        "description": "No necesitas tu propia clave API.",
        "id": "ai"
      }
    ],
    "encryptionNote": "El cifrado de extremo a extremo protege la sincronización, no el procesamiento de IA.",
    "encryptionInfoLabel": "Sobre la IA y el cifrado de sincronización"
  },
  "summaryBody": "Las funciones locales y BYOK siguen gratis. Plus añade sincronización cifrada e IA integrada en macOS {version}. Windows Plus y las compras de iPhone aún no están disponibles.",
  "statusTitle": "Plus para macOS",
  "statusBody": "En macOS {version}, inicia sesión y activa la prueba o compra Plus de forma explícita en la app. La descarga de Windows es el cliente gratuito anterior y no ofrece compras de Plus. Descargar o iniciar sesión no inicia una prueba ni un pago.",
  "support": "Soporte privado",
  "supportBody": "Para facturación, privacidad, eliminación o cuenta, escríbenos. No publiques contraseñas, claves, tareas o datos de pago en incidencias públicas.",
  "technical": "Cuestiones técnicas en GitHub",
  "manageTitle": "Gestiona la compra original",
  "manageBody": "Inicia o gestiona Plus en Goalloom {version} para macOS. Usa la misma cuenta de Goalloom y sigue las indicaciones de la app para abrir su página segura de pago o gestión de suscripciones. Windows Plus y las compras de iPhone aún no están disponibles.",
  "stripeManage": "Web: usa la gestión Goalloom para cancelar renovación o cambiar el próximo ciclo. El portal Stripe verificado gestiona métodos y facturas compatibles; no es la única vía de cancelación.",
  "appleManage": "Futuro iPhone: gestiona en suscripciones Apple. Borrar la cuenta Goalloom no cancela Apple. La app iPhone aún no está publicada.",
  "terms": "Condiciones del servicio",
  "privacy": "Privacidad",
  "faqTitle": "Preguntas sobre pagos",
  "faqManageQuestion": "¿Cómo gestiono mi suscripción?",
  "faq": [
    {
      "q": "¿Qué sigue gratis?",
      "a": "Tareas locales, historial, copias, importación/exportación y BYOK siguen gratis. Tu proveedor puede cobrar por tu clave. Plus es opcional y no limita tus tareas locales.",
      "id": "free"
    },
    {
      "q": "¿Cómo empieza la prueba?",
      "a": "En Goalloom {version} para macOS, abre Ajustes → Sincronización e inicia sesión. En Goalloom Plus, elige «Iniciar prueba gratuita de 8 días». Cada cuenta puede activar una prueba de {trialDays} días ({trialHours} horas). Sin tarjeta ni cobro automático. Descargar, acceder y ver planes no inician el plazo. Windows Plus se aplaza.",
      "id": "trial"
    },
    {
      "q": "¿Y si compro antes de terminar la prueba?",
      "a": "La compra verificada inicia el pago de inmediato sin crédito ni extensión de prueba. Un reembolso no restaura esa prueba ni concede otra. Cancelación, fallo o confirmación pendiente conserva el plazo original.",
      "id": "purchase"
    },
    {
      "q": "¿Plus se renueva automáticamente?",
      "a": "La suscripción se renueva automáticamente. Cancela en el canal original y mantén acceso hasta el fin pagado. Ambos cambios mensual/anual rigen en la siguiente renovación, sin ajuste inmediato ni reembolso proporcional. Desinstalar o salir no cancela. Cancelar no reembolsa ni borra los datos en la nube. La prueba no se convierte sola en suscripción.",
      "id": "renewal"
    },
    {
      "q": "¿Qué pasa con los datos al vencer?",
      "a": "Las copias en la nube se conservan {retentionDays} días tras terminar todo acceso válido de prueba, pago y gracia. La recuperación crea una copia local independiente y requiere autorización de cuenta y credenciales de descifrado. Se cierra al vencer el plazo; el borrado en línea termina en otros {onlineDeleteDays} días. Una compra posterior no restaura la copia antigua. Los datos locales y BYOK siguen disponibles.",
      "id": "expiry"
    },
    {
      "q": "¿La IA es ilimitada o cifrada de extremo a extremo?",
      "a": "BYOK continúa disponible. La IA integrada exige acceso, selección explícita y consentimiento al contexto enviado. Goalloom usa OpenRouter con TypeSafe/Jev, DeepInfra para borradores y revisiones, y DeepSeek para reescribir notas. DeepSeek puede conservar contenido y usarlo para entrenar modelos. La IA es independiente del cifrado de sincronización. No prometemos IA ni almacenamiento ilimitados. La IA alojada tiene protección de uso, sin créditos ni cargos automáticos por exceso.",
      "id": "ai"
    },
    {
      "q": "¿Qué diferencia cuenta, contraseña de sincronización y pago?",
      "a": "La cuenta acredita tu identidad; la contraseña de sincronización abre los datos cifrados; una prueba o servicio de pago válido permite acciones en la nube. Son elementos separados. Acceder no inicia pruebas, compras, sincronización ni IA. Las compras de Plus se ofrecen en el cliente compatible de macOS; Windows Plus se aplaza.",
      "id": "account"
    },
    {
      "q": "¿Puedo solicitar un reembolso?",
      "a": "Pagos y tiempo no usado no se reembolsan, salvo exigencia legal o de plataforma. Duplicados, errores y servicio no prestado tienen soporte privado. Apple decide sus reembolsos. La prueba o activación no elimina derechos de desistimiento. No se restaura la prueba ni se borran datos locales automáticamente. Se mantienen los derechos legales.",
      "id": "refunds"
    },
    {
      "q": "¿Cuándo cambia el ciclo mensual/anual?",
      "a": "En ambos sentidos, en la próxima renovación. El periodo actual no cambia, sin ajuste inmediato ni prorrateo. Cancelar renovación impide el cambio pendiente; al reanudar confirma ciclo e importe.",
      "id": "changes"
    },
    {
      "q": "¿Y si falla la renovación?",
      "a": "Solo un fallo de renovación automática de una suscripción pagada da {graceDays} días de Plus desde el vencimiento de la renovación original. Primer pago fallido, fin de prueba y vencimiento tras cancelar no califican. Después, la web para nuevos reintentos y renovación; Apple puede seguir según sus reglas. Después, sin otro derecho, se paran la escritura en la nube y la IA. Los pagos en curso deben verificarse.",
      "id": "grace"
    }
  ],
  "billing": {
    "title": "Facturación de Goalloom",
    "description": "Vuelve a Goalloom y comprueba la compra original con la misma cuenta. La web no determina el estado del pago.",
    "continueTitle": "Continuar con Goalloom",
    "returnTitle": "Consultar la compra",
    "states": {
      "unavailable": "La facturación aún no está disponible",
      "invalid": "No se puede verificar este enlace",
      "signedOut": "Accede antes de continuar",
      "cancelled": "La compra no está confirmada",
      "failed": "No se pudo completar la compra",
      "pending": "Esperando un estado verificado",
      "confirmed": "El servicio está verificado",
      "appClosed": "Continúa en la aplicación Goalloom",
      "offline": "No hay conexión"
    },
    "explanation": "Vuelve a Goalloom y consulta el estado de tu suscripción con la cuenta que utilizaste para iniciar la compra.",
    "check": "Comprobar conexión",
    "openApp": "Volver a Goalloom",
    "manual": "Si Goalloom no se abre, abre la aplicación y comprueba la compra original en los ajustes de facturación. No vuelvas a comprar. Un enlace caducado o una comprobación sin conexión no cancela el pago.",
    "back": "Volver a planes",
    "noScript": "La facturación requiere la aplicación compatible y un backend verificado. Sin JavaScript puedes leer, descargar y contactar con soporte."
  },
  "legal": {
    "updated": "En vigor y última actualización: 23 de octubre de 2026",
    "privacyIntro": "Goalloom está operado por {operator}. Esta política cubre la app oficial, los servicios alojados opcionales y www.goalloom.com. El uso local no necesita cuenta; otros servicios autoalojados pueden tener otro operador.",
    "termsIntro": "Estas condiciones cubren la web oficial y los servicios alojados opcionales. {operator} opera la web y sus suscripciones; Stripe procesa sus pagos. Las compras Apple se prestan y liquidan según el vendedor de la página de compra y recibo App Store y sus reglas. Las licencias de software libre se aplican por separado y no se reducen aquí.",
    "accountTitle": "Acceso Apple / Google y cuenta",
    "account": "Apple o Google y Supabase procesan identificadores, correo, perfil facilitado y sesiones. La cuenta sirve también para IA opcional; acceder no autoriza subir datos, activar IA, iniciar prueba ni acreditar pago. No recibimos tu contraseña de Apple o Google.",
    "hosted": [
      "BYOK usa tu clave de OpenRouter o Vercel AI Gateway. En clientes compatibles, la IA alojada requiere selección explícita, acceso y consentimiento por cuenta antes de enviar el contexto necesario mediante Goalloom y OpenRouter. TypeSafe/Jev procesa la entrada inteligente, DeepInfra los borradores y revisiones, y DeepSeek ejecuta DeepSeek V4.1 Flash 1017 para reescribir notas. DeepSeek puede conservar el contenido enviado y usarlo para entrenar modelos. El cliente macOS {version} admite esta fuente si la elegibilidad y el consentimiento lo permiten; el cliente anterior de Windows no ofrece compras de Plus. Los proveedores procesan contexto legible, independiente del cifrado de sincronización.",
      "Goalloom procesa el contenido de IA dentro de la solicitud original sin almacenarlo en el servidor. Los resultados se entregan una vez y no se pueden descargar de nuevo; solo se conservan metadatos necesarios de llamadas, costes y seguridad. Eliminar la caché cifrada anterior no acredita el borrado físico inmediato de registros, réplicas o copias.",
      "El dispositivo puede conservar borradores y resúmenes no adoptados y sus huellas en cachés locales acotadas, incluso tras cerrar sesión. Sus límites difieren de los del proveedor. Las prácticas de retención y entrenamiento dependen de cada proveedor; no prometemos retención cero por todos ellos."
    ],
    "paymentsTitle": "Información de pagos y suscripciones",
    "payments": [
      "Goalloom para macOS inicia compras web mediante Stripe; RevenueCat agrega los pagos verificados. Windows Plus y las compras de iPhone se aplazan. Estas páginas informativas no cargan SDK de pago ni envían solicitudes de pago.",
      "En los canales de compra disponibles, sus proveedores pueden procesar métodos de pago, identificadores de transacción/suscripción, origen, importes, moneda, periodos y vínculos de cuenta necesarios. Los metadatos de pago no deben contener tareas, prompts, contraseñas de sincronización ni claves. No afirmamos que ningún dato de pago pase por Goalloom."
    ],
    "retention": "La política final Plus prevé {retentionDays} días desde el fin de toda prueba, pago y gracia. Al límite se cierra recuperación; el borrado en línea termina en otros {onlineDeleteDays} días y una compra posterior no restaura la copia. El borrado explícito cesa acceso al confirmar y borra en línea en {onlineDeleteDays} días sin ventana ordinaria. Tras el borrado en línea, pueden quedar copias de recuperación ante desastres con acceso restringido hasta que caduquen según la política de retención del proveedor de infraestructura correspondiente. Las copias locales y la retención de IA alojada son independientes. Estos servicios Plus se ofrecen en el cliente compatible de macOS; Windows Plus se aplaza.",
    "paidTitle": "Goalloom Plus para macOS",
    "paid": [
      "Lo local y BYOK siguen gratis. Plus para macOS ofrece sincronización e IA por {monthly} mensual o {annual} una vez al año, incluidos impuestos recaudables. Sin plan de solo sincronización, promoción inicial ni sobrecargos automáticos.",
      "Una prueba por cuenta dura {trialDays} días ({trialHours} horas) desde activación, sin tarjeta ni cobro automático. La compra confirmada consume el resto; el reembolso no lo restaura. Fallo o falta de confirmación conserva el plazo.",
      "La suscripción se renueva hasta cancelar en origen y mantiene acceso al fin pagado. Cambios rigen en la próxima renovación. No se reembolsan pagos ni tiempo no usado salvo ley, plataforma y remedios por errores o servicio según lo siguiente."
    ],
    "sources": "Apple/Google ofrecen acceso; Supabase, cuenta y sincronización; Vercel, alojamiento; GitHub, versiones de escritorio. OpenRouter y proveedores elegidos procesan IA. Stripe procesa los pagos web y RevenueCat verifica las compras. Las compras de Apple se aplazan. Estas páginas no ejecutan SDK de pago.",
    "support": "Contacta por el correo privado para facturación, privacidad, cuenta o eliminación. No publiques datos personales en GitHub. Podemos verificar titularidad; no envíes contraseñas, secretos, claves ni credenciales completas de pago."
  },
  "policy": {
    "sections": [
      {
        "id": "free",
        "title": "Funciones gratuitas y Plus",
        "paragraphs": [
          "Las tareas locales, el historial, las copias, la importación y la exportación siguen gratis sin Plus. Puedes usar tu propia clave de IA y pagar directamente al proveedor.",
          "Plus incluye sincronización cifrada e IA integrada, con el mismo servicio en ambos ciclos. Comprar, acceder o iniciar la prueba no sube datos ni activa IA automáticamente. La configuración de sincronización y los envíos a IA requieren tu acción y consentimiento."
        ]
      },
      {
        "id": "prices",
        "title": "Precios, impuestos y renovación",
        "paragraphs": [
          "La web cobra {monthly} al mes o {annual} una vez al año. El precio incluye los impuestos aplicables que debemos recaudar; no se añaden al importe mostrado. Tu banco puede cobrar conversión o gastos transfronterizos aparte.",
          "Moneda, precio local e impuestos Apple figuran en la confirmación de App Store y pueden diferir de la web. Antes de comprar se muestran total, ciclo y renovación. Se renueva automáticamente hasta cancelar en el canal original. Los cambios de precio siguen los avisos y consentimientos legales y de plataforma."
        ]
      },
      {
        "id": "trial",
        "title": "Prueba gratuita de 8 días",
        "paragraphs": [
          "Una cuenta elegible puede activar una sola prueba de {trialDays} días ({trialHours} horas consecutivas), compartida entre dispositivos. Descargar, registrarse, acceder, ver planes o abrir el pago no la inicia.",
          "No requiere medio de pago, no crea suscripción ni cobra al terminar. Sin otra elegibilidad válida, al finalizar se detienen sincronización e IA integrada; lo local y BYOK siguen disponibles.",
          "Una compra confirmada inicia el pago de inmediato y termina la prueba restante sin crédito ni extensión. Un pago fallido o pendiente conserva el plazo original. Un reembolso no restaura la prueba consumida ni concede otra. No se limitan los derechos legales de desistimiento o reembolso."
        ]
      },
      {
        "id": "cancellation",
        "title": "Cancelar la renovación",
        "paragraphs": [
          "Puedes cancelar en cualquier momento en el canal original. El acceso continúa hasta el fin del periodo pagado que muestre ese canal. Cancelar no reembolsa ni inicia el borrado de datos. Hazlo antes del plazo de procesamiento mostrado y comprueba el resultado. Apple muestra sus horarios y opciones.",
          "Para la web usa la entrada de gestión de facturación de Goalloom; para Apple, sus ajustes de suscripciones. Desinstalar, cerrar sesión o desactivar sincronización no cancela."
        ]
      },
      {
        "id": "changes",
        "title": "Cambiar entre mensual y anual",
        "paragraphs": [
          "Solicita el cambio en el canal original. En ambos sentidos entra en vigor en la próxima renovación. El periodo actual mantiene precio y fecha final, sin ajuste inmediato ni reembolso proporcional. Antes de confirmar se muestran importe nuevo y fecha.",
          "Al cancelar la renovación, el cambio pendiente no se aplica en la fecha original. Si reanudas, comprueba el próximo ciclo e importe. Comprar de nuevo tras vencer empieza en el momento confirmado. No trasladamos suscripciones entre web y Apple automáticamente; gestiona la original para evitar duplicados."
        ]
      },
      {
        "id": "grace",
        "title": "Renovación fallida",
        "paragraphs": [
          "Si una suscripción pagada no se renueva por un problema de pago, recibe {graceDays} días de gracia desde el vencimiento de la renovación original, no desde un reintento ni al abrir la aplicación. Plus sigue disponible con las protecciones normales. No se aplica al primer pago fallido, al fin de prueba ni al vencimiento tras cancelar.",
          "Si no se paga y no hay otra elegibilidad válida, al terminar la gracia se pausan sincronización e IA. Lo local y BYOK continúan. La web detiene nuevos reintentos automáticos y cancela renovaciones futuras; los pagos en curso se concilian. Apple puede seguir intentando y restaurar tras cobrar; cancela con Apple si no deseas más cargos. La app muestra el plazo real y los siguientes pasos."
        ]
      },
      {
        "id": "refunds",
        "title": "Reembolsos, errores y derechos",
        "paragraphs": [
          "Salvo obligación legal o de la plataforma, los pagos no se reembolsan ni se prorratea el tiempo no usado. Cambiar de opinión, olvidar cancelar, no usar el servicio o borrar la cuenta no crea una compensación adicional.",
          "Escribe a {supportEmail} por cargos duplicados, errores o servicio no prestado según lo acordado. Incluye canal e identificador de pedido; no envíes tarjeta completa, contraseña de sincronización ni tareas.",
          "Solicita reembolsos Apple a Apple, que decide. Se mantienen desistimiento, reembolsos y remedios obligatorios. Si tienes derecho de desistimiento, comunícalo claramente dentro del plazo. La prueba o activación inmediata no equivalen a renunciar a esos derechos."
        ]
      },
      {
        "id": "disputes",
        "title": "Reembolsos, disputas y acceso",
        "paragraphs": [
          "Un reembolso total aprobado o una reversión puede terminar el acceso de esa transacción. El parcial no acorta por sí solo el periodo. Solicitar un reembolso aún no aprobado no detiene el servicio.",
          "Una disputa verificada puede suspender el acceso de la transacción afectada con aviso o soporte privado. Otra suscripción válida no afectada continúa. No se borran datos locales automáticamente. Si acaba todo acceso, se aplica la misma retención de {retentionDays} días. Al resolver se restaura el acceso válido según hechos verificados, sin nueva prueba."
        ]
      },
      {
        "id": "cloud-retention",
        "title": "Datos cloud tras el fin del acceso",
        "paragraphs": [
          "Se conservan {retentionDays} días desde que terminan todas las pruebas, pagos y gracias válidas. Cancelar renovación no inicia el plazo. Se paran nuevas subidas e IA integrada. Recuperar lo existente requiere autorización de cuenta y contraseña de sincronización u otras credenciales de descifrado; no podemos sustituirlas si se pierden.",
          "Reactivar antes del límite permite continuar con una copia no borrada. Al llegar a {retentionDays} días se cierra recuperación y empieza el borrado en línea, que termina en otros {onlineDeleteDays} días. Comprar después no recupera la copia aunque el borrado siga pendiente; se reconstruye desde tus datos.",
          "Vencimiento ordinario, reembolsos y disputas usan los mismos {retentionDays} días. No se borran tareas, historial ni copias locales que conserves.",
          "La recuperación limitada crea una copia local independiente sin reanudar la sincronización ni subir cambios. Reemplazar el espacio actual exige una decisión explícita y una copia local de protección. Acceder a la cuenta no basta para descifrarla; las credenciales necesarias permanecen en el dispositivo.",
          "Los ajustes de cuenta muestran los plazos de servicio y recuperación y el estado del borrado en línea. Los recordatorios necesarios aparecen solo dentro de Goalloom, sin interrumpir la edición local. No amplían los plazos ni se envían por correo o notificaciones del sistema."
        ]
      },
      {
        "id": "deletion",
        "title": "Borrar cuenta o datos cloud",
        "paragraphs": [
          "El borrado explícito no tiene la retención ordinaria de {retentionDays} días. Tras confirmar una solicitud válida, se detiene inmediatamente el acceso cloud afectado. El contenido en línea afectado y, cuando se solicite, la cuenta se borran en {onlineDeleteDays} días. Exporta primero lo necesario. Volver a suscribirse no restaura lo borrado. Tú gestionas los datos locales.",
          "Al borrar toda la cuenta también tramitamos cancelar renovación web. Apple no se cancela automáticamente: desactívala en Apple. Puedes pedir borrado inmediato sin esperar el vencimiento. Borrar solo datos cloud no cancela cuenta ni suscripción. Borrar no reembolsa tiempo no usado, salvo obligación legal o de plataforma."
        ]
      },
      {
        "id": "records",
        "title": "Registros limitados tras borrar",
        "paragraphs": [
          "Stripe o Apple procesa el pago de cada canal; RevenueCat ayuda a verificar suscripciones. Goalloom trata vínculos de cuenta, pedidos, importes, moneda, impuestos y estado necesarios. No enviamos tareas, entradas de IA ni contraseñas de sincronización a pago/verificación, ni guardamos tarjetas completas o códigos de seguridad.",
          "Según la política de lanzamiento, tras el borrado en línea, pueden quedar copias de recuperación ante desastres con acceso restringido hasta que caduquen según la política de retención del proveedor de infraestructura correspondiente. Estas copias no sirven para recuperar cuentas ni continuar el servicio. Al restaurar infraestructura, se deben reaplicar los registros de borrado antes de reanudar el acceso para impedir que el contenido borrado vuelva a estar accesible. Esto no significa borrado físico inmediato del soporte al recibir la solicitud.",
          "Pedidos, facturas y registros necesarios se conservan {billingYears} años tras la transacción o ajuste contable relacionado, o más si la ley lo exige. Registros seudonimizados de prueba y abuso duran hasta {abuseDays} días tras borrar cuenta, sin tareas ni huellas de dispositivo. Evidencia necesaria para una disputa u obligación puede durar hasta su resolución y plazo aplicable.",
          "Guardar registros contables o de protección no justifica conservar toda la cuenta de tareas. La privacidad regula por separado entradas y resultados IA; el plazo de sincronización no sustituye esas reglas."
        ]
      },
      {
        "id": "ai-use",
        "title": "Uso razonable de IA y soporte",
        "paragraphs": [
          "La IA es para tareas y objetivos personales cotidianos. Se prohíbe revender, ofrecer cuentas compartidas, llamadas automatizadas masivas o eludir protecciones. Registramos uso, coste y seguridad necesarios y podemos limitar o suspender tráfico anormal con instrucciones o soporte.",
          "No prometemos IA ilimitada, no vendemos paquetes de llamadas ni cobramos exceso automáticamente. La protección IA no cancela sincronización válida. Para facturación, cancelación, borrado o servicio: {supportEmail}."
        ]
      }
    ]
  }
} satisfies ServiceCatalog
