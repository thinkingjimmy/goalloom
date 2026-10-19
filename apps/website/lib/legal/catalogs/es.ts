/**
 * [INPUT]: LegalCatalog contract and verified desktop/website data flows.
 * [OUTPUT]: es privacy policy and terms of service.
 * [POS]: lib/legal/catalogs; substantive sections match the other four languages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LegalCatalog } from '../types'

export default {
  "updated": "En vigor y última actualización: 19 de octubre de 2026",
  "contents": "En esta página",
  "contact": "Contacto",
  "contactText": "Para consultas sobre privacidad, acceso, rectificación, eliminación o el servicio, escribe al responsable. Podemos solicitar información para verificar la titularidad. No envíes contraseñas, secretos de recuperación ni claves API.",
  "resources": "Políticas y licencias relacionadas",
  "privacy": {
    "title": "Política de privacidad",
    "description": "Cómo trata Goalloom los datos locales, el acceso con Google, la sincronización cifrada opcional, las solicitudes de IA y tus opciones de privacidad.",
    "intro": "Goalloom es una aplicación de planificación que prioriza el almacenamiento local, mantenida por Jimmy, desarrollador independiente. Esta política cubre la aplicación oficial, la sincronización alojada opcional y www.goalloom.com. Las versiones modificadas o autoalojadas pueden tener otros responsables y prácticas.",
    "sections": [
      {
        "id": "local",
        "title": "El espacio de trabajo se guarda en tu dispositivo",
        "paragraphs": [
          "Las tareas, descripciones, objetivos, relaciones, calendario e historial se guardan en una base SQLite local. También pueden quedar copias de seguridad, exportaciones, preferencias y cachés en el equipo. El tablero local no requiere una cuenta en la nube.",
          "Goalloom no envía el contenido de las tareas como telemetría ni usa rastreadores publicitarios. Activar la sincronización cifrada no cifra automáticamente la base local, las exportaciones ni las copias de seguridad; protege tu dispositivo y las copias que compartas."
        ]
      },
      {
        "id": "google",
        "title": "Acceso con Google",
        "paragraphs": [
          "Si activas la sincronización con Google, Google y Supabase, nuestro proveedor de autenticación, procesan tu identificador de cuenta, correo, perfil básico —como nombre e imagen cuando se faciliten— y sesiones. Se usan para identificar y mostrar la cuenta y autorizar sus dispositivos y espacios. No recibimos tu contraseña de Google.",
          "El acceso actual solicita identidad básica, correo y perfil, no acceso a Gmail, Google Drive o Google Calendar. No vendemos los datos de la cuenta de Google ni los usamos para publicidad o entrenar IA. Su uso y transferencia respetan la Google API Services User Data Policy, incluidos los requisitos de Limited Use."
        ]
      },
      {
        "id": "sync",
        "title": "Sincronización cifrada opcional",
        "paragraphs": [
          "Al activarla, el dispositivo cifra el contenido de las operaciones antes de enviarlo a Supabase. El servicio almacena ese contenido cifrado y metadatos de cuenta, dispositivo, espacio, secuencia, autorización, uso y tiempo necesarios para sincronizar. El cifrado de extremo a extremo protege el contenido, no esos metadatos. La infraestructura puede procesar direcciones IP y registros de solicitudes.",
          "Los dispositivos autorizados conservan las claves de descifrado. Las preferencias sincronizadas compatibles pueden incluir credenciales de IA cifradas; las exportaciones y copias normales excluyen esos registros. El servidor no recibe la contraseña de sincronización en texto claro ni claves privadas de dispositivo. Perder las credenciales necesarias puede impedir recuperar los datos."
        ]
      },
      {
        "id": "ai",
        "title": "Funciones opcionales de IA",
        "paragraphs": [
          "La IA usa el proveedor y modelo que configures, actualmente mediante OpenRouter o Vercel AI Gateway. Al activarla y usarla, la aplicación envía la entrada y el contexto necesario: puede incluir títulos, descripciones, objetivos relacionados y resúmenes acotados de actividad. Es independiente de la sincronización cifrada: el proveedor y el servicio de modelo reciben contexto que pueden procesar.",
          "Tu clave API autentica las solicitudes. No usamos tu contenido para entrenar modelos propios. La retención, el tratamiento y el entrenamiento por proveedores dependen del servicio y la configuración elegidos. Revisa sus políticas antes de activar la IA y evita enviar información que no quieras que procesen."
        ]
      },
      {
        "id": "network",
        "title": "Web, vistas previas y actualizaciones",
        "paragraphs": [
          "La web está alojada en Vercel y no instala scripts publicitarios o analíticos. Recuerda el tema elegido en el almacenamiento local del navegador. La infraestructura puede procesar IP, URL solicitada, navegador, marcas de tiempo y registros de seguridad para entregar y proteger la web.",
          "La aplicación puede solicitar metadatos e imágenes de páginas públicas para vistas previas y contactar con la infraestructura de GitHub para buscar y descargar actualizaciones. Los destinos reciben información normal de red y, en las vistas previas, la URL solicitada. Al abrir enlaces externos se aplican las políticas del destino."
        ]
      },
      {
        "id": "sharing",
        "title": "Proveedores y divulgaciones",
        "paragraphs": [
          "Google facilita el acceso; Supabase, la autenticación y sincronización; Vercel aloja la web; GitHub distribuye versiones y gestiona incidencias públicas. Los proveedores de pasarela y modelo elegidos procesan solicitudes de IA. Reciben los datos necesarios para las actividades descritas y aplican sus propias condiciones y políticas.",
          "No vendemos información personal ni la compartimos para publicidad dirigida. Podemos divulgarla cuando sea necesario para operar funciones, cumplir obligaciones legales o abordar abuso y riesgos de seguridad. Los proveedores pueden tratar datos en otros países. Los correos y la información que nos envíes se usan para responder y gestionar solicitudes; las incidencias públicas de GitHub son visibles para otros."
        ]
      },
      {
        "id": "retention",
        "title": "Conservación y eliminación",
        "paragraphs": [
          "Los datos locales y sus copias quedan bajo tu control hasta que los elimines. Los datos de cuenta y registros cifrados alojados se conservan para sincronizar hasta su eliminación. Los registros de seguridad, soporte e infraestructura se conservan según su finalidad u obligaciones legales; los datos eliminados pueden permanecer en copias rutinarias hasta que caduquen. No prometemos borrar todas las copias de inmediato.",
          "Cerrar sesión, desinstalar o revocar Google no elimina por sí solo los datos alojados. Borrar una tarea no borra su historial de sincronización, copias o cuenta. Para eliminar la cuenta alojada y los espacios asociados, escribe al correo de abajo. Las copias en otros dispositivos o respaldos propios requieren eliminación aparte."
        ]
      },
      {
        "id": "choices",
        "title": "Opciones y solicitudes",
        "paragraphs": [
          "Puedes usar solo el modo local, desactivar IA, cerrar sesión, exportar, gestionar copias y revocar permisos en tu cuenta de Google. Según la legislación aplicable, puedes solicitar acceso, rectificación, supresión, limitación, oposición o una copia portable de la información que conservemos, y acudir a la autoridad de protección de datos. Escríbenos; el cifrado limita lo que podemos inspeccionar o recuperar.",
          "Goalloom no está dirigido a menores de 13 años. Si crees que un menor ha proporcionado información al servicio alojado, contáctanos para investigar y gestionar su eliminación cuando corresponda."
        ]
      },
      {
        "id": "changes",
        "title": "Cambios en esta política",
        "paragraphs": [
          "Actualizaremos la fecha cuando cambien las prácticas. Los cambios importantes se explicarán en la web o mediante un aviso adecuado del producto. Actualizar la política no activa automáticamente el intercambio opcional ni concede nuevos permisos."
        ]
      }
    ]
  },
  "terms": {
    "title": "Términos de servicio",
    "description": "Condiciones del sitio y los servicios alojados opcionales de Goalloom: responsabilidades, IA, disponibilidad y derechos de código abierto.",
    "intro": "Estos términos se aplican al sitio oficial y los servicios alojados opcionales mantenidos por Jimmy. Al usarlos aceptas estos términos. Las licencias de software regulan por separado el código abierto.",
    "sections": [
      {
        "id": "license",
        "title": "Derechos de código abierto",
        "paragraphs": [
          "El código de los clientes de escritorio y móvil, los paquetes compartidos y la web se ofrecen bajo MIT License. El código servidor de sincronización del directorio supabase usa GNU AGPL-3.0-only. Consulta las licencias del repositorio para sus permisos y condiciones.",
          "Estos términos no sustituyen, reducen ni revocan los derechos concedidos por esas licencias. El autoalojamiento y las modificaciones se rigen por las licencias correspondientes; los terceros responden de sus propios servicios."
        ]
      },
      {
        "id": "account",
        "title": "Tu cuenta y tus datos",
        "paragraphs": [
          "Conservas los derechos sobre tu contenido. Solo autorizas el tratamiento necesario para las funciones elegidas, según la Política de privacidad. Debes tener derecho a usar lo que envíes.",
          "Usa cuentas autorizadas y protege dispositivos, cuenta Google, contraseña de sincronización, material de recuperación y claves IA. Guarda copias importantes. No garantizamos recuperar datos cifrados sin las claves o credenciales necesarias. Si no puedes aceptar legalmente estos términos, obtén el consentimiento exigido por la ley."
        ]
      },
      {
        "id": "use",
        "title": "Uso aceptable",
        "paragraphs": [
          "No uses los servicios de forma ilegal, accedas a datos ajenos sin permiso, distribuyas código malicioso, interrumpas el servicio, eludas controles o evites intencionadamente los límites. La investigación de seguridad no debe exponer datos ajenos ni dañar el servicio.",
          "Podemos restringir el acceso alojado cuando sea razonablemente necesario frente a abusos, riesgos o exigencias legales. No revoca tu licencia de código abierto. Explicaremos la restricción cuando sea viable y apropiado; una amenaza urgente puede requerir actuar primero."
        ]
      },
      {
        "id": "optional",
        "title": "Servicios opcionales y terceros",
        "paragraphs": [
          "El tablero local no requiere cuenta alojada. La sincronización y la IA dependen de la red y de Google, Supabase, GitHub y los proveedores elegidos. Sus condiciones y disponibilidad pueden cambiar.",
          "La aplicación distribuida actualmente es gratuita; los proveedores de IA pueden cobrarte directamente en tu cuenta. Estos términos no crean una suscripción. Cualquier oferta de pago futura indicará precio y condiciones antes de que decidas comprar."
        ]
      },
      {
        "id": "ai",
        "title": "Resultados de IA",
        "paragraphs": [
          "Las sugerencias pueden ser incorrectas, incompletas o inadecuadas. Revisa planes, ubicación de tareas, relaciones y textos antes de confiar en ellos. Eres responsable de las decisiones y acciones basadas en los resultados. La IA no sustituye el asesoramiento profesional cualificado."
        ]
      },
      {
        "id": "availability",
        "title": "Cambios, copias y fin de uso",
        "paragraphs": [
          "Podemos actualizar software y servicios, establecer límites operativos razonables o retirar funciones alojadas. No prometemos disponibilidad ni plazos de recuperación. Ante un cierre importante planificado intentaremos dar aviso razonable y oportunidad de exportar datos disponibles; una urgencia legal o de seguridad puede impedirlo.",
          "Puedes dejar de usar el servicio cuando quieras. Cerrar sesión o desinstalar no solicita eliminación en la nube. Escribe para borrar la cuenta alojada y gestiona aparte archivos y copias locales. La Política de privacidad explica conservación y eliminación."
        ]
      },
      {
        "id": "warranty",
        "title": "Garantías y responsabilidad",
        "paragraphs": [
          "En la medida permitida por la ley, los servicios y la web se ofrecen según disponibilidad, sin garantizar ausencia de interrupciones, errores o idoneidad para un propósito. Las licencias establecen las garantías y responsabilidad del software abierto.",
          "En la medida legalmente permitida, el responsable no responde por pérdidas indirectas o consecuentes del uso, incluidas las causadas por fallos de terceros o credenciales perdidas. Nada excluye responsabilidades que no puedan excluirse ni limita derechos imperativos de consumidores o privacidad."
        ]
      },
      {
        "id": "changes",
        "title": "Cambios y consultas",
        "paragraphs": [
          "Publicaremos cambios aquí con fecha revisada y comunicaremos los importantes en la web o mediante un aviso adecuado. No se aplican retroactivamente para quitar derechos existentes. Contáctanos sobre estos términos o cualquier problema del servicio."
        ]
      }
    ]
  }
} satisfies LegalCatalog
