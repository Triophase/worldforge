const LAST_ACTIVE_SCENE_ID_KEY = 'cad-simulator:last-active-scene-id'

/**
 * D43: "last-active" means last-**opened**, not last-updated — a plain
 * `localStorage` pointer, alongside D18's `deviceId`. Deliberately a
 * pair of plain functions, not a store — nothing needs to reactively
 * observe it, only read it once at boot and write it at the four
 * trigger points D14/`M6.9`'s own Scope names (My Scenes Open, opening
 * an owned share link, forking, and a draft's first successful Save).
 */
export function getLastActiveSceneId(): string | null {
  return localStorage.getItem(LAST_ACTIVE_SCENE_ID_KEY)
}

export function setLastActiveSceneId(id: string): void {
  localStorage.setItem(LAST_ACTIVE_SCENE_ID_KEY, id)
}
