import releaseContract from '../../../config/executive-chat-release-contract.json';

export const EXECUTIVE_CHAT_SCHEMA_VERSION = releaseContract.schemaVersion;
export const EXECUTIVE_CHAT_PROMPT_POLICY_VERSION = releaseContract.promptPolicyVersion;

export const CURRENT_EXECUTIVE_CHAT_RELEASE_CONTRACT = {
  ...releaseContract,
} as const;

function versionParts(value: string) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : [0, 0, 0];
}

export function versionAtLeast(value: string, minimum: string) {
  const actual = versionParts(value);
  const required = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > required[index]) return true;
    if (actual[index] < required[index]) return false;
  }
  return true;
}

export function releaseContractsCompatible(a: {
  schemaVersion: string;
  compatibleMinPeerVersion: string;
}, b: {
  schemaVersion: string;
  compatibleMinPeerVersion: string;
}) {
  return versionAtLeast(a.schemaVersion, b.compatibleMinPeerVersion) &&
    versionAtLeast(b.schemaVersion, a.compatibleMinPeerVersion);
}
