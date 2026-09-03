/**
 * `FileReader`, not `File.prototype.arrayBuffer()`/`.text()` — jsdom's
 * `File`/`Blob` polyfill has no working modern Blob-spec read methods
 * (confirmed, `M5.2`: both are `undefined`, and even Node's own global
 * `Response` can't read jsdom `File` content either, since jsdom's
 * `File` isn't backed by whatever internal shape `undici` expects), but
 * jsdom's older `FileReader` implementation reads real content
 * correctly. `FileReader` works identically in real browsers, so this
 * isn't a test-only shim — every format loader reads its `File` through
 * these two shared helpers, not the modern Blob-spec methods.
 */
export function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))
    reader.readAsArrayBuffer(file)
  })
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))
    reader.readAsText(file)
  })
}

/**
 * `M7.1`: base64 content for an Export's embedded `assets` entry (D22).
 * `readAsDataURL`'s result is `"data:<mime>;base64,<data>"` — only the
 * part after the first comma is the base64 payload itself.
 */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}
