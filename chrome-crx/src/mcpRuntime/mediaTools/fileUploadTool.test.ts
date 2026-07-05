import { describe, expect, it } from 'vitest';
import { validateUploadPaths } from './fileUploadValidation';

describe('validateUploadPaths', () => {
  it('accepts unix absolute paths', () => {
    expect(validateUploadPaths(['/tmp/report.pdf', '/var/data/a.txt'])).toBeNull();
  });

  it('accepts windows absolute paths', () => {
    expect(validateUploadPaths(['C:\\Users\\me\\file.txt', 'D:/data/file.pdf'])).toBeNull();
  });

  it('rejects relative paths', () => {
    expect(validateUploadPaths(['report.pdf'])).toMatch(/absolute/i);
    expect(validateUploadPaths(['./report.pdf'])).toMatch(/absolute/i);
    expect(validateUploadPaths(['../report.pdf'])).toMatch(/absolute/i);
  });

  it('rejects empty or non-string entries', () => {
    expect(validateUploadPaths([''])).toMatch(/absolute/i);
    expect(validateUploadPaths([null as unknown as string])).toMatch(/absolute/i);
  });
});
