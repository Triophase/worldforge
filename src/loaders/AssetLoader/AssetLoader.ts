import { loadGLTF } from '../GLTFLoader/GLTFLoader'
import { loadOBJ } from '../OBJLoader/OBJLoader'
import { loadSTL } from '../STLLoader/STLLoader'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import type { AssetFormat, AssetLoadErrorReason, FormatLoader } from './types'
import { AssetLoadError } from './types'

/** D11: the per-file cap, enforced client-side, before any parse attempt. Strictly *over* rejects — exactly 25MB is accepted. */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024

/**
 * idea.md §11/spec §12's target format list, **minus `.fbx`** — cut per
 * §12's own explicit allowance (`.ai/decisions.md`'s `M5.4` entry: no
 * Three.js-ecosystem FBX exporter exists to generate a verifiable test
 * fixture against, and hand-authoring one is disproportionate to a
 * fourth, "supported"-not-"first-class" format). The OS file picker no
 * longer suggests `.fbx` directly; `detectFormat`/`AssetFormat` still
 * recognize the extension so a file forced through anyway (e.g. via "all
 * files") still gets an accurate, typed rejection below, not a crash.
 */
export const UPLOAD_ACCEPT = '.glb,.gltf,.stl,.obj'

/**
 * `null` for any extension the app doesn't recognize (e.g. a `.png`
 * forced through via the OS picker's "all files" option, per M5.6's own
 * acceptance criteria) — routes to the same `'unsupported'` rejection as
 * a recognized-but-unimplemented format like `.fbx`, rather than
 * silently guessing `'gltf'` and feeding unrelated bytes to that parser.
 */
export function detectFormat(filename: string): AssetFormat | null {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'glb':
      return 'glb'
    case 'gltf':
      return 'gltf'
    case 'stl':
      return 'stl'
    case 'obj':
      return 'obj'
    case 'fbx':
      return 'fbx'
    default:
      return null
  }
}

/** One loader per supported format (`types.ts`'s `FormatLoader` contract, §12's "modular" requirement). FBX is permanently cut — see `.ai/decisions.md`'s `M5.4` entry. */
export const FORMAT_LOADERS: Partial<Record<AssetFormat, FormatLoader>> = {
  glb: loadGLTF,
  gltf: loadGLTF,
  stl: loadSTL,
  obj: loadOBJ,
}

/**
 * §25's three safe, canned, display-ready messages — the **only** copy
 * ever shown for a failed upload. A raw loader/parser exception
 * (`AssetLoadError.message`, or any other thrown `Error`'s `.message`)
 * is deliberately never read here or anywhere downstream — mapping by
 * `reason` alone is what guarantees no stack trace or parser-internal
 * string can reach the UI, regardless of what a given loader happens to
 * throw.
 */
export function uploadErrorMessage(reason: AssetLoadErrorReason | 'oversized', fileName: string): string {
  switch (reason) {
    case 'oversized':
      return `"${fileName}" is over the 25MB upload limit. Try a smaller file.`
    case 'unsupported':
      return `"${fileName}" isn't a supported format. Upload a .glb, .gltf, .stl, or .obj file.`
    case 'corrupt':
      return `"${fileName}" couldn't be read — the file may be corrupt or damaged.`
  }
}

/**
 * The parse pipeline's entry point — dispatches by extension to the one
 * loader implementing `types.ts`'s `FormatLoader` contract for that
 * format. `.fbx` (cut, `M5.4`) rejects with `'unsupported'` — an
 * explicit, typed rejection rather than a silent no-op, so forcing one
 * through is observable, not just inert.
 *
 * §24: progress advances in three coarse, stage-based checkpoints —
 * `0` the moment parsing starts (the size pre-check already passed, in
 * `handleFileSelected`), `66` once the loader's promise resolves/
 * rejects (parse itself is the one long-running, unobservable-mid-way
 * step), `100` once the result is recorded in the store — then reset to
 * `null` on the next microtask-free tick via `setUploadError`/`addUpload`
 * observers. Kept determinate throughout (never an indeterminate
 * spinner) per §24, even though no loader here exposes real byte-level
 * progress for an in-memory `File` (`M5.5`'s memory note).
 */
export function parseUploadedFile(file: File): void {
  useUploadedAssetsStore.getState().setProgress(0)

  const format = detectFormat(file.name)
  const loader = format ? FORMAT_LOADERS[format] : undefined

  const parsed = loader
    ? loader(file)
    : Promise.reject(new AssetLoadError('unsupported', `"${file.name}" isn't a supported format.`))

  parsed
    .then((result) => {
      useUploadedAssetsStore.getState().setProgress(66)
      useUploadedAssetsStore.getState().addUpload({ id: crypto.randomUUID(), file, ...result })
      useUploadedAssetsStore.getState().setProgress(null)
    })
    .catch((error: unknown) => {
      const reason = error instanceof AssetLoadError ? error.reason : 'corrupt'
      useUploadedAssetsStore.getState().setUploadError(uploadErrorMessage(reason, file.name), reason)
    })
}

/**
 * The one shared upload entry point (§12) — both the Assets panel's
 * "+ Upload Asset" and the empty state's "Upload CAD" call this same
 * function on file selection, never a duplicated handler. Runs D11's
 * size check before anything else (no read of file contents beyond the
 * `File` object's own `size` property); a file over the cap is
 * rejected — `parse` is never invoked and the rejection is recorded in
 * `uploadedAssetsStore` for the UI to observe. `parse` defaults to the
 * real `parseUploadedFile` above; tests substitute a spy so the
 * "invoked exactly once" acceptance criterion doesn't depend on
 * module-export spy interception (unreliable across bundler/test-
 * transform combinations).
 */
export function handleFileSelected(file: File, parse: (file: File) => void = parseUploadedFile): void {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    useUploadedAssetsStore.getState().setUploadError(uploadErrorMessage('oversized', file.name), 'oversized')
    return
  }
  useUploadedAssetsStore.getState().clearUploadError()
  parse(file)
}
