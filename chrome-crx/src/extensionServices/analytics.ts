import { getStorageValue, setStorageValue, StorageKeys } from './core';

export async function getOrCreateAnonymousId(): Promise<string> {
  let id = await getStorageValue(StorageKeys.ANONYMOUS_ID);
  if (!id) {
    id = crypto.randomUUID();
    await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
  }
  return id;
}

export function getProfileTraits(profile: any): Record<string, any> {
  return {
    email: profile.account.email,
    organizationID: profile.organization.uuid,
    organizationUUID: profile.organization.uuid,
    applicationSlug: 'claude-browser-use',
    isMax: profile.account.has_claude_max,
    isPro: profile.account.has_claude_pro,
    orgType: profile.organization.organization_type
  };
}
