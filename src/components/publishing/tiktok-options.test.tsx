// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreatorInfoResult } from "@/app/(dashboard)/publicar/actions";
import type { TikTokCreator } from "@/lib/publishing/options";

const CREATOR: TikTokCreator = {
  nickname: "Metrix",
  username: "metrix_test",
  avatarUrl: null,
  privacyOptions: ["PUBLIC_TO_EVERYONE", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
  commentDisabled: false,
  duetDisabled: true,
  stitchDisabled: false,
  maxDurationSec: 60,
};

vi.mock("@/app/(dashboard)/publicar/actions", () => ({
  tiktokCreatorAction: vi.fn(async () => ({ ok: true, creator: CREATOR })),
}));

import { EMPTY_TIKTOK, TikTokOptions, tiktokBlocker, type TikTokChoices } from "./tiktok-options";

afterEach(cleanup);

function Harness({ onState }: { onState?: (choices: TikTokChoices) => void }) {
  const [choices, setChoices] = useState(EMPTY_TIKTOK);
  const [creator, setCreator] = useState<CreatorInfoResult | null>(null);
  return (
    <TikTokOptions
      accountId="acc"
      choices={choices}
      onChange={(next) => {
        setChoices(next);
        onState?.(next);
      }}
      creator={creator}
      onCreator={setCreator}
    />
  );
}

describe("TikTokOptions", () => {
  it("shows the creator, no preselected privacy and unchecked interactions", async () => {
    render(<Harness />);
    expect(await screen.findByText("Metrix")).toBeTruthy();
    const privacy = screen.getByLabelText("¿Quién puede ver este video?") as HTMLSelectElement;
    expect(privacy.value).toBe("");
    expect(Array.from(privacy.options).map((option) => option.textContent)).toEqual(["Elige una opción", "Todos", "Seguidores", "Solo yo"]);
    expect((screen.getByLabelText("Comentar") as HTMLInputElement).checked).toBe(false);
    // Disabled in the creator's TikTok settings: greyed out.
    expect((screen.getByLabelText(/Dúo/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Confirmación de uso de música/)).toBeTruthy();
  });

  it("asks what the commercial content promotes and labels it", async () => {
    const states: TikTokChoices[] = [];
    render(<Harness onState={(choices) => states.push(choices)} />);
    await screen.findByText("Metrix");
    fireEvent.change(screen.getByLabelText("¿Quién puede ver este video?"), { target: { value: "SELF_ONLY" } });
    fireEvent.click(screen.getByRole("switch"));
    // Branded content cannot be private.
    expect((screen.getByLabelText(/Contenido de marca/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Tu marca/));
    expect(screen.getByText(/Contenido promocional/)).toBeTruthy();
    expect(states.at(-1)).toMatchObject({ privacyLevel: "SELF_ONLY", commercial: true, yourBrand: true, brandedContent: false });
  });
});

describe("tiktokBlocker", () => {
  const ready: TikTokChoices = { ...EMPTY_TIKTOK, privacyLevel: "PUBLIC_TO_EVERYONE" };
  const creator: CreatorInfoResult = { ok: true, creator: CREATOR };

  it("blocks until every required choice is made", () => {
    expect(tiktokBlocker(ready, null, null)).toContain("Consultando");
    expect(tiktokBlocker(ready, { ok: false, message: "Bloqueada" }, null)).toBe("Bloqueada");
    expect(tiktokBlocker(EMPTY_TIKTOK, creator, null)).toContain("Elige quién");
    expect(tiktokBlocker({ ...ready, commercial: true }, creator, null)).toContain("tu marca, a un tercero");
    expect(tiktokBlocker(ready, creator, 90)).toContain("hasta 60 s");
    expect(tiktokBlocker(ready, creator, 30)).toBeNull();
    expect(tiktokBlocker(ready, creator, null)).toBeNull();
  });
});
