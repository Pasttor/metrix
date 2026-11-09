import { createMcpHandler } from "mcp-handler";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ REPORT_TIMEZONE: "America/Mexico_City" }) }));
vi.mock("./data", () => ({
  DATA_PLATFORMS: ["youtube", "instagram", "facebook", "tiktok"],
  today: () => "2026-11-09",
  listAccounts: vi.fn(async () => [{ platform: "youtube", name: "Canal", status: "active" }]),
  accountMetrics: vi.fn(async (platform: string, from: string, to: string) => ({ platform, from, to, days: [] })),
  schedulePost: vi.fn(async () => ({ ok: true, postId: "p1", scheduledAt: "2026-11-10T15:30:00.000Z" })),
  postDetail: vi.fn(async () => null),
}));

const data = await import("./data");
const { registerMetrixTools } = await import("./server");

const handler = createMcpHandler(registerMetrixTools, { serverInfo: { name: "metrix", version: "test" } });

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await handler(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await response.text();
  // Stateless Streamable HTTP may answer as JSON or as one SSE event.
  const payload = text.startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data: ")) ?? "").slice(6);
  return JSON.parse(payload) as { result?: Record<string, unknown>; error?: unknown };
}

describe("Metrix MCP server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the read and publish tools", async () => {
    const { result } = await rpc("tools/list");
    const names = (result?.tools as { name: string }[]).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["resumen_general", "metricas_cuenta", "listar_publicaciones", "detalle_publicacion", "reporte_contenido", "videos_drive", "programar_publicacion", "cancelar_publicacion"]),
    );
    const schedule = (result?.tools as { name: string; annotations?: Record<string, boolean> }[]).find((tool) => tool.name === "programar_publicacion");
    expect(schedule?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });

  it("returns tool data as JSON text with defaults applied", async () => {
    const { result } = await rpc("tools/call", { name: "metricas_cuenta", arguments: { red: "youtube" } });
    expect(data.accountMetrics).toHaveBeenCalledWith("youtube", "2026-10-12", "2026-11-09", undefined);
    expect(JSON.parse((result?.content as { text: string }[])[0].text)).toMatchObject({ platform: "youtube", from: "2026-10-12" });
  });

  it("maps 'ahora' to an immediate publish", async () => {
    await rpc("tools/call", { name: "programar_publicacion", arguments: { drive_file_id: "abc", texto: "Hola", redes: ["instagram"], cuando: "ahora" } });
    expect(data.schedulePost).toHaveBeenCalledWith(expect.objectContaining({ when: "now", networks: ["instagram"] }));
  });

  it("reports errors as tool errors, not crashes", async () => {
    const { result } = await rpc("tools/call", { name: "detalle_publicacion", arguments: { id: "00000000-0000-4000-8000-000000000000" } });
    expect(result).toMatchObject({ isError: true });
    expect((result?.content as { text: string }[])[0].text).toContain("No existe");
  });

  it("validates arguments", async () => {
    const response = await rpc("tools/call", { name: "metricas_cuenta", arguments: { red: "myspace" } });
    expect(response.error ?? response.result?.isError).toBeTruthy();
  });
});
