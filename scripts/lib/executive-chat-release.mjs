function parts(value) {
  const match = String(value ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : [0, 0, 0];
}

export function versionAtLeast(value, minimum) {
  const actual = parts(value);
  const required = parts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > required[index]) return true;
    if (actual[index] < required[index]) return false;
  }
  return true;
}

export function verifyExecutiveChatRelease(web, convex) {
  const reasonCodes = [];
  if (!web) reasonCodes.push('web_manifest_missing');
  if (!convex) reasonCodes.push('convex_manifest_missing');
  if (!web || !convex) return { compatible: false, reasonCodes };
  if (web.runtime !== 'web') reasonCodes.push('web_runtime_invalid');
  if (convex.runtime !== 'convex') reasonCodes.push('convex_runtime_invalid');
  if (web.environment !== convex.environment) reasonCodes.push('environment_mismatch');
  if (web.gitSha !== convex.gitSha) reasonCodes.push('git_sha_mismatch');
  if (!versionAtLeast(web.schemaVersion, convex.compatibleMinPeerVersion) ||
      !versionAtLeast(convex.schemaVersion, web.compatibleMinPeerVersion)) reasonCodes.push('schema_incompatible');
  for (const field of ['controlVersion', 'capabilityVersion', 'validatorVersion', 'promptPolicyVersion']) {
    if (web[field] !== convex[field]) reasonCodes.push(`${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_mismatch`);
  }
  return { compatible: reasonCodes.length === 0, reasonCodes };
}

