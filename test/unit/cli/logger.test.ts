import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('info calls console.log', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../src/cli/logger.js');
    mod.info('hello');
    expect(spy).toHaveBeenCalledWith('hello');
  });

  it('error calls console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('../../../src/cli/logger.js');
    mod.error('oops');
    expect(spy).toHaveBeenCalledWith('oops');
  });

  it('verbose logs when verbose mode is on', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../src/cli/logger.js');

    spy.mockClear();
    mod.setVerbose(true);
    mod.verbose('step 1');
    expect(spy).toHaveBeenCalledWith('  → step 1');
  });

  it('verbose does not log when verbose mode is off', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../src/cli/logger.js');

    spy.mockClear();
    mod.setVerbose(false);
    mod.verbose('step 1');
    expect(spy).not.toHaveBeenCalled();
  });

  it('setVerbose toggles isVerboseMode', async () => {
    const mod = await import('../../../src/cli/logger.js');
    mod.setVerbose(true);
    expect(mod.isVerboseMode()).toBe(true);
    mod.setVerbose(false);
    expect(mod.isVerboseMode()).toBe(false);
  });
});
