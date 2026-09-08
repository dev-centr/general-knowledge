import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

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
];
const selectedSources = process.argv.includes('--non-playtime')
  ? sources.filter((source) => !basename(source).startsWith('playtime-'))
  : sources;
const hostDark = {
  'color-canvas': '#071015',
  'color-surface-primary': '#12242c',
  'color-surface-secondary': '#1a3440',
  'color-text-primary': '#f4fbff',
  'color-border-primary': '#a8d8e8',
  'color-edge': '#d1eef7',
  'color-accent-primary': '#4ef0be',
  'color-accent-on-primary': '#04120d',
  'color-status-warning': '#614f20',
  'color-status-danger': '#642e38',
};
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

try {
  for (const source of selectedSources) {
    const stem = basename(source);
    const directory = dirname(join(images, source));
    const adaptive = readFileSync(join(directory, `${stem}.svg`));
    const data = `data:image/svg+xml;base64,${adaptive.toString('base64')}`;

    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.setContent(`<style>html,body{margin:0}img{display:block;width:100%;height:auto}</style><img src="${data}">`);
    await page.waitForFunction(() => document.querySelector('img')?.complete);
    const light = await page.screenshot();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    const dark = await page.screenshot();
    if (hash(light) === hash(dark)) throw new Error(`${stem}: adaptive light and dark renders are identical`);
    const imageState = await page.evaluate(() => ({
      width: document.querySelector('img')?.naturalWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    if (!imageState.width || imageState.overflow) throw new Error(`${stem}: adaptive image failed responsive rendering`);

    const host = readFileSync(join(directory, `${stem}.host.svg`), 'utf8').replace(/^<\?xml[^>]*>\s*/i, '');
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100%;height:auto}</style>${host}`);
    const hostLight = await page.screenshot();
    await page.evaluate((values) => {
      const svg = document.querySelector('svg');
      for (const [token, value] of Object.entries(values)) {
        svg.style.setProperty(`--themed-svg-diagram-${token}`, value);
      }
    }, hostDark);
    const hostDarkShot = await page.screenshot();
    if (hash(hostLight) === hash(hostDarkShot)) throw new Error(`${stem}: host palette override did not change rendering`);
    const hostOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (hostOverflow) throw new Error(`${stem}: host image overflows the viewport`);
  }
} finally {
  await browser.close();
}

console.log(`Rendered ${selectedSources.length} adaptive light/dark pairs and ${selectedSources.length} host palette pairs.`);
