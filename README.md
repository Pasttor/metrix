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

Las instrucciones completas de instalación y despliegue llegan en T17.
