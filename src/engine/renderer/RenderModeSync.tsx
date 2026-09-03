import { useFrame } from '@react-three/fiber'
import type { Material, Mesh } from 'three'
import { useRenderModeStore } from '../../state/renderModeStore'

function isToggleable(material: Material): boolean {
  // Chrome with a custom shader (drei's <Grid>, in particular) draws its
  // own procedural pattern via UV math, not via mesh edges — forcing
  // `.wireframe` on it would replace the intended grid pattern with the
  // plane's raw two-triangle outline. Standard materials (what every real
  // scene object, built-in or uploaded, will use) render correctly either
  // way, so only those respond to the toggle.
  return material.type !== 'ShaderMaterial' && material.type !== 'RawShaderMaterial'
}

/**
 * Applies the global render mode (M1.4, spec §8: solid/wireframe, "not
 * per-object") to every mesh in the scene, every frame — not only on mode
 * change — so a mesh added later by any future task (M2.2's built-ins,
 * M5's uploads) picks up the current mode immediately with no additional
 * per-object wiring, per this task's own requirement.
 */
export function RenderModeSync() {
  useFrame((state) => {
    const wireframe = useRenderModeStore.getState().mode === 'wireframe'

    state.scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if (material && isToggleable(material) && 'wireframe' in material) {
          ;(material as Material & { wireframe: boolean }).wireframe = wireframe
        }
      }
    })
  })

  return null
}
