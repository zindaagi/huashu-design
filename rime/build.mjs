// Joins src/ into one self-contained page: rime/index.html (the published artifact source).
// Usage: node rime/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const rd = f => readFileSync(join(here, 'src', f), 'utf8');

const DARK = '--bg:#0a0e14;--panel:#0f151e;--raise:#161e2a;--sunk:#06090d;--line:#1d2836;--line2:#2c3b50;--fg:#e8edf4;--fg2:#a8b4c5;--mute:#6d7c92;--good:#3fd39b;--good-bg:#0e2a22;--bad:#ff5c75;--bad-bg:#2d1118;--warn:#f0b454;--warn-bg:#2a2010;--scrim:rgba(4,6,10,.66);--ink:#ff7d95;color-scheme:dark;';
const LIGHT = '--bg:#edf1f5;--panel:#f6f8fb;--raise:#ffffff;--sunk:#e4e9ef;--line:#d3dbe5;--line2:#b9c5d3;--fg:#0e1620;--fg2:#3d4b5e;--mute:#64748a;--good:#0c8f61;--good-bg:#dff3ea;--bad:#d42a48;--bad-bg:#fbe3e7;--warn:#a56a10;--warn-bg:#f8ecd3;--scrim:rgba(20,28,40,.42);--ink:#c8234a;color-scheme:light;';

const css = rd('style.css').replaceAll('@@DARK@@', DARK).replaceAll('@@LIGHT@@', LIGHT);
// the script ships as pure ASCII: every other character becomes a \\uXXXX escape, which is valid in strings, templates and regex literals
const js = readdirSync(join(here, 'src', 'js')).filter(f => f.endsWith('.js')).sort().map(f => rd('js/' + f)).join('\n')
  .replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
if (/<\/script/i.test(js)) throw new Error('script source contains a closing script tag');

const head = [
  '<title>Rime Recall</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap">'
].join('\n');

const out = head + '\n<style>\n' + css + '</style>\n' + rd('body.html') + '<script>\n(() => {\n\'use strict\';\n' + js + '\n})();\n</script>\n';
writeFileSync(join(here, 'index.html'), out);
console.log('built rime/index.html', (out.length / 1024).toFixed(1) + ' KB');
