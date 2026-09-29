# Portal de Agendamiento de Citas — Prototipo técnico preliminar

**Clínica Salud Divina de la Costa S.A.S.** · Consulta Externa

> ⚠️ **PROTOTIPO PARA EVALUACIÓN INTERNA.** No es un sistema listo para producción ni un sistema clínico
> certificado. **Todos los datos son ficticios. No ingrese datos reales de pacientes.** No hay integración
> con SaludSystem12 ni con WhatsApp.

Concepto: **Portal = autogestión** · **WhatsApp = comunicación y soporte** · **SaludSystem12 = sistema institucional**.

Análisis, riesgos, arquitectura y modelo de datos en detalle: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## 1. Ejecución local

### Requisitos
- Node.js 22 o superior (probado con 24.19 LTS).
- Un proyecto de **Supabase** (PostgreSQL). Cualquier PostgreSQL 14+ también sirve.

### Configurar Supabase
1. Crear un proyecto en Supabase (región sugerida: *South America (São Paulo)*).
2. En el proyecto: **Connect → Session pooler** y copiar la cadena de conexión (puerto 5432, compatible con IPv4).
3. Copiar `server/.env.example` como `server/.env` y completar:
   - `DATABASE_URL` = la cadena del paso 2 (con la contraseña de la base de datos).
   - `JWT_SECRET` = un valor aleatorio largo:
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

> El frontend **no** usa las llaves `anon`/`service_role` de Supabase ni se conecta a la base de datos.
> Solo el backend tiene la cadena de conexión.

### Instalar, crear tablas y cargar datos ficticios
```powershell
npm run install:all
npm run db:reset        # crea las tablas y carga los datos ficticios (BORRA los datos del prototipo)
```

### Modo desarrollo (dos terminales)
```powershell
npm run dev:api         # API en http://localhost:4000
npm run dev:web         # Interfaz en http://localhost:5173
```

### Modo "demo" (un solo proceso)
```powershell
npm run build           # compila la interfaz
npm start               # API + interfaz en http://localhost:4000
```

### Pruebas automatizadas
```powershell
npm test                # recorre el flujo principal completo contra la API y la BD configurada
```
Crea solicitudes adicionales de prueba; ejecute `npm run db:reset` después si quiere volver a los datos iniciales.

| URL | Uso |
|---|---|
| `/` | Portal del paciente |
| `/agendar` | Agendar cita |
| `/consultar` | Consultar estado de una solicitud |
| `/admisiones` | Panel de Admisiones (requiere inicio de sesión) |

## 2. Usuarios de prueba (solo desarrollo)

| Rol | Usuario | Contraseña |
|---|---|---|
| Admisionista | `admision01` | `Admision01*Demo` |
| Admisionista | `admision02` | `Admision02*Demo` |
| Administrador | `admin01` | `Admin01*Demo` |

Pacientes ficticios: documentos `99000001` a `99000020`, teléfonos `300000xxxx`, correos `@ejemplo.test`.
Las contraseñas se guardan con bcrypt; las de arriba solo existen en el script de datos ficticios
(`server/src/db/seed.js`) y **deben cambiarse o eliminarse** en cualquier ambiente compartido.

## 3. Flujo completo de prueba (paso a paso)

1. Abrir `/` → **Agendar una cita**.
2. Elegir *Medicina General* y un profesional (o "Cualquier profesional disponible") → Continuar.
3. Elegir un día y un horario libre → Continuar.
4. Datos ficticios: CC `99300001`, "Paciente Prueba Demo", teléfono `3001112233`; aceptar el tratamiento de datos → Revisar.
5. **Confirmar solicitud** → el sistema muestra el código `SOL-0000NN`. El horario queda reservado.
6. **Consultar estado** con ese código y el documento → estado *Pendiente*.
7. Abrir `/admisiones` e ingresar como `admision01`.
8. En **Inicio** la solicitud aparece en *Solicitudes pendientes*. Abrirla.
9. **Tomar para gestión** → *En gestión* (queda como responsable).
10. **Confirmar cita** (nota opcional) → *Confirmada*.
11. **Calendario**: la cita aparece en su día/hora (vistas Día/Semana/Mes y filtros).
12. En el detalle, **Copiar datos** para digitarlos en SaludSystem12 (proceso manual real).
13. **Registrar en SaludSystem12**: digitar opcionalmente el Nº que dio SaludSystem12, marcar la casilla
    de confirmación → *Registrada en SaludSystem12*.
14. El **Historial de la solicitud** muestra cada paso con usuario, fecha/hora, estado anterior y nuevo.
15. Ingresar como `admin01` → **Auditoría** → buscar el código: aparecen creación, consultas, cambios de estado,
    inicios de sesión y accesos denegados.
16. Probar RBAC: como `admision01`, abrir `/admisiones/auditoria` → no está disponible, y la API responde 403.

## 4. Arquitectura y stack

Monolito modular: **React (Vite) → API Node.js/Express → PostgreSQL (Supabase)**.

| Capa | Tecnología |
|---|---|
| Interfaz | React 18, React Router, FullCalendar 6 (MIT), CSS propio |
| API | Node.js + Express, Zod (validación), helmet, express-rate-limit |
| Autenticación | JWT en cookie `httpOnly` + `SameSite=Strict`, contraseñas con bcrypt |
| Autorización | RBAC con tablas `roles` / `permissions` / `role_permissions`, verificado en cada endpoint |
| Base de datos | PostgreSQL (Supabase) con driver `pg` y migraciones SQL |
| Auditoría | Tabla `audit_logs` + `appointment_status_history` |
| WhatsApp (futuro) | Tabla `notification_outbox` (eventos en estado `SIMULADO`, nada se envía) |
| SaludSystem12 (futuro) | Adaptador `MANUAL` en `server/src/modules/integrations/saludsystem12.adapter.js` |

## 5. Estructura del proyecto

```
agenda-clinica-mvp/
├── README.md
├── docs/ARQUITECTURA.md            análisis, riesgos, arquitectura, modelo de datos, alcance
├── server/                         API (Node.js + Express)
│   ├── .env.example
│   ├── src/
│   │   ├── index.js / app.js       arranque, seguridad HTTP, rutas, manejo de errores
│   │   ├── config.js
│   │   ├── db/                     pool, migrate.js, seed.js, migrations/001_init.sql
│   │   ├── lib/                    errores, fechas (America/Bogota)
│   │   ├── middleware/auth.js      sesión JWT + RBAC (requirePermission)
│   │   └── modules/
│   │       ├── auth/               login, logout, sesión
│   │       ├── public/             portal del paciente (crear solicitud, consultar estado)
│   │       ├── catalog/            especialidades, profesionales, cálculo de disponibilidad
│   │       ├── appointments/       máquina de estados, gestión, calendario, dashboard
│   │       ├── admin/              usuarios, roles, consulta de auditoría
│   │       ├── audit/              servicio de auditoría
│   │       └── integrations/       saludsystem12 (manual) y notificaciones (outbox)
│   └── test/flujo-principal.test.js
└── web/                            Interfaz (React + Vite)
    └── src/
        ├── patient/                Inicio, Agendar (4 pasos), Consultar estado
        └── staff/                  Login, Inicio, Solicitudes, Detalle, Calendario, Usuarios, Auditoría
```

## 6. Modelo de datos

`roles`, `permissions`, `role_permissions`, `users`, `specialties`, `professionals`, `schedules`,
`patients`, `appointments`, `appointment_status_history`, `audit_logs`, `notification_outbox`.

Reglas en la propia base de datos: documento único por paciente; código `SOL-000001` por secuencia;
**índice único parcial que impide la doble reserva** de un profesional a la misma hora; `CHECK` de estados
válidos; motivo limitado a 200 caracteres. **Ninguna tabla contiene información clínica.**
Detalle y diagrama en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#5-modelo-de-datos).

Estados: `PENDIENTE → EN_GESTION → CONFIRMADA → REGISTRADA_EN_SALUDSYSTEM12`, con `REPROGRAMADA`
(requiere reconfirmación) y `CANCELADA` (libera el horario). Las transiciones inválidas se rechazan (409).

## 7. Funcionalidades terminadas

**Paciente:** agendamiento en 4 pasos (especialidad → profesional opcional → día/hora con cupos reales →
datos + autorización de datos → confirmación), código de solicitud, consulta de estado con código + documento
(datos mínimos y nombre enmascarado), motivo solo en especialidades que lo requieren.

**Admisiones:** inicio con pendientes, citas del día, próximas citas y cupos libres; bandeja con búsqueda,
filtros (estado, especialidad, profesional, rango de fechas), orden y paginación; detalle con acciones
tomar / confirmar / reprogramar (con disponibilidad) / cancelar (motivo obligatorio) / registrar en
SaludSystem12; historial; "copiar datos"; calendario día/semana/mes con filtros y panel de disponibilidad.

**Administrador:** todo lo anterior + gestión de usuarios (crear, activar/desactivar, rol, contraseña) y
consulta de auditoría con filtros.

**Seguridad:** RBAC por permisos en cada endpoint; permisos releídos en cada petición; bcrypt; cookie
httpOnly/SameSite=Strict; límite de intentos de login y de solicitudes públicas; validación de entradas;
errores sin detalles internos; auditoría de logins (éxito/fallo), accesos denegados, consultas de detalle,
cambios de estado y acciones administrativas; tablas no expuestas por la Data API de Supabase (RLS + revoke).

**Verificación realizada:** prueba automatizada del flujo completo (incluye doble reserva, 401/403,
transición inválida, historial y auditoría) y recorrido manual en navegador del portal y del panel.

## 8. Funcionalidades pendientes (fuera del alcance del MVP)

- Integración real con SaludSystem12 y con WhatsApp.
- Administración de agendas desde la interfaz (horarios, festivos, ausencias, bloqueos).
- Verificación de identidad del paciente (OTP) y cancelación/reprogramación por el propio paciente.
- Creación de citas por Admisiones para pacientes que llaman o escriben (canal `ADMISIONES` ya previsto).
- Convenios/EPS/autorizaciones, si Admisiones los requiere.
- Reportes e indicadores; exportación de auditoría.
- Aviso de privacidad y texto de autorización definitivos aprobados por la clínica.
- Pruebas de interfaz automatizadas, de carga y de accesibilidad formal; migración a TypeScript.

## 9. Riesgos para pasar a producción

1. **Protección de datos (Ley 1581/2012, Decreto 1377/2013):** política de tratamiento, aviso de privacidad,
   registro de la base ante la SIC si aplica, y evaluar la **transferencia internacional** si Supabase aloja
   los datos fuera de Colombia (contrato de transmisión, DPA con el proveedor, región).
2. **Doble fuente de verdad** con SaludSystem12 mientras el registro sea manual: riesgo de citas desalineadas.
3. **Identidad del paciente:** hoy cualquiera que conozca un documento puede crear solicitudes y actualizar
   los datos de contacto de ese paciente (queda auditado). Se requiere OTP u otra verificación.
4. **Abuso del portal** (bots que bloquean cupos): hoy solo hay límite por IP y máximo 3 solicitudes activas
   por paciente; evaluar CAPTCHA, verificación y expiración de reservas no gestionadas.
5. **Seguridad operativa:** HTTPS obligatorio, secretos en gestor de secretos, validar certificado TLS de la BD
   (`DB_SSL_CA`), eliminar usuarios de prueba, política de contraseñas, MFA para personal, bloqueo por intentos,
   copias de seguridad, monitoreo y retención de logs, pruebas de penetración.
6. **Continuidad:** plan de contingencia si el portal o Supabase no están disponibles (volver a WhatsApp/teléfono).
7. **Gestión del cambio:** capacitación de Admisiones y comunicación a pacientes del nuevo canal.

## 10. Información a solicitar a INFOTEC (SaludSystem12)

1. ¿Existe un mecanismo **oficial y soportado** de integración (API REST/SOAP, servicios web, HL7 v2, FHIR,
   archivos planos, base intermedia)? Documentación técnica y ambiente de pruebas (sandbox).
2. Operaciones disponibles: consultar agendas/disponibilidad por profesional, crear, reprogramar y cancelar
   citas, consultar pacientes, crear pacientes.
3. Identificadores: cómo se identifican pacientes, profesionales, especialidades, sedes y citas; tablas de
   homologación (códigos de especialidad, tipos de documento).
4. Reglas de negocio que SaludSystem12 aplica al asignar citas (convenios, autorizaciones, tipos de cita,
   primera vez/control, duración por especialidad).
5. Autenticación y seguridad del mecanismo (credenciales de servicio, certificados, IPs permitidas, VPN).
6. Límites de uso, horarios de ventana de mantenimiento, disponibilidad y SLA de soporte.
7. Posibilidad de notificaciones/eventos (webhooks) cuando una cita cambia en SaludSystem12.
8. Costos, licenciamiento y condiciones contractuales para la integración.
9. Si no hay integración: ¿se puede exportar la agenda periódicamente para evitar la doble fuente de verdad?

## 11. Definiciones pendientes para integrar WhatsApp

1. Usar la **WhatsApp Business Platform (Cloud API)** oficial, directamente o vía un **BSP** aprobado por Meta,
   en lugar de la app de WhatsApp Business (que es lo que hoy se bloquea por volumen).
2. Número a usar (¿el actual de Admisiones o uno nuevo?), verificación del negocio en Meta Business Manager y
   nombre visible.
3. **Plantillas** a aprobar por Meta: solicitud recibida, cita confirmada, recordatorio (¿24 h antes?),
   reprogramación, cancelación. Los eventos ya quedan en `notification_outbox` con los datos necesarios.
4. **Consentimiento (opt-in)** del paciente para recibir mensajes por WhatsApp y texto legal asociado.
5. Qué respuestas del paciente se automatizan (confirmar/cancelar con botón) y cuáles pasan a un agente humano;
   herramienta de bandeja compartida para Admisiones.
6. Costos por conversación, presupuesto y responsable de la cuenta.
7. Horarios de atención, tiempos de respuesta y manejo de casos especiales.
