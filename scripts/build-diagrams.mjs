import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const check = process.argv.includes('--check');
const root = resolve(import.meta.dirname, '..');
const images = join(root, 'docs', 'modules', 'ROOT', 'images');
const pages = join(root, 'docs', 'modules', 'ROOT', 'pages');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
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
];

const diagramOption = process.argv.indexOf('--diagram');
const requestedStem = diagramOption >= 0 ? process.argv[diagramOption + 1] : undefined;
const selectedSources = requestedStem
  ? sources.filter((source) => basename(source) === requestedStem)
  : sources;
if (requestedStem && selectedSources.length !== 1) {
  throw new Error(`Unknown diagram: ${requestedStem}`);
}

const palettes = {
  light: {
    'color.canvas': '#f3f1ec',
    'color.surface.primary': '#ffffff',
    'color.surface.secondary': '#e8f0ea',
    'color.text.primary': '#1a1a1a',
    'color.border.primary': '#2c2c2c',
    'color.edge': '#2c2c2c',
    'color.accent.primary': '#1f3a2e',
    'color.accent.on-primary': '#f7f3e8',
    'color.status.warning': '#f7f3e8',
    'color.status.warning-border': '#6b5a3e',
    'color.status.danger': '#f6e8e6',
    'color.status.danger-border': '#7a3a32',
  },
  dark: {
    'color.canvas': '#10161a',
    'color.surface.primary': '#182126',
    'color.surface.secondary': '#203038',
    'color.text.primary': '#edf4f2',
    'color.border.primary': '#78909b',
    'color.edge': '#a8bdc4',
    'color.accent.primary': '#55d6b2',
    'color.accent.on-primary': '#071512',
    'color.status.warning': '#4a3e24',
    'color.status.warning-border': '#d5b866',
    'color.status.danger': '#542d2d',
    'color.status.danger-border': '#e99a9a',
  },
};

const semanticTokens = {
  primary: ['color.surface.primary', 'color.border.primary', 'color.text.primary'],
  secondary: ['color.surface.secondary', 'color.accent.primary', 'color.text.primary'],
  warning: ['color.status.warning', 'color.status.warning-border', 'color.text.primary'],
  success: ['color.accent.primary', 'color.accent.primary', 'color.accent.on-primary'],
  danger: ['color.status.danger', 'color.status.danger-border', 'color.text.primary'],
};

function semanticClasses(sourceText) {
  const found = new Set();
  for (const match of sourceText.matchAll(/^\s*class\s+[^ \r\n]+\s+(primary|secondary|warning|success|danger)\s*$/gm)) {
    found.add(match[1]);
  }
  return [...found];
}

function stylesheetTokens(sourceText) {
  const sequence = /^\s*sequenceDiagram\s*$/m.test(sourceText);
  const bindings = [
    ['.themed-svg-root', 'background-color', 'color.canvas'],
    ['.themed-svg-root text', 'fill', 'color.text.primary'],
  ];
  if (sequence) {
    bindings.push(
      ['.themed-svg-root .actor', 'fill', 'color.surface.primary'],
      ['.themed-svg-root .actor', 'stroke', 'color.border.primary'],
      ['.themed-svg-root .actor-line', 'stroke', 'color.edge'],
      ['.themed-svg-root .messageLine0', 'stroke', 'color.edge'],
      ['.themed-svg-root .messageLine1', 'stroke', 'color.edge'],
      ['.themed-svg-root .messageText', 'fill', 'color.text.primary'],
      ['.themed-svg-root .labelBox', 'fill', 'color.surface.secondary'],
      ['.themed-svg-root .labelBox', 'stroke', 'color.border.primary'],
      ['.themed-svg-root .labelText', 'fill', 'color.text.primary'],
      ['.themed-svg-root .loopLine', 'stroke', 'color.edge'],
      ['.themed-svg-root marker path', 'fill', 'color.edge'],
      ['.themed-svg-root marker path', 'stroke', 'color.edge'],
    );
  } else {
    bindings.push(
      ['.themed-svg-root .label-container', 'fill', 'color.surface.primary'],
      ['.themed-svg-root .label-container', 'stroke', 'color.border.primary'],
      ['.themed-svg-root .cluster rect', 'fill', 'color.surface.secondary'],
      ['.themed-svg-root .cluster rect', 'stroke', 'color.border.primary'],
      ['.themed-svg-root .flowchart-link', 'stroke', 'color.edge'],
      ['.themed-svg-root marker path', 'fill', 'color.edge'],
      ['.themed-svg-root marker path', 'stroke', 'color.edge'],
    );
    for (const name of semanticClasses(sourceText)) {
      const [fill, stroke, text] = semanticTokens[name];
      bindings.push(
        [`.themed-svg-root .${name} .label-container`, 'fill', fill],
        [`.themed-svg-root .${name} .label-container`, 'stroke', stroke],
        [`.themed-svg-root .${name} .label`, 'color', text],
        [`.themed-svg-root .${name} text`, 'fill', text],
      );
    }
  }
  return bindings;
}

function manifestFor(stem, sourceText) {
  const bindings = stylesheetTokens(sourceText).map(([selector, property, token]) => ({
    kind: 'stylesheet',
    selector,
    property,
    styleSelector: '#themed-svg-bindings',
    token,
  }));
  return {
    $schema: 'https://unpkg.com/@dev-centr/themed-svg@0.1.1/schema/themed-svg-manifest-v1.schema.json',
    schemaVersion: 1,
    namespace: 'diagram',
    source: {
      kind: 'mermaid',
      uri: `${stem}.mmd`,
      generator: '@mermaid-js/mermaid-cli@11.17.0',
    },
    tokens: Object.keys(palettes.light).map((id) => ({ id })),
    defaultPreset: 'light',
    presets: palettes,
    bindings,
    fallback: { unresolvedToken: 'error', missingTarget: 'warn' },
  };
}

function run(args) {
  const result = spawnSync(pnpm, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function syncContent(content, target) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
  if (current === content) return;
  if (check) {
    console.error(`stale: ${relative(root, target)}`);
    process.exitCode = 3;
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function preserveFixed(adaptive) {
  const stem = basename(adaptive, '.svg');
  const fixed = join(dirname(adaptive), `${stem}.fixed.svg`);
  if (existsSync(fixed)) return;
  if (check) {
    console.error(`missing fixed original: ${relative(root, fixed)}`);
    process.exitCode = 3;
    return;
  }
  if (!existsSync(adaptive)) throw new Error(`No original SVG to preserve: ${relative(root, adaptive)}`);
  writeFileSync(fixed, readFileSync(adaptive));
}

function filesBelow(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? filesBelow(path, extension)
      : entry.name.endsWith(extension)
        ? [path]
        : [];
  });
}

function markThemedImageBlocks() {
  const stems = sources.map((source) => basename(source));
  for (const page of filesBelow(pages, '.adoc')) {
    const lines = readFileSync(page, 'utf8').split(/\r?\n/);
    const output = [];
    for (const line of lines) {
      const themedDiagram = /^\s*image::/.test(line)
        && stems.some((stem) => line.includes(`${stem}.svg[`));
      if (themedDiagram && output.at(-1) !== '[.themed-svg]') output.push('[.themed-svg]');
      output.push(line);
    }
    syncContent(output.join('\n'), page);
  }
}

const temporary = mkdtempSync(join(tmpdir(), 'dev-centr-diagrams-'));
try {
  for (const source of selectedSources) {
    const stem = basename(source);
    const directory = dirname(join(images, source));
    const sourcePath = join(images, `${source}.mmd`);
    const sourceText = readFileSync(sourcePath, 'utf8');
    const adaptive = join(directory, `${stem}.svg`);
    const host = join(directory, `${stem}.host.svg`);
    const manifest = join(directory, `${stem}.theme.json`);
    preserveFixed(adaptive);
    syncContent(`${JSON.stringify(manifestFor(stem, sourceText), null, 2)}\n`, manifest);

    const raw = join(temporary, `${stem}.raw.svg`);
    run([
      'exec', 'mmdc',
      '--input', sourcePath,
      '--output', raw,
      '--configFile', join(root, 'mermaid-config.json'),
      '--backgroundColor', 'transparent',
    ]);
    const tokens = stylesheetTokens(sourceText);
    const rendered = readFileSync(raw, 'utf8')
      .replace(/^<\?xml[^>]*>\s*/i, '')
      .replace(/\srole="[^"]*"/i, ' role="img"')
      .replace(/<svg\b([^>]*)>/i, (_match, attributes) => {
        const themedAttributes = /\sclass="[^"]*"/i.test(attributes)
          ? attributes.replace(/\sclass="([^"]*)"/i, ' class="$1 themed-svg-root"')
          : `${attributes} class="themed-svg-root"`;
        return `<svg${themedAttributes} preserveAspectRatio="xMidYMid meet">`;
      })
      .replace(
        /<\/style>/i,
        `</style><style id="themed-svg-bindings">${tokens
          .map(([selector, property, token]) => `${selector}{${property}:${palettes.light[token]} !important}`)
          .join('')}</style>`,
      );
    writeFileSync(raw, `<?xml version="1.0" encoding="UTF-8"?>\n${rendered}`, 'utf8');

    run([
      'exec', 'mermaid-svg-css-vars',
      '--manifest', manifest,
      '--dual-output',
      ...(check ? ['--check'] : []),
      '--output', adaptive,
      '--host-output', host,
      raw,
    ]);
  }
  markThemedImageBlocks();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
