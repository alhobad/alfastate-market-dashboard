import { readFileSync, writeFileSync } from 'fs';

const INDEX_PATH = 'index.html';

export function readIndex() {
  return readFileSync(INDEX_PATH, 'utf-8');
}

export function writeIndex(html) {
  writeFileSync(INDEX_PATH, html, 'utf-8');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function patchFields(html, patches) {
  let result = html;
  let changed = false;

  for (const [field, value] of Object.entries(patches)) {
    const isObj = typeof value === 'object' && value !== null;
    const textValue = isObj ? value.text : value;
    const classes = isObj ? value.classes : null;

    if (textValue === undefined && !classes) continue;

    const tagRegex = new RegExp(`<[^>]*?data-field="${escapeRegex(field)}"[^>]*?>`);
    const tagMatch = result.match(tagRegex);
    if (!tagMatch) {
      console.warn(`  ⚠ data-field "${field}" not found in index.html — skipping`);
      continue;
    }

    const openTag = tagMatch[0];
    const afterTag = result.slice(tagMatch.index + openTag.length);

    const closeTagMatch = afterTag.match(/<\/[^>]+>/);
    if (!closeTagMatch) continue;

    const closeTag = closeTagMatch[0];
    const oldContent = afterTag.slice(0, closeTagMatch.index);
    const elementStart = tagMatch.index;
    const beforeElement = result.slice(0, elementStart);
    const afterElement = result.slice(elementStart + openTag.length + oldContent.length + closeTag.length);

    let newOpenTag = openTag;
    if (classes) {
      if (classes.remove) {
        newOpenTag = newOpenTag.replace(new RegExp(`\\b${escapeRegex(classes.remove)}\\b`, 'g'), '');
      }
      if (classes.add) {
        newOpenTag = newOpenTag.replace(/class="([^"]*)"/, (_, cls) => {
          const parts = [...new Set([...cls.split(/\s+/).filter(Boolean), classes.add])];
          return `class="${parts.join(' ')}"`;
        });
      }
    }

    const newContent = textValue !== undefined ? textValue : oldContent;

    result = beforeElement + newOpenTag + newContent + closeTag + afterElement;
    changed = true;
  }

  return { html: result, changed };
}
