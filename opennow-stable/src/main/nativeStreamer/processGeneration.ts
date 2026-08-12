/**
 * Determines whether an asynchronous child-process callback still belongs to
 * the process generation currently owned by NativeStreamerManager.
 */
export function isCurrentNativeStreamerProcess<T>(
  currentChild: T | null,
  currentGeneration: number,
  callbackChild: T,
  callbackGeneration: number,
): boolean {
  return currentChild === callbackChild && currentGeneration === callbackGeneration;
}
