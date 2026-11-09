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

## Despliegue (Vercel)

1. Importa el repo en Vercel (plan Hobby). Los crons de `vercel.json` corren una vez al día por red.
2. Variables de entorno: las mismas de `.env.local`, con `APP_URL` = la URL de producción (`https://<proyecto>.vercel.app`).
3. Supabase → Authentication → URL Configuration: Site URL = `APP_URL`; Redirect URLs: `APP_URL/auth/confirm` y `http://localhost:3000/**`.
4. Google Cloud (cliente OAuth) y Meta (Facebook Login for Business): agrega `APP_URL/api/connect/youtube/callback` y `APP_URL/api/connect/meta/callback`.
5. Páginas públicas para las pantallas de consentimiento: `APP_URL/acerca` (página principal) y `APP_URL/privacidad` (política de privacidad y eliminación de datos, `#eliminacion`).
