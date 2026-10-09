/** Preserve the issued secret while updating the moved project's routing prefix. */
export function previewDeployKeyAfterTransfer(key, environment) {
  const oldPrefix = 'preview:monica-fernandez:nexx|';
  if (environment !== 'preview' || typeof key !== 'string' || !key.startsWith(oldPrefix)) return key;
  return `preview:monica-estimon-39537:nexx|${key.slice(oldPrefix.length)}`;
}
