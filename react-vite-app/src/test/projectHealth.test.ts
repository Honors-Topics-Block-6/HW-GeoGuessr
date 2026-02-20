import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const exec = (cmd: string, timeout: number = 60000): Buffer => {
  return execSync(cmd, {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    timeout,
    env: { ...process.env, NODE_PATH: '' },
  });
};

describe('Project Health', () => {
  it('should build without compile-time errors', () => {
    expect(() => exec('npm run build')).not.toThrow();
  }, 60000);

  it('should pass all tests without runtime errors', () => {
    expect(() => exec('npx vitest run --exclude src/test/projectHealth.test.ts', 300000)).not.toThrow();
  }, 300000);

  it('should have no ESLint errors', () => {
    expect(() => exec('npm run lint')).not.toThrow();
  }, 60000);
});
