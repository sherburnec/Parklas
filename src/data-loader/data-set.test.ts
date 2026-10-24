import { describe, expect, it } from 'vitest';
import { SAMPLE_BANNER_TEXT, bannerText, dataFolder, resolveDataSet } from './data-set';

describe('resolveDataSet', () => {
  it('defaults to sample', () => {
    expect(resolveDataSet(undefined)).toBe('sample');
    expect(resolveDataSet('')).toBe('sample');
  });

  it('accepts sample and real, and rejects anything else', () => {
    expect(resolveDataSet('sample')).toBe('sample');
    expect(resolveDataSet('real')).toBe('real');
    expect(() => resolveDataSet('prod')).toThrow(/DATA_SET/);
  });
});

describe('dataFolder', () => {
  it('reads the -sample folder for the sample set and the plain folder for the real set', () => {
    expect(dataFolder('burbank', 'sample')).toBe('burbank-sample');
    expect(dataFolder('burbank', 'real')).toBe('burbank');
  });
});

describe('bannerText', () => {
  it('warns on the sample set only', () => {
    expect(bannerText('sample')).toBe('Sample data. Not real Burbank rules.');
    expect(SAMPLE_BANNER_TEXT).toBe('Sample data. Not real Burbank rules.');
    expect(bannerText('real')).toBeNull();
  });
});
