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
import {
  plantumlBindingsForSvg,
  plantumlComponentBindings,
  plantumlSequenceBindings,
} from '@dev-centr/plantuml-svg-css-vars';

const check = process.argv.includes('--check');
const root = resolve(import.meta.dirname, '..');
const images = join(root, 'docs', 'modules', 'ROOT', 'images');
const pages = join(root, 'docs', 'modules', 'ROOT', 'pages');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const krokiUrl = process.env.KROKI_SERVER_URL ?? 'https://kroki.io';

/** PlantUML stems built through Kroki → plantuml-svg-css-vars. */
const sources = ['internet-architecture/label-as-wire-break'];

const a11y = {
  'internet-architecture/label-as-wire-break': {
    title: 'Label used as the only wire',
    desc: 'A consumer follows a path label that resolves today, then the producer renames the path and the same cite string-breaks to 404.',
  },
};

const diagramOption = process.argv.indexOf('--diagram');
const requestedStem = diagramOption >= 0 ? process.argv[diagramOption + 1] : undefined;
const selectedSources = requestedStem
  ? sources.filter((source) => basename(source) === requestedStem)
  : sources;
if (requestedStem && selectedSources.length !== 1) {
  throw new Error(`Unknown PlantUML diagram: ${requestedStem}`);
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

function ensureFixedFromRaw(adaptive, rawSvg) {
  const stem = basename(adaptive, '.svg');
  const fixed = join(dirname(adaptive), `${stem}.fixed.svg`);
  if (existsSync(fixed) || check) return;
  writeFileSync(fixed, rawSvg, 'utf8');
}

async function renderPlantuml(pumlText) {
  const response = await fetch(`${krokiUrl}/plantuml/svg`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: pumlText,
  });
  if (!response.ok) {
    throw new Error(`Kroki PlantUML failed (${response.status}): ${await response.text()}`);
  }
  return await response.text();
}

function ensureTitleDesc(svg, title, desc) {
  let out = svg;
  if (title && !/<title\b/i.test(out)) {
    out = out.replace(/<svg\b[^>]*>/i, (open) => `${open}<title>${title}</title>`);
  }
  if (desc && !/<desc\b/i.test(out)) {
    out = out.replace(/<\/title>/i, `</title><desc>${desc}</desc>`);
    if (!/<desc\b/i.test(out)) {
      out = out.replace(/<svg\b[^>]*>/i, (open) => `${open}<desc>${desc}</desc>`);
    }
  }
  return out;
}

function bindingsFor(rawSvg) {
  if (/data-diagram-type="SEQUENCE"/i.test(rawSvg)) return plantumlSequenceBindings();
  if (/data-diagram-type="DESCRIPTION"/i.test(rawSvg)) return plantumlComponentBindings();
  return plantumlBindingsForSvg(rawSvg);
}

function manifestFor(stem, rawSvg) {
  return {
    $schema: 'https://unpkg.com/@dev-centr/themed-svg@0.2.3/schema/themed-svg-manifest-v1.schema.json',
    schemaVersion: 1,
    namespace: 'diagram',
    source: {
      kind: 'plantuml',
      uri: `${stem}.puml`,
      generator: 'kroki-plantuml',
    },
    tokens: Object.keys(palettes.light).map((id) => ({ id })),
    defaultPreset: 'light',
    presets: palettes,
    bindings: bindingsFor(rawSvg),
    fallback: { unresolvedToken: 'error', missingTarget: 'warn' },
  };
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
      const themedDiagram =
        /^\s*image::/.test(line) && stems.some((stem) => line.includes(`${stem}.svg[`));
      if (themedDiagram && output.at(-1) !== '[.themed-svg]') output.push('[.themed-svg]');
      output.push(line);
    }
    syncContent(output.join('\n'), page);
  }
}

const temporary = mkdtempSync(join(tmpdir(), 'dev-centr-plantuml-'));
try {
  for (const source of selectedSources) {
    const stem = basename(source);
    const directory = dirname(join(images, source));
    const sourcePath = join(images, `${source}.puml`);
    const pumlText = readFileSync(sourcePath, 'utf8');
    const adaptive = join(directory, `${stem}.svg`);
    const host = join(directory, `${stem}.host.svg`);
    const manifest = join(directory, `${stem}.theme.json`);
    const raw = join(temporary, `${stem}.raw.svg`);

    const rendered = ensureTitleDesc(
      await renderPlantuml(pumlText),
      a11y[source]?.title ?? stem,
      a11y[source]?.desc ?? `PlantUML diagram ${stem}`,
    );
    writeFileSync(raw, rendered, 'utf8');
    ensureFixedFromRaw(adaptive, `<?xml version="1.0" encoding="UTF-8"?>\n${rendered}`);
    syncContent(`${JSON.stringify(manifestFor(stem, rendered), null, 2)}\n`, manifest);

    run([
      'exec',
      'plantuml-svg-css-vars',
      '--manifest',
      manifest,
      '--dual-output',
      ...(check ? ['--check'] : []),
      '--output',
      adaptive,
      '--host-output',
      host,
      raw,
    ]);
  }
  markThemedImageBlocks();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
