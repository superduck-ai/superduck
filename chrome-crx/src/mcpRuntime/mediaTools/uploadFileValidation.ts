// Shape-only check for MCP callers (agents may emit Unix or Windows paths before
// the host OS resolves them). The native CLI uses filepath.IsAbs on the local OS.
const ABSOLUTE_PATH_PATTERN = /^(\/|[A-Za-z]:[\\/])/;

export function validateUploadPaths(paths: string[]): string | null {
  for (const filePath of paths) {
    if ('string' !== typeof filePath || !ABSOLUTE_PATH_PATTERN.test(filePath)) {
      return `Path must be an absolute local filesystem path: ${String(filePath)}`;
    }
  }
  return null;
}
