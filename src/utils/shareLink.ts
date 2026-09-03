/**
 * D13: a scene's shareable link is just a URL addressing its `id` — no
 * separate "create link" step exists anywhere server-side (`M6.3`'s own
 * memory note). This is the one place that URL shape (`/scene/:id`) is
 * parsed; `M6.7`'s Share popover should build a link with this same
 * shape when it constructs one to copy.
 */
const SHARE_LINK_PATTERN = /^\/scene\/([^/]+)\/?$/

export function parseShareLinkId(pathname: string): string | null {
  return SHARE_LINK_PATTERN.exec(pathname)?.[1] ?? null
}
