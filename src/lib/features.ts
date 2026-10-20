// Set to false and redeploy to restore the full app. No data or modules are removed.
export const FUNDS_ONLY_MODE = true;

export function isFundRoute(path: string): boolean {
  return ["/funds", "/donate", "/admin/funds", "/admin/settings", "/admin/login"]
    .some((base) => path === base || path.startsWith(`${base}/`));
}

export function hiddenFeatureRedirect(path: string): string | null {
  if (!FUNDS_ONLY_MODE || isFundRoute(path)) return null;
  return path === "/admin" || path.startsWith("/admin/") ? "/admin/funds" : "/funds";
}
