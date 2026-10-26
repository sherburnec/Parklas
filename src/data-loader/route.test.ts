import { describe, expect, it } from 'vitest';
import { dataBaseUrl, isSampleFolder, parseRoute } from './route';

describe('parseRoute', () => {
  it('reads the folder and page from a root-hosted path', () => {
    expect(parseRoute('/burbank/')).toEqual({ folder: 'burbank', page: 'index', siteRoot: '/' });
    expect(parseRoute('/burbank')).toEqual({ folder: 'burbank', page: 'index', siteRoot: '/' });
    expect(parseRoute('/burbank/index.html')).toEqual({ folder: 'burbank', page: 'index', siteRoot: '/' });
    expect(parseRoute('/burbank-sample/authoring.html')).toEqual({ folder: 'burbank-sample', page: 'authoring', siteRoot: '/' });
  });

  it('keeps a project path as the site root', () => {
    expect(parseRoute('/Parklas/burbank/')).toEqual({ folder: 'burbank', page: 'index', siteRoot: '/Parklas/' });
    expect(parseRoute('/Parklas/burbank-sample/authoring.html')).toEqual({
      folder: 'burbank-sample',
      page: 'authoring',
      siteRoot: '/Parklas/',
    });
  });

  it('returns null where there is no folder in the path', () => {
    expect(parseRoute('/')).toBeNull();
    expect(parseRoute('/index.html')).toBeNull();
    expect(parseRoute('/authoring.html')).toBeNull();
    expect(parseRoute('')).toBeNull();
  });

  it('returns null for a folder name that is not a valid city folder', () => {
    expect(parseRoute('/Burbank/')).toBeNull();
    expect(parseRoute('/bur bank/')).toBeNull();
    expect(parseRoute('/%2e%2e/')).toBeNull();
  });
});

describe('isSampleFolder', () => {
  it('is true for names ending in -sample only', () => {
    expect(isSampleFolder('burbank-sample')).toBe(true);
    expect(isSampleFolder('burbank')).toBe(false);
    expect(isSampleFolder('sample')).toBe(false);
    expect(isSampleFolder('burbank-sample-2')).toBe(false);
  });
});

describe('dataBaseUrl', () => {
  it('points at data/ under the site root, whatever folder the page is in', () => {
    expect(dataBaseUrl('/')).toBe('/data');
    expect(dataBaseUrl('/Parklas/')).toBe('/Parklas/data');
  });
});
