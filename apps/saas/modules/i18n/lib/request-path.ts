/**
 * The request's own path and query, as the proxy saw it (`proxy.ts`): a layout can't read its
 * own path, and the authenticated layout needs it to send an office member to the same page in
 * the office language (ADR 0025). The proxy always overwrites it, so a client can't set it.
 */
export const REQUEST_PATH_HEADER = "x-nhip-path";
