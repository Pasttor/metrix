# Metrix para Claude (servidor MCP)

Metrix expone un servidor MCP remoto en `https://metrix-swart-mu.vercel.app/api/mcp` (Streamable HTTP, `mcp-handler` 2 + MCP SDK v2). Claude lo usa para leer todos los datos que guarda Metrix, hacer reportes, sugerir mejoras a guiones y hooks, y programar publicaciones.

## Conectar

- **Claude (web, escritorio, celular):** Configuración → Conectores → Agregar conector personalizado → URL de arriba → Conectar → aceptar en «Conectar Claude con Metrix».
- **Claude Code:** `claude mcp add --transport http metrix https://metrix-swart-mu.vercel.app/api/mcp` y después `/mcp` para iniciar sesión.
- Los accesos activos se ven y se quitan en **Configuración → Claude**.

## Autorización (OAuth 2.1 propio, un solo usuario)

| Pieza | Ruta |
|---|---|
| Protected Resource Metadata (RFC 9728) | `/.well-known/oauth-protected-resource` y `/.well-known/oauth-protected-resource/api/mcp` |
| Authorization Server Metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Registro dinámico (RFC 7591) | `POST /api/oauth/register` |
| Autorización + consentimiento | `/oauth/authorize` (detrás del login de Metrix) |
| Token | `POST /api/oauth/token` (`authorization_code` con PKCE S256, `refresh_token` con rotación) |

- Clientes públicos solamente (`token_endpoint_auth_method=none`), registrados por DCR o identificados por CIMD (solo documentos en `claude.ai` / `claude.com`).
- Redirecciones aceptadas: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` y loopback (`http://localhost`/`127.0.0.1`, cualquier puerto) para Claude Code.
- Códigos de un solo uso (10 min). Access token 1 h, refresh token 90 días con rotación; si se reutiliza un refresh token viejo se revoca todo el acceso.
- Solo se guardan hashes SHA-256 (`mcp_auth_codes`, `mcp_tokens`); tablas solo para service_role. `mcp_grants` es legible por el usuario permitido (página de Configuración).
- Sin token válido, `/api/mcp` responde `401` con `WWW-Authenticate: Bearer resource_metadata=...`, que inicia el inicio de sesión en Claude.

## Herramientas

Lectura: `resumen_general`, `listar_cuentas`, `catalogo_metricas`, `metricas_cuenta`, `listar_publicaciones`, `detalle_publicacion` (retención, tasa de salto, fuentes, búsquedas, audiencia), `audiencia`, `reporte_contenido`, `competencia`, `alertas`, `publicaciones_programadas`, `videos_drive`.

Escritura: `programar_publicacion`, `cancelar_publicacion`, `reintentar_publicacion`. Usan la misma lógica que `/publicar` (`src/lib/publishing/commands.ts`, `scheduling.ts`).

Prompts: `reporte_semanal`, `mejorar_hook`.

Límite de `drive.file`: Claude solo puede publicar videos que el usuario ya eligió alguna vez en Publicar → Elegir de Google Drive (`videos_drive` los lista). No se piden permisos de Drive más amplios.

Código: `src/lib/mcp-oauth/` (núcleo probado con almacén en memoria), `src/lib/mcp/` (datos y herramientas), `src/app/api/mcp/route.ts`.
