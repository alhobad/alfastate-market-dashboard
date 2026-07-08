import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchAllRates } from './fetch-rates.js';
import { buildPatches } from './templates.js';
import { readIndex, writeIndex, patchFields } from './patch-html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, 'state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(data) {
  delete data.fedRange;
  const state = {
    lastRun: data.lastRun || new Date().toISOString().slice(0, 10),
    bocRate: data.bocRate,
    bocBankRate: data.bocBankRate,
    canPrimeRate: data.canPrimeRate,
    canVariableRate: data.canVariableRate,
    canFixedRate: data.canFixedRate,
    usFedRate: data.usFedRate,
    usFedRangeLow: data.usFedRangeLow || 3.50,
    usFedRangeHigh: data.usFedRangeHigh || 3.75,
    us30yrRate: data.us30yrRate,
    us30yrPrevRate: data.us30yrPrevRate,
    bocConsecutiveHolds: data.bocConsecutiveHolds,
    fedMeetingNextWeek: data.fedMeetingNextWeek
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  return state;
}

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log('📊 Alfastate Daily Market Dashboard Update');
  console.log(`   Running at ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('   🔍 DRY RUN — no files will be modified\n');
  else console.log('');

  const prevState = loadState();
  console.log('📥 Fetching current rates...');
  const { data: currentData, errors } = await fetchAllRates(prevState);

  if (errors.length > 0) {
    console.log('\n⚠ Warnings during fetch:');
    for (const e of errors) {
      console.log(`   - ${e}`);
    }
    console.log('   (Using previous values for failed sources)\n');
  }

  currentData.usFedRangeLow = currentData.usFedRangeLow || 3.50;
  currentData.usFedRangeHigh = currentData.usFedRangeHigh || 3.75;

  const bocChanged = currentData.bocRate !== prevState.bocRate;
  if (bocChanged && currentData.bocRate < (prevState.bocRate || 0)) {
    // BoC just cut — reset consecutive holds counter
    currentData.bocConsecutiveHolds = 1;
  } else if (bocChanged && currentData.bocRate > (prevState.bocRate || 0)) {
    currentData.bocConsecutiveHolds = 1;
  } else if (prevState.bocRate !== undefined) {
    currentData.bocConsecutiveHolds = (prevState.bocConsecutiveHolds || 0) + 1;
  } else {
    currentData.bocConsecutiveHolds = currentData.bocConsecutiveHolds || 5;
  }

  console.log('\n📈 Current data:');
  console.log(`   BoC overnight rate:    ${currentData.bocRate}% (hold #${currentData.bocConsecutiveHolds})`);
  console.log(`   Can variable (5yr):    ${currentData.canVariableRate}%`);
  console.log(`   Can fixed (5yr):       ${currentData.canFixedRate}%`);
  console.log(`   US 30yr mortgage:      ${currentData.us30yrRate}% (prev: ${currentData.us30yrPrevRate}%)`);
  console.log(`   Fed funds rate:        ${currentData.usFedRate || 'N/A'}%`);
  console.log(`   Fed meeting next wk:   ${currentData.fedMeetingNextWeek}`);

  console.log('\n📝 Generating patches...');
  const patches = buildPatches(currentData);

  console.log(`   ${Object.keys(patches).length} fields to patch`);

  console.log('\n🩹 Patching index.html...');
  let html = readIndex();
  const { html: patchedHtml, changed } = patchFields(html, patches);

  if (!changed) {
    console.log('\n✅ No changes detected — nothing to update.');
    if (!DRY_RUN) saveState(currentData);
    return;
  }

  if (DRY_RUN) {
    console.log('   🔍 DRY RUN — skipping write. Changes detected:');
    for (const [field, value] of Object.entries(patches)) {
      console.log(`      · ${field}: ${typeof value === 'string' ? value : value.text || '(class change)'}`);
    }
    return;
  }

  writeIndex(patchedHtml);
  console.log('   index.html written successfully');

  saveState(currentData);
  console.log('\n✅ Update complete.');
  console.log('   A pull request will be created by the GitHub Action.');
}

main().catch(err => {
  console.error('\n❌ Update failed:', err.message);
  process.exit(1);
});
