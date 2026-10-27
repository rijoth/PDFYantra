import { describe, expect, it } from 'vitest';
import { scanContent } from '../scripts/check-no-external-requests.mjs';

const scan = (kind, text) => scanContent({ file: `fixture.${kind}`, text, kind });

describe('check-no-external-requests', () => {
  it('flags external stylesheet, preconnect, and script URLs', () => {
    const html = [
      '<link rel="stylesheet" href="https://cdn.example.com/app.css">',
      '<link rel="preconnect" href="https://fonts.example.com">',
      '<script src="//cdn.example.com/app.js"></script>',
    ].join('\n');

    expect(scan('html', html).map((finding) => finding.url)).toEqual([
      '//cdn.example.com/app.js',
      'https://cdn.example.com/app.css',
      'https://fonts.example.com',
    ]);
  });

  it('flags external CSS url() and @import references', () => {
    const css = [
      '@import url("https://cdn.example.com/theme.css");',
      '.hero { background: url(https://cdn.example.com/bg.png); }',
    ].join('\n');

    expect(scan('css', css)).toHaveLength(2);
  });

  it('flags external fetch literals in JS', () => {
    expect(scan('js', 'fetch("https://api.example.com/data")')).toHaveLength(1);
  });

  it('ignores local resources, navigation links, and XML namespace URLs', () => {
    const html = [
      '<a href="https://github.com/example/repo">Source</a>',
      '<link rel="canonical" href="https://pdfyantra.app/">',
      '<link rel="stylesheet" href="/assets/index.css">',
      '<script src="./assets/index.js"></script>',
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ].join('\n');
    const css = '.icon { background: url(./icon.svg); }';
    const js = 'fetch("/data.json"); const doc = "http://www.w3.org/1999/xlink";';

    expect(scan('html', html)).toEqual([]);
    expect(scan('css', css)).toEqual([]);
    expect(scan('js', js)).toEqual([]);
  });
});
