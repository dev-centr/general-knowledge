import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

const root = resolve(import.meta.dirname, '..');
const images = join(root, 'docs', 'modules', 'ROOT', 'images');
const sources = [
  'internet-architecture/three-altitudes-diagram',
  'internet-architecture/rename-breakage-mockup',
  'ai/curated-watching-linkage',
  'gcp-oauth-ideal-model',
  'gcp-oauth-actual-project',
  'gcp-oauth-ideal-to-project-map',
  'access-setup-order',
  'access-github-membership-flow',
  'access-github-oauth-no-api',
  'access-api-enterprise-setup',
  'access-api-token-vs-key',
  'access-mock-team-name',
  'access-mock-github-oauth-app',
  'access-mock-github-consent',
  'access-mock-github-consent-orgs',
  'access-mock-zero-trust-github-idp',
  'access-mock-finish-setup',
  'access-mock-policy-github-org',
  'access-mock-login',
  'playtime-bind-flow',
  'playtime-bootstrap',
  'playtime-growth-ratchet',
  'playtime-layers',
  'playtime-sibling-home',
  'playtime-overlays',
  'playtime-venn',
  'playtime-facets-not-lattice',
  'playtime-attic-basement',
  'playtime-argv',
  'seo-discovery-system',
];
const failures = [];

function fail(path, message) {
  failures.push(`${path}: ${message}`);
}

const mermaidConfigPath = join(root, 'mermaid-config.json');
const mermaidConfig = JSON.parse(readFileSync(mermaidConfigPath, 'utf8'));
if (mermaidConfig.htmlLabels !== false) {
  fail(mermaidConfigPath, 'root-level htmlLabels must be false');
}

const packagePath = join(root, 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
for (const [dependency, expected] of [
  ['@dev-centr/themed-svg', '0.2.3'],
  ['@dev-centr/mermaid-svg-css-vars', '0.1.3'],
]) {
  if (packageJson.devDependencies?.[dependency] !== expected) {
    fail(packagePath, `${dependency} must be pinned to ${expected}`);
  }
}

function validateSvg(path, mode) {
  const svg = readFileSync(path, 'utf8');
  const parserErrors = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => parserErrors.push(message),
      fatalError: (message) => parserErrors.push(message),
    },
  }).parseFromString(svg, 'image/svg+xml');
  const rootElement = document.documentElement;
  if (parserErrors.length) fail(path, `XML parse errors: ${parserErrors.join('; ')}`);
  if (rootElement.localName !== 'svg' || rootElement.namespaceURI !== 'http://www.w3.org/2000/svg') {
    fail(path, 'root must be an SVG namespace element');
  }
  for (const [attribute, expected] of [
    ['role', 'img'],
    ['preserveAspectRatio', 'xMidYMid meet'],
    ['width', '100%'],
  ]) {
    if (rootElement.getAttribute(attribute) !== expected) {
      fail(path, `${attribute} must equal ${expected}`);
    }
  }
  // themed-svg >=0.2.x omits invalid height="auto"; CSS height:auto comes from the runtime.
  if (rootElement.hasAttribute('height')) {
    fail(path, 'height attribute must be omitted (use CSS height:auto via the runtime)');
  }
  if (!rootElement.getAttribute('viewBox')) fail(path, 'missing viewBox');
  if (!rootElement.getElementsByTagName('title')[0]?.textContent?.trim()) fail(path, 'missing title');
  if (!rootElement.getElementsByTagName('desc')[0]?.textContent?.trim()) fail(path, 'missing description');
  if (/<(?:foreignObject|script|iframe|object|embed|image|audio|video)\b/i.test(svg)) {
    fail(path, 'contains forbidden active or external content');
  }
  if (/\son[a-z]+\s*=|(?:href|src)\s*=\s*["'](?!#|data:)/i.test(svg)) {
    fail(path, 'contains an event handler or external resource');
  }
  if (!svg.includes('var(--themed-svg-diagram-')) fail(path, 'missing semantic theme variables');
  if (mode === 'adaptive' && !svg.includes('prefers-color-scheme:dark')) {
    fail(path, 'missing bundled dark-mode media preset');
  }
  if (mode === 'host' && svg.includes('prefers-color-scheme:dark')) {
    fail(path, 'host output must not bundle a media-mode selector');
  }
}

for (const source of sources) {
  const stem = basename(source);
  const directory = dirname(join(images, source));
  const mermaid = join(directory, `${stem}.mmd`);
  const manifestPath = join(directory, `${stem}.theme.json`);
  const adaptive = join(directory, `${stem}.svg`);
  const host = join(directory, `${stem}.host.svg`);
  const fixed = join(directory, `${stem}.fixed.svg`);
  const sourceText = readFileSync(mermaid, 'utf8');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.source?.generator !== '@mermaid-js/mermaid-cli@11.17.0') {
    fail(manifestPath, 'manifest must identify the pinned Mermaid 11 generator');
  }
  const selectors = new Set(manifest.bindings?.map((binding) => binding.selector));
  for (const match of sourceText.matchAll(/^\s*class\s+[^ \r\n]+\s+(primary|secondary|warning|success|danger)\s*$/gm)) {
    for (const suffix of ['.label-container', '.label', 'text']) {
      const selector = `.themed-svg-root .${match[1]} ${suffix}`;
      if (!selectors.has(selector)) fail(manifestPath, `missing structural binding ${selector}`);
    }
    const tspanSelector = `#my-svg .${match[1]} tspan`;
    if (!selectors.has(tspanSelector)) fail(manifestPath, `missing structural binding ${tspanSelector}`);
  }
  validateSvg(adaptive, 'adaptive');
  validateSvg(host, 'host');
  const fixedSvg = readFileSync(fixed, 'utf8');
  if (/var\(|prefers-color-scheme/i.test(fixedSvg)) {
    fail(fixed, 'preserved original must remain fixed');
  }
  if (!/<title\b[^>]*>[^<]+<\/title>/i.test(fixedSvg) || !/<desc\b[^>]*>[^<]+<\/desc>/i.test(fixedSvg)) {
    fail(fixed, 'preserved original must retain title and description');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Validated ${sources.length * 2} canonical adaptive/host SVGs and ${sources.length} preserved fixed originals.`);
