const ABSOLUTE_PATH_PATTERN = /^(\/|[A-Za-z]:[\\/])/;

export function validateUploadPaths(paths: string[]): string | null {
  for (const filePath of paths) {
    if ('string' !== typeof filePath || !ABSOLUTE_PATH_PATTERN.test(filePath)) {
      return `Path must be an absolute local filesystem path: ${String(filePath)}`;
    }
  }
  return null;
}
