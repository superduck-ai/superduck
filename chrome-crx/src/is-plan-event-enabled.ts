interface FeatureFlag {
  enabled?: boolean;
}

interface FeatureFlagWithDefault {
  __default?: FeatureFlag;
}

/**
 * Returns whether a feature flag is enabled
 * @param l - Feature flag object with default fallback
 * @param e - Override feature flag object
 * @returns true if the feature is enabled, false otherwise
 */
export function isPlanEventEnabled(
  l: FeatureFlagWithDefault | undefined,
  e: FeatureFlag | undefined
): boolean {
  // If override has an explicit boolean enabled value, use it
  if (typeof e?.enabled === 'boolean') {
    return e.enabled;
  }

  // Otherwise, fall back to the default value
  return l?.__default?.enabled ?? true;
}
