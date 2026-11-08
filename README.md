# Metrix

Dashboard personal de métricas de YouTube, Instagram, Facebook y TikTok.

- Reglas del repo: [`AGENTS.md`](AGENTS.md)
- Plan de tareas: [`docs/PLAN.md`](docs/PLAN.md)

## Arranque local

```bash
pnpm install
cp .env.example .env.local   # y llena los valores requeridos
pnpm dev
```

La app no arranca si falta una variable requerida (`src/lib/env.ts`).

Para entrar en local sin esperar el correo (el servicio de correo incluido en Supabase manda muy pocos por hora), corre `pnpm auth:link` y abre el enlace que imprime. Es de un solo uso y caduca pronto.

## Base de datos (sin Docker)

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref-del-proyecto>
pnpm db:push      # migraciones + seed
pnpm db:config    # guarda ALLOWED_EMAIL en app_config
pnpm db:types     # regenera src/lib/db/types.ts
```

Las instrucciones completas de instalación y despliegue llegan en T17.
