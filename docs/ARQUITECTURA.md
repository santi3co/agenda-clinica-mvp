# Portal de Agendamiento — Prototipo técnico preliminar

**Clínica Salud Divina de la Costa S.A.S.** · Consulta Externa

> ⚠️ **Prototipo técnico preliminar para evaluación interna.** No es un sistema listo para
> producción, no es un sistema clínico certificado y **no debe usarse con datos reales de pacientes**.
> Todos los datos incluidos son ficticios.

---

## 1. Análisis del requerimiento

**Problema:** el WhatsApp de Admisiones soporta todo el ciclo de agendamiento (consulta de
disponibilidad, negociación del horario, confirmación), lo que ha producido bloqueos temporales de la
cuenta de WhatsApp Business y deja el proceso sin trazabilidad estructurada.

**Cambio propuesto (sin eliminar canales):**

| Canal | Rol futuro |
|---|---|
| **Portal web** | Canal principal de autogestión: solicitar/reservar y consultar estado |
| **WhatsApp** | Confirmación, recordatorios, avisos de cambios, soporte y casos especiales |
| **SaludSystem12** | Sistema institucional donde se registra la cita (fuente oficial) |

**Lo que el MVP debe demostrar:** paciente → portal → solicitud → base de datos → panel de
Admisiones → gestión → confirmación → calendario → "Registrar en SaludSystem12" (acción manual
asistida) → trazabilidad completa.

## 2. Riesgos y ambigüedades identificadas

| # | Tema | Decisión tomada en el MVP | Qué hay que validar |
|---|---|---|---|
| 1 | **¿"Solicitud" o "reserva"?** Si el paciente elige horario, ¿ese horario queda bloqueado? | El horario elegido **queda reservado** (estado PENDIENTE) para evitar que dos pacientes pidan el mismo. Si se cancela, se libera. | Si Admisiones prefiere solo "preferencia" sin bloqueo. |
| 2 | **Disponibilidad real vive en SaludSystem12**, no en el portal | Las agendas del MVP son ficticias y locales. Existe riesgo de doble fuente de verdad. | Con INFOTEC: ¿se puede leer la agenda de SaludSystem12? |
| 3 | **Identidad del paciente**: no hay cuentas de paciente | El paciente no crea usuario. Consulta su estado con **código de solicitud + número de documento**. | Si en producción se requiere OTP por SMS/WhatsApp/correo. |
| 4 | **"Profesional si aplica"** | El paciente puede elegir "Cualquier profesional disponible"; el sistema asigna el primero libre en ese horario. | — |
| 5 | **Motivo de consulta** puede derivar en información clínica | Campo **opcional**, texto corto (máx. 200 caracteres), solo si la especialidad lo pide, con aviso de no incluir diagnósticos. | Si se elimina del todo. |
| 6 | **Convenios / EPS / autorizaciones** | **Fuera de alcance** (no se pidió y agrega complejidad). | Es probable que Admisiones lo necesite en producción. |
| 7 | **Estado REPROGRAMADA** | Reprogramar cambia fecha/hora/profesional y deja la cita en REPROGRAMADA, que requiere volver a confirmarse con el paciente. | — |
| 8 | **Cambios después de registrar en SaludSystem12** | Se permiten reprogramar/cancelar, pero el sistema **advierte** que también debe hacerse manualmente en SaludSystem12. | Procedimiento operativo. |
| 9 | **Supabase como base de datos** | Se usa **solo como PostgreSQL gestionado**. El frontend **no** se conecta a Supabase; toda la lógica pasa por la API. Todas las tablas tienen RLS activado sin políticas y se revocan los permisos de los roles `anon`/`authenticated`, de modo que la Data API de Supabase no las expone. | Ubicación de datos y contrato de transmisión internacional (Ley 1581/2012) antes de usar datos reales. |
| 10 | **Zona horaria** | Todo se calcula en `America/Bogota` (UTC-5, sin horario de verano) y se almacena como `timestamptz`. | — |
| 11 | **Festivos, ausencias, bloqueos de agenda** | Fuera de alcance del MVP. | Necesario para producción. |

## 3. Arquitectura propuesta

**Monolito modular** — un solo backend desplegable, organizado por módulos de dominio con fronteras
claras que después podrían extraerse si fuera necesario (no se esperan microservicios).

```
┌────────────────────────── Navegador ──────────────────────────┐
│  SPA React (Vite)                                              │
│   /             Portal del paciente (público)                  │
│   /admisiones   Panel de Admisiones (carga diferida, login)    │
└──────────────────────────────┬─────────────────────────────────┘
                               │ HTTPS · JSON · cookie httpOnly (JWT)
┌──────────────────────────────▼─────────────────────────────────┐
│  API Node.js + Express (monolito modular)                      │
│   middleware: helmet · rate-limit · auth (JWT) · RBAC · errores │
│   módulos:                                                     │
│    auth          login/logout/me                               │
│    public        solicitud del paciente, consulta de estado    │
│    catalog       especialidades, profesionales, disponibilidad │
│    appointments  gestión, máquina de estados, calendario       │
│    admin         usuarios, auditoría                           │
│    audit         servicio transversal de auditoría             │
│    integrations  saludsystem12 (manual) · notifications (outbox│
│                  para WhatsApp futuro, sin envío real)         │
└──────────────────────────────┬─────────────────────────────────┘
                               │ SQL (driver pg, TLS)
┌──────────────────────────────▼─────────────────────────────────┐
│  PostgreSQL en Supabase — RLS activado, sin acceso anon/Data API│
└────────────────────────────────────────────────────────────────┘
```

### Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React 18 + Vite + React Router | Estándar, rápido, un solo bundle con el panel cargado en diferido |
| Calendario | FullCalendar (vistas día/semana/mes, licencia MIT) | Maduro, práctico para agendas |
| Backend | Node.js + Express | Simple, conocido, suficiente para el MVP |
| Validación | Zod | Validación declarativa de todas las entradas |
| BD | PostgreSQL (Supabase) con driver `pg` y SQL plano | Las reglas críticas (no doble reserva, estados válidos) se expresan como restricciones SQL (índice único parcial, CHECK) que un ORM no expresa bien; el mismo SQL se puede leer y ejecutar en el editor SQL de Supabase |
| Autenticación | JWT firmado en cookie `httpOnly`, `SameSite=Strict` | El token nunca es accesible desde JavaScript |
| Contraseñas | bcrypt (costo 12) | Nunca en texto plano |
| Seguridad HTTP | helmet, express-rate-limit, CORS restringido | Endurecimiento básico |

**Por qué no Supabase Auth / supabase-js en el frontend:** el requerimiento pide no conectar el
frontend directamente a la base de datos; además, así la lógica de estados, RBAC y auditoría queda
centralizada en un solo lugar y la migración a otro PostgreSQL (on-premise, otra nube) es trivial.

## 4. Seguridad y RBAC

| Rol | Cómo se autentica | Puede |
|---|---|---|
| **PACIENTE** (público) | No tiene cuenta. Código de solicitud + documento para consultar | Crear solicitud, consultar el estado de *su* solicitud |
| **ADMISIONISTA** | Usuario/contraseña | Ver/gestionar solicitudes, calendario, disponibilidad, historial |
| **ADMINISTRADOR** | Usuario/contraseña | Todo lo anterior + usuarios + consulta de auditoría |

Permisos (tabla `permissions`, asignados por rol en `role_permissions`):

| Permiso | ADMISIONISTA | ADMINISTRADOR |
|---|:-:|:-:|
| `appointments:read` | ✅ | ✅ |
| `appointments:manage` | ✅ | ✅ |
| `calendar:read` | ✅ | ✅ |
| `users:manage` | — | ✅ |
| `audit:read` | — | ✅ |

- Los permisos se consultan en BD en cada petición (un usuario desactivado pierde acceso de inmediato).
- Cada acceso denegado (401/403) queda en auditoría.
- La consulta pública de estado devuelve datos mínimos y enmascarados, y está limitada por tasa.
- Los secretos (`JWT_SECRET`, `DATABASE_URL`) solo existen en `server/.env`, nunca en el frontend.

## 5. Modelo de datos

Se revisó la lista sugerida. Resultado:

| Entidad | ¿Se incluye? | Motivo |
|---|---|---|
| users | ✅ | Personal de la clínica (no pacientes) |
| roles, permissions, role_permissions | ✅ | RBAC explícito y auditable; permite ajustar permisos sin cambiar código |
| patients | ✅ | Solo datos de contacto/identificación. **Cero datos clínicos** |
| specialties | ✅ | Incluye duración del turno y si pide motivo |
| professionals | ✅ | Un profesional → una especialidad (suficiente para el MVP) |
| schedules | ✅ | Agenda semanal recurrente por profesional |
| appointments | ✅ | Es la "solicitud/cita" (un solo registro con estados) |
| appointment_status_history | ✅ | Trazabilidad funcional (lo que ve Admisiones) |
| audit_logs | ✅ | Auditoría técnica (quién, qué, cuándo, resultado, IP) |
| notification_outbox | ✅ (nueva) | Deja preparada la integración con WhatsApp: los eventos quedan en cola con estado `SIMULADO`, sin enviarse |
| Solicitud ≠ cita en tablas separadas | ❌ | Duplicaría datos; los estados ya distinguen solicitud de cita |

```
roles 1─* role_permissions *─1 permissions
roles 1─* users
specialties 1─* professionals 1─* schedules
patients 1─* appointments *─1 professionals
                appointments *─1 specialties
                appointments *─1 users (assigned_to)
appointments 1─* appointment_status_history *─1 users (changed_by, nulo = portal)
appointments 1─* notification_outbox
users 1─* audit_logs (nulo = anónimo/portal)
```

Restricciones clave:

- `patients (document_type, document_number)` único.
- `appointments.code` único, generado por secuencia: `SOL-000001`.
- **Índice único parcial** `(professional_id, start_at) WHERE status <> 'CANCELADA'` → la base de
  datos impide la doble reserva aunque dos personas pidan el mismo turno al mismo tiempo.
- `CHECK` sobre los estados y tipos de documento válidos; `end_at > start_at`.
- `reason` máximo 200 caracteres.

Detalle completo: [`server/src/db/migrations/001_init.sql`](../server/src/db/migrations/001_init.sql).

### Máquina de estados

```
PENDIENTE ──tomar──► EN_GESTION ──confirmar──► CONFIRMADA ──registrar──► REGISTRADA_EN_SALUDSYSTEM12
    │                    │                        │  ▲                           │
    │                    │                        ▼  │confirmar                  │
    │                    └──reprogramar──►  REPROGRAMADA ◄──reprogramar──────────┘
    └──────── cancelar (desde cualquier estado no final) ──────► CANCELADA
```

No se añadieron estados adicionales: los 6 pedidos cubren el flujo. (Posibles en el futuro:
`ATENDIDA`, `NO_ASISTIO`, pero corresponden a SaludSystem12.)

## 6. Alcance del MVP

**Incluido:** portal del paciente (solicitud + consulta de estado), login de personal, dashboard,
bandeja de solicitudes con búsqueda y filtros, detalle con historial, acciones (tomar, confirmar,
reprogramar, cancelar, registrar en SaludSystem12), calendario día/semana/mes con filtros,
disponibilidad, administración de usuarios, consulta de auditoría, cola simulada de notificaciones,
datos ficticios.

**Explícitamente fuera de alcance:** integración real con SaludSystem12 o WhatsApp, historia clínica,
diagnósticos, prescripción, pagos, convenios/EPS/autorizaciones, festivos y bloqueos de agenda, cuentas
de paciente, OTP, administración de agendas desde la UI, reportes, despliegue a producción.
