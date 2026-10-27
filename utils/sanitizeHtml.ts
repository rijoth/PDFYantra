import DOMPurify from 'dompurify';

/**
 * Single choke point for every untrusted HTML string that reaches the DOM
 * (uploaded HTML files, mammoth DOCX output, SheetJS `sheet_to_html` output).
 *
 * DOMPurify is an allowlist sanitizer: unknown/injected markup is dropped rather
 * than pattern-matched. On top of that we enforce the conversion pipeline's
 * privacy requirements:
 *  - no remote resources (only `data:image/...;base64,` images survive), so
 *    html2canvas/browsers never phone home while snapshotting a document;
 *  - no CSS that can fetch (`url(...)`, `@import`) or execute (`expression(`,
 *    `javascript:`, `behavior`, `-moz-binding`);
 *  - links limited to http(s)/mailto with `rel="noopener noreferrer"`.
 *
 * A dedicated instance is used so the hooks below never leak into other
 * DOMPurify consumers.
 */
const DATA_IMAGE_SRC = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;
const SAFE_LINK_HREF = /^(?:https?:|mailto:)/i;

const FORBID_TAGS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'svg',
  'math',
  'audio',
  'video',
  'source',
  'track',
  'picture',
  'template',
];

const FORBID_ATTR = ['srcset', 'formaction', 'action', 'ping', 'background', 'poster'];

/** CSS tokens that can fetch remote resources or execute code. */
const FORBIDDEN_STYLE_TOKENS = [
  'url(',
  '@import',
  'expression(',
  'javascript:',
  'vbscript:',
  'behavior',
  '-moz-binding',
];

/**
 * Decodes CSS escapes (`u\72 l(` -> `url(`) so obfuscated declarations cannot
 * slip past the token check below.
 */
const decodeCssEscapes = (value: string): string =>
  value
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_match, hex: string) => {
      const codePoint = parseInt(hex, 16);
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/\\(.)/gs, '$1');

/**
 * Splits a `style` attribute into declarations on `;` at paren depth 0, so
 * `url(data:...;base64,...)` is never chopped into bogus fragments.
 */
const splitDeclarations = (style: string): string[] => {
  const declarations: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of style) {
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ';' && depth === 0) {
      declarations.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  declarations.push(current);

  return declarations;
};

/**
 * Drops dangerous or malformed declarations from a `style` attribute value.
 * Harmless declarations (color, font, border, background-color, text-align,
 * width, ...) are preserved for DOCX/XLSX fidelity.
 */
export const sanitizeStyleDeclarations = (style: string): string =>
  splitDeclarations(style)
    .map(declaration => declaration.trim())
    .filter(declaration => {
      if (!declaration) return false;
      // Normalized probe: decode escapes, strip comments and whitespace so
      // `u\72 l(`, `u/**/rl(` and `url ( ` cannot slip past the token check.
      const probe = decodeCssEscapes(declaration)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, '')
        .toLowerCase();

      if (!/^[a-z-]+:/.test(probe)) return false;
      return !FORBIDDEN_STYLE_TOKENS.some(token => probe.includes(token));
    })
    .join('; ');

const purify = DOMPurify(window);

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName.toLowerCase() !== 'style') return;

  const cleaned = sanitizeStyleDeclarations(data.attrValue);
  if (!cleaned) {
    data.keepAttr = false;
    return;
  }
  data.attrValue = cleaned;
});

purify.addHook('afterSanitizeAttributes', node => {
  const tag = node.tagName.toLowerCase();

  if (tag === 'img') {
    const src = (node.getAttribute('src') || '').trim();
    // Anything that is not an inline base64 raster image is dropped entirely:
    // keeping it would let html2canvas (or the browser) fetch a remote URL.
    if (!DATA_IMAGE_SRC.test(src)) {
      node.remove();
    }
    return;
  }

  if (tag === 'a') {
    const href = (node.getAttribute('href') || '').trim();
    if (href && !SAFE_LINK_HREF.test(href)) {
      node.removeAttribute('href');
    }
    node.removeAttribute('target');
    if (node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

export const sanitizeHtml = (dirty: string): string => {
  if (!dirty) return '';

  return purify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS,
    FORBID_ATTR,
  });
};
