import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CSP_MODE, buildCsp, buildHeadersFile } from '../config/csp.mjs';
import {
  checkBuildOutput,
  findCspMetaContent,
  findExecutableInlineScripts,
  parseHeadersFile,
} from '../scripts/check-csp-build.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDirs = [];

const makeDist = ({ html, headers }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfyantra-csp-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  if (headers !== undefined) fs.writeFileSync(path.join(dir, '_headers'), headers);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('findExecutableInlineScripts', () => {
  it('finds a plain inline script and reports its body', () => {
    const html = '<script>\n  window.theme = "dark";\n</script>';
    expect(findExecutableInlineScripts(html)).toEqual(['window.theme = "dark";']);
  });

  it('ignores scripts with a src attribute', () => {
    expect(findExecutableInlineScripts('<script src="/theme-init.js"></script>')).toEqual([]);
    expect(
      findExecutableInlineScripts('<script type="module" crossorigin src="/assets/index.js"></script>')
    ).toEqual([]);
  });

  it('ignores non-executable data blocks', () => {
    const html = [
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
      '<script type="application/json">{"a":1}</script>',
      '<script type="importmap">{"imports":{}}</script>',
    ].join('\n');
    expect(findExecutableInlineScripts(html)).toEqual([]);
  });

  it('flags inline module scripts', () => {
    expect(findExecutableInlineScripts('<script type="module">import "./a.js"</script>')).toHaveLength(
      1
    );
  });
});

describe('findCspMetaContent', () => {
  it('extracts the policy from the meta tag', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ forMeta: true })}" />`;
    expect(findCspMetaContent(html)).toBe(buildCsp({ forMeta: true }));
  });

  it('returns null when no CSP meta tag is present', () => {
    expect(findCspMetaContent('<meta name="theme-color" content="#6750A4" />')).toBeNull();
  });
});

describe('parseHeadersFile', () => {
  it('parses the first block of a _headers file', () => {
    const parsed = parseHeadersFile(buildHeadersFile({ mode: 'enforce' }));
    expect(parsed.path).toBe('/*');
    expect(parsed.headers['X-Frame-Options']).toBe('DENY');
    expect(parsed.headers['Content-Security-Policy']).toBe(buildCsp({ forMeta: false }));
  });
});

describe('checkBuildOutput', () => {
  const enforceHtml = [
    '<html><head>',
    `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ forMeta: true })}">`,
    '<script src="/theme-init.js"></script>',
    '<script type="module" crossorigin src="/assets/index.js"></script>',
    '</head><body><div id="root"></div></body></html>',
  ].join('\n');

  it('accepts a clean enforcing build', () => {
    const distDir = makeDist({
      html: enforceHtml,
      headers: buildHeadersFile({ mode: 'enforce' }),
    });
    const { problems } = checkBuildOutput({ distDir, mode: 'enforce' });
    expect(problems).toEqual([]);
  });

  it('rejects an executable inline script', () => {
    const distDir = makeDist({
      html: enforceHtml.replace('<script src="/theme-init.js"></script>', '<script>1</script>'),
      headers: buildHeadersFile({ mode: 'enforce' }),
    });
    const { problems } = checkBuildOutput({ distDir, mode: 'enforce' });
    expect(problems.join('\n')).toContain('executable inline script');
  });

  it('rejects a build without the meta tag in enforce mode', () => {
    const distDir = makeDist({
      html: enforceHtml.replace(/<meta http-equiv[\s\S]*?>\n/, ''),
      headers: buildHeadersFile({ mode: 'enforce' }),
    });
    const { problems } = checkBuildOutput({ distDir, mode: 'enforce' });
    expect(problems.join('\n')).toContain('missing the Content-Security-Policy meta tag');
  });

  it('rejects a report-only build that still ships a meta tag', () => {
    const distDir = makeDist({
      html: enforceHtml,
      headers: buildHeadersFile({ mode: 'report-only' }),
    });
    const { problems } = checkBuildOutput({ distDir, mode: 'report-only' });
    expect(problems.join('\n')).toContain('cannot be report-only');
  });

  it('rejects a missing or incomplete _headers file', () => {
    const withoutHeaders = makeDist({ html: enforceHtml });
    expect(checkBuildOutput({ distDir: withoutHeaders, mode: 'enforce' }).problems.join('\n')).toContain(
      'Missing'
    );

    const missingCompanion = makeDist({
      html: enforceHtml,
      headers: `/*\n  Content-Security-Policy: ${buildCsp({ forMeta: false })}\n`,
    });
    expect(
      checkBuildOutput({ distDir: missingCompanion, mode: 'enforce' }).problems.join('\n')
    ).toContain('Referrer-Policy');
  });
});

describe('repository sources', () => {
  it('index.html has no executable inline script and loads the theme script', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    expect(findExecutableInlineScripts(html)).toEqual([]);
    expect(html).toContain('<script src="/theme-init.js"></script>');
  });

  it('ships the theme bootstrap script as a same-origin public asset', () => {
    const themeScript = fs.readFileSync(path.join(repoRoot, 'public', 'theme-init.js'), 'utf8');
    expect(themeScript).toContain("classList.add('dark')");
    expect(themeScript).toContain("localStorage.theme === 'dark'");
  });

  it('builds in the configured mode', () => {
    expect(['enforce', 'report-only']).toContain(CSP_MODE);
  });
});
