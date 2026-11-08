// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

// The real action imports server-only code.
vi.mock("./actions", () => ({ sendMagicLink: vi.fn() }));

import { LoginForm } from "./login-form";

afterEach(cleanup);

describe("LoginForm", () => {
  it("shows 'Acceso no autorizado' after an unauthorized session is closed", () => {
    navigation.search = "error=unauthorized";
    render(<LoginForm />);
    expect(screen.getByRole("alert").textContent).toBe("Acceso no autorizado.");
  });

  it("explains an invalid or expired link", () => {
    navigation.search = "error=link";
    render(<LoginForm />);
    expect(screen.getByRole("alert").textContent).toMatch(/caducó/);
  });

  it("carries the next path to the action", () => {
    navigation.search = "next=%2Fyoutube%3Frange%3D7";
    const { container } = render(<LoginForm />);
    const hidden = container.querySelector<HTMLInputElement>('input[name="next"]');
    expect(hidden?.value).toBe("/youtube?range=7");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
