// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/youtube", search: "range=90" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { RangeSelector } from "./range-selector";
import { SidebarNav } from "./sidebar-nav";

afterEach(cleanup);

describe("SidebarNav", () => {
  it("keeps the selected range on every link", () => {
    navigation.search = "range=90";
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("/instagram?range=90");
    expect(screen.getByRole("link", { name: "Resumen" }).getAttribute("href")).toBe("/?range=90");
  });

  it("marks the current section", () => {
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "YouTube" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "TikTok" }).getAttribute("aria-current")).toBeNull();
  });

  it("uses clean URLs for the default range", () => {
    navigation.search = "";
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("/instagram");
  });
});

describe("RangeSelector", () => {
  it("links each period to the current page", () => {
    navigation.search = "range=90";
    render(<RangeSelector />);
    expect(screen.getByRole("link", { name: "Últimos 7 días" }).getAttribute("href")).toBe("/youtube?range=7");
    expect(screen.getByRole("link", { name: "Últimos 28 días" }).getAttribute("href")).toBe("/youtube");
    expect(screen.getByRole("link", { name: "Últimos 90 días" }).getAttribute("aria-current")).toBe("true");
  });
});
