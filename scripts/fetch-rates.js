import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, 'state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchHTML(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

function parseRate(text) {
  const cleaned = (text || '').replace(/[^0-9.]/g, '');
  return cleaned ? parseFloat(cleaned) : null;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function fetchBoCRate() {
  const data = await fetchJSON('https://www.bankofcanada.ca/valet/observations/V39079/json?recent=1');
  const obs = data.observations?.[0];
  if (!obs) throw new Error('No BoC observations returned');
  return { bocRate: parseFloat(obs.V39079.v) };
}

export async function fetchBankRate() {
  const data = await fetchJSON('https://www.bankofcanada.ca/valet/observations/V39078/json?recent=1');
  const obs = data.observations?.[0];
  if (!obs) throw new Error('No Bank Rate observations returned');
  return { bocBankRate: parseFloat(obs.V39078.v) };
}

export async function fetchCanadianPrimeRate() {
  const html = await fetchHTML('https://wowa.ca/mortgage-rates');
  const $ = cheerio.load(html);
  const text = $('body').text();
  const match = text.match(/prime rate[:\s]+([0-9]+\.[0-9]+)%/i);
  if (match) return { canPrimeRate: parseFloat(match[1]) };
  const altMatch = text.match(/4\.\d{2}/);
  if (altMatch) return { canPrimeRate: parseFloat(altMatch[0]) };
  throw new Error('Could not parse Canadian prime rate from WOWA');
}

export async function fetchCanadianMortgageRates() {
  const html = await fetchHTML('https://wowa.ca/mortgage-rates');
  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  let varRate = null, fixedRate = null;

  const varMatch5yr = bodyText.match(/5-year variable[^0-9]*?([0-9]+\.[0-9]+)%/i);
  if (varMatch5yr) varRate = parseFloat(varMatch5yr[1]);

  const fixedMatch5yr = bodyText.match(/5-year fixed[^0-9]*?([0-9]+\.[0-9]+)%/i);
  if (fixedMatch5yr) fixedRate = parseFloat(fixedMatch5yr[1]);

  if (varMatch5yr && fixedMatch5yr) {
    return {
      canVariableRate: varRate,
      canFixedRate: fixedRate
    };
  }

  const genericVar = bodyText.match(/variable[^0-9]*?([0-9]+\.[0-9]+)%/i);
  const genericFixed = bodyText.match(/fixed[^0-9]*?([0-9]+\.[0-9]+)%/i);
  if (genericVar) varRate = parseFloat(genericVar[1]);
  if (genericFixed) fixedRate = parseFloat(genericFixed[1]);

  if (varRate && fixedRate) {
    return { canVariableRate: varRate, canFixedRate: fixedRate };
  }

  throw new Error('Could not parse Canadian mortgage rates from WOWA');
}

export async function fetchUSMortgageRate() {
  const html = await fetchHTML('https://www.freddiemac.com/pmms');
  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  const currentMatch = bodyText.match(/30-year[^0-9]*?([0-9]+\.[0-9]+)%/i);
  const prevMatch = bodyText.match(/from last week when it averaged ([0-9]+\.[0-9]+)%/i);

  if (!currentMatch) throw new Error('Could not parse current US 30yr rate from Freddie Mac');

  return {
    us30yrRate: parseFloat(currentMatch[1]),
    us30yrPrevRate: prevMatch ? parseFloat(prevMatch[1]) : null
  };
}

export async function fetchFedFundsRate(apiKey) {
  if (!apiKey) throw new Error('FRED_API_KEY not set');
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&file_type=json&sort_order=desc&limit=2&api_key=${apiKey}`;
  const data = await fetchJSON(url);
  const obs = data.observations || [];
  if (obs.length === 0) throw new Error('No FRED observations returned');
  const current = parseRate(obs[0].value);
  if (!current) throw new Error('Could not parse Fed funds rate');
  return { usFedRate: current };
}

function isFedMeetingWeek(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const scheduled = [
    [y, 0], [y, 2], [y, 4], [y, 5], [y, 6], [y, 8], [y, 9], [y, 11]
  ];
  return scheduled.some(([yr, mo]) => yr === y && mo === m);
}

export async function fetchAllRates(prevState) {
  const result = { ...prevState };
  const errors = [];

  try {
    const boc = await fetchBoCRate();
    Object.assign(result, boc);
  } catch (e) {
    errors.push(`BoC rate: ${e.message}`);
  }

  try {
    const bankRate = await fetchBankRate();
    Object.assign(result, bankRate);
  } catch (e) {
    errors.push(`Bank rate: ${e.message}`);
  }

  try {
    const prime = await fetchCanadianPrimeRate();
    Object.assign(result, prime);
  } catch (e) {
    errors.push(`Canadian prime rate: ${e.message}`);
  }

  try {
    const mortgage = await fetchCanadianMortgageRates();
    Object.assign(result, mortgage);
  } catch (e) {
    errors.push(`Canadian mortgage rates: ${e.message}`);
  }

  try {
    const usMortgage = await fetchUSMortgageRate();
    Object.assign(result, usMortgage);
  } catch (e) {
    errors.push(`US mortgage rate: ${e.message}`);
  }

  try {
    const fed = await fetchFedFundsRate(process.env.FRED_API_KEY);
    Object.assign(result, fed);
  } catch (e) {
    errors.push(`Fed funds rate: ${e.message}`);
  }

  result.fedMeetingNextWeek = isFedMeetingWeek();

  result.lastRun = new Date().toISOString().slice(0, 10);

  return { data: result, errors };
}
