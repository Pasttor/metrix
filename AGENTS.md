<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Metrix

Metrix es un dashboard **personal y de un solo usuario** de métricas de redes sociales (YouTube, Instagram, Facebook, TikTok). Solo **lee** métricas por APIs oficiales, guarda una foto diaria en Postgres y las muestra. No publica contenido.

El plan de trabajo completo, con el orden de tareas y sus criterios de aceptación, está en `docs/PLAN.md`. Trabaja **una tarea a la vez** (T00, T01…) y no adelantes trabajo de tareas futuras.

## Stack

- Next.js 16 (App Router) + TypeScript en modo `strict`
- Supabase: Postgres, Auth (magic link) y CLI para migraciones
- Despliegue en Vercel (plan Hobby) con Vercel Cron
- Tailwind CSS + shadcn/ui para la interfaz; Recharts para gráficas
- Zod para validar respuestas de APIs y variables de entorno
- Vitest para pruebas; pnpm como gestor de paquetes
- Resend para correos de alerta (opcional, T16)

## Comandos

```bash
pnpm install          # dependencias
pnpm dev              # servidor local en http://localhost:3000
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest (sin llamadas reales a APIs)
pnpm db:push          # aplica migraciones nuevas + seed al proyecto de Supabase enlazado
pnpm db:types         # regenera src/lib/db/types.ts desde el proyecto de Supabase
pnpm db:config        # copia ALLOWED_EMAIL de .env.local a app_config (lo usa RLS)
pnpm auth:link        # solo local: imprime un enlace de acceso sin mandar correo
```

No se usa Docker ni Supabase local: las migraciones van directo al proyecto en la nube. Las pruebas de base de datos corren las migraciones en PGlite (Postgres en memoria) dentro de Vitest. `db:push` y `db:types` requieren una vez `pnpm exec supabase login` y `pnpm exec supabase link --project-ref <ref>`.

Antes de dar una tarea por terminada, `pnpm lint && pnpm typecheck && pnpm test` deben pasar sin errores.

## Estructura

```
src/
  app/
    (dashboard)/             # páginas protegidas: /, /youtube, /instagram, /facebook, /tiktok, /settings
    login/                   # login por magic link
    api/
      connect/[platform]/    # inicio y callback de OAuth
      cron/                  # rutas que llama Vercel Cron (protegidas con CRON_SECRET)
      sync/                  # backfill manual por bloques
      webhooks/meta/         # webhook de Meta (story_insights)
  components/                # UI compartida (shadcn/ui en components/ui)
  lib/
    env.ts                   # variables de entorno validadas con Zod
    crypto.ts                # cifrado AES-256-GCM de tokens
    db/                      # cliente Supabase (server/admin) y tipos generados
    oauth/                   # state, PKCE y almacenamiento de tokens
    sync/                    # runner genérico, registro en sync_runs, reintentos
    metrics/                 # catálogo unificado, cálculos (engagement, deltas)
    platforms/
      youtube/               # client.ts, sync.ts, schemas.ts
      meta/                  # client.ts, instagram.ts, facebook.ts, webhook.ts
      tiktok/                # client.ts, sync.ts, schemas.ts
supabase/
  migrations/                # SQL versionado; nunca edites una migración ya aplicada
  seed.sql                   # metric_catalog inicial (idempotente)
scripts/                     # utilidades de mantenimiento (db:config)
tests/
  db/                        # pruebas de esquema y RLS con PGlite
  fixtures/                  # respuestas JSON de ejemplo de cada API
docs/
  PLAN.md                    # plan de tareas
```

## Convenciones

- Código, nombres y comentarios en **inglés**; toda la interfaz visible en **español (México)**.
- Fechas: guarda en UTC (`timestamptz`) y la fecha de reporte de cada plataforma como `date`. Muestra en `America/Mexico_City`.
- Las métricas se guardan en **formato largo** (una fila por métrica y fecha). Nunca agregues una columna por métrica.
- Cada llamada a una API externa pasa por el `client.ts` de su plataforma, que valida la respuesta con Zod, maneja paginación y reintenta con backoff exponencial en 429/5xx.
- Una métrica que la API rechaza por inválida o retirada **no rompe la sincronización**: se registra en `sync_runs.stats.warnings` y se sigue con las demás.
- Distingue "sin datos" de cero: si la API devuelve un conjunto vacío, no escribas `0`.
- Las escrituras a la base son idempotentes (`upsert` por llave primaria) para poder repetir cualquier sincronización.
- Server Components y Route Handlers para todo lo que toque tokens; nada sensible llega al cliente.
- Componentes pequeños; la lógica de negocio va en `src/lib`, no en las páginas.

## Prohibido

- Registrar en logs, devolver al cliente o guardar sin cifrar cualquier token, secreto o código OAuth.
- Subir al repo `.env*` con valores reales (solo `.env.example`).
- Usar scraping, APIs no oficiales o servicios de terceros que extraigan datos de las redes.
- Llamar APIs reales en pruebas: usa fixtures en `tests/fixtures` y `fetch` simulado.
- Editar migraciones ya aplicadas: crea una nueva. Cada tabla nueva necesita `grant` explícitos para `service_role` (y `select` para `authenticated` si el dashboard la lee): Supabase ya no los da por defecto.
- Desactivar RLS en cualquier tabla.
- Agregar funciones de publicación o de escritura en las redes sociales.
- Instalar dependencias grandes sin justificarlo en la descripción del PR.

## Definición de terminado

1. Se cumplen todos los criterios de aceptación de la tarea en `docs/PLAN.md`.
2. `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.
3. Las variables nuevas están en `.env.example` y en `src/lib/env.ts`.
4. Si cambió el esquema, hay migración nueva y `src/lib/db/types.ts` regenerado.
5. El PR describe qué se hizo, cómo probarlo a mano y qué quedó pendiente o con dudas, por ejemplo una métrica cuyo nombre no se pudo confirmar en la documentación oficial.
