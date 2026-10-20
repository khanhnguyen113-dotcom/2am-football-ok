import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hiddenFeatureRedirect } from "@/lib/features";
import { proxy } from "@/proxy";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser } }) }));

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null } });
});

describe("funds-only mode", () => {
  it.each(["/", "/matches", "/matches/example", "/members", "/members/example", "/stats", "/events"])("hides %s behind the fund dashboard", async (path) => {
    const result = await proxy(new NextRequest(`https://example.test${path}?old=1`));
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://example.test/funds");
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(["/funds", "/funds/pay", "/funds/penalty", "/donate", "/admin/funds", "/admin/settings", "/admin/login"])("keeps %s available", (path) => {
    expect(hiddenFeatureRedirect(path)).toBeNull();
  });

  it("redirects hidden admin pages to fund administration", async () => {
    const result = await proxy(new NextRequest("https://example.test/admin/matches/123"));
    expect(result.headers.get("location")).toBe("https://example.test/admin/funds");
  });

  it("still requires a session to access fund administration", async () => {
    const result = await proxy(new NextRequest("https://example.test/admin/funds"));
    expect(getUser).toHaveBeenCalledOnce();
    expect(result.headers.get("location")).toBe("https://example.test/admin/login");
  });

  it("keeps login and authenticated fund pages free of redirect loops", async () => {
    expect((await proxy(new NextRequest("https://example.test/admin/login"))).headers.get("location")).toBeNull();
    getUser.mockResolvedValue({ data: { user: { id: "existing-admin" } } });
    expect((await proxy(new NextRequest("https://example.test/admin/funds"))).headers.get("location")).toBeNull();
  });
});
