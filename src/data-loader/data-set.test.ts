import { describe, expect, it } from 'vitest';
import { SAMPLE_BANNER_TEXT, bannerText } from './data-set';

describe('bannerText', () => {
  it('warns on a sample folder and not on a real one', () => {
    expect(bannerText('burbank-sample')).toBe('Sample data. Not real Burbank rules.');
    expect(SAMPLE_BANNER_TEXT).toBe('Sample data. Not real Burbank rules.');
    expect(bannerText('burbank')).toBeNull();
  });
});
