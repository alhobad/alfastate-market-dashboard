import * as cheerio from 'cheerio';

const TOPIC_KEYWORDS = [
  'housing', 'mortgage', 'real estate', 'interest rate', 'affordability',
  'home price', 'home sale', 'rental', 'condo', 'pre-construction',
  'trreb', 'toronto real estate', 'gta', 'ontario housing',
  'canada housing', 'bank of canada', 'inflation', 'economic',
  'policy', 'rate cut', 'rate hold', 'fixed rate', 'variable rate',
  'first-time buyer', 'landlord', 'tenant', 'construction',
  'supply', 'inventory', 'new listing', 'home buyer',
  'market update', 'real estate market', 'homeowner'
];

const EXCLUDE_PATTERNS = [
  /^sign\s*up/i, /^subscribe/i, /^login/i, /^register/i,
  /^read more/i, /^click here/i, /learn more/i, /^advertise/i,
  /^contact/i, /^newsletter/i, /^search/i, /careers?$/i,
  /^privacy/i, /^terms/i, /^cookie/i, /^accessibility/i
];

function cleanTitle(title) {
  let t = title.replace(/\s+/g, ' ').trim();
  t = t.replace(/\|.*$/, '').trim();
  t = t.replace(/- [A-Z][a-z]+ \|.*$/, '').trim();
  t = t.replace(/Canada -Toronto.*$/i, '').trim();
  t = t.replace(/Read more$/, '').trim();
  t = t.replace(/^Article\s*:\s*/i, '').trim();
  t = t.replace(/^\d+\s+(hours?|days?|weeks?|months?)\s+ago\s*/i, '').trim();
  return t;
}

function isExcluded(title) {
  return EXCLUDE_PATTERNS.some(p => p.test(title));
}

function matchesTopic(title, snippet = '') {
  const text = `${title} ${snippet}`.toLowerCase();
  return TOPIC_KEYWORDS.some(kw => text.includes(kw));
}

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function deduplicate(articles) {
  const unique = [];
  for (const article of articles) {
    const norm = normalizeTitle(article.title);
    if (!norm || norm.split(/\s+/).length < 3) continue;
    let isDup = false;
    for (const existing of unique) {
      if (jaccardSimilarity(norm, normalizeTitle(existing.title)) > 0.7) {
        isDup = true;
        break;
      }
    }
    if (!isDup) unique.push(article);
  }
  return unique;
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlfastateDashboard/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

function extractArticleLinks($, source, baseUrl) {
  const articles = [];
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    let title = cleanTitle($el.text());

    if (!title || !href || title.length < 25) return;
    if (href.startsWith('#') || href.startsWith('javascript:')) return;
    if (isExcluded(title)) return;

    const isHeadline = $el.is('h1 a, h2 a, h3 a, h4 a, .headline a, [class*="title"] a, [class*="headline"] a, [class*="story"] a');
    if (!isHeadline && title.length < 40) return;

    const url = href.startsWith('http') ? href : `${baseUrl}${href}`;
    const key = normalizeTitle(title);
    if (seen.has(key)) return;
    seen.add(key);

    articles.push({ title, url, source, snippet: '' });
  });

  return articles;
}

function extractBySelector($, selector, source, baseUrl) {
  const articles = [];
  const seen = new Set();

  $(selector).each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    let title = cleanTitle($el.text() || $el.attr('title') || '');

    if (!title || !href || title.length < 20) return;
    if (href.startsWith('#') || href.startsWith('javascript:')) return;
    if (isExcluded(title)) return;

    const url = href.startsWith('http') ? href : `${baseUrl}${href}`;
    const key = normalizeTitle(title);
    if (seen.has(key)) return;
    seen.add(key);

    articles.push({ title, url, source, snippet: '' });
  });

  return articles;
}

async function fetchStoreys() {
  try {
    const html = await fetchHTML('https://storeys.com/');
    const $ = cheerio.load(html);
    let articles = extractBySelector($, 'a[href*="/real-estate/"], a[href*="/toronto/"], a[href*="/housing/"]', 'Storeys', 'https://storeys.com');
    if (articles.length === 0) {
      articles = extractArticleLinks($, 'Storeys', 'https://storeys.com');
    }
    return articles;
  } catch { return []; }
}

async function fetchGlobeAndMail() {
  try {
    const html = await fetchHTML('https://www.theglobeandmail.com/business/real-estate/');
    const $ = cheerio.load(html);
    let articles = extractBySelector($, 'a[class*="story"], a[data-testid*="story"], a[href*="/real-estate/"]', 'The Globe and Mail', 'https://www.theglobeandmail.com');
    if (articles.length === 0) {
      articles = extractArticleLinks($, 'The Globe and Mail', 'https://www.theglobeandmail.com');
    }
    return articles;
  } catch { return []; }
}

async function fetchFinancialPost() {
  try {
    const html = await fetchHTML('https://financialpost.com/category/real-estate/');
    const $ = cheerio.load(html);
    let articles = extractBySelector($, 'a[href*="/real-estate/"], a[href*="/housing/"], a[href*="/mortgage/"]', 'Financial Post', 'https://financialpost.com');
    if (articles.length === 0) {
      articles = extractArticleLinks($, 'Financial Post', 'https://financialpost.com');
    }
    return articles;
  } catch { return []; }
}

async function fetchTorontoStar() {
  try {
    const html = await fetchHTML('https://www.thestar.com/real-estate/');
    const $ = cheerio.load(html);
    let articles = extractBySelector($, 'a[href*="/real-estate/"], a[href*="/housing/"], a[class*="story"]', 'Toronto Star', 'https://www.thestar.com');
    if (articles.length === 0) {
      articles = extractArticleLinks($, 'Toronto Star', 'https://www.thestar.com');
    }
    return articles;
  } catch { return []; }
}

async function fetchCBC() {
  try {
    const html = await fetchHTML('https://www.cbc.ca/news/canada/toronto');
    const $ = cheerio.load(html);
    let articles = extractBySelector($, 'a[href*="/news/"]', 'CBC News', 'https://www.cbc.ca');
    if (articles.length === 0) {
      articles = extractArticleLinks($, 'CBC News', 'https://www.cbc.ca');
    }
    return articles;
  } catch { return []; }
}

export async function fetchNews() {
  const results = await Promise.allSettled([
    fetchStoreys(),
    fetchGlobeAndMail(),
    fetchFinancialPost(),
    fetchTorontoStar(),
    fetchCBC()
  ]);

  const allArticles = [];
  const errors = [];
  const sourceCounts = {};

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const a of result.value) {
        sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
      }
      allArticles.push(...result.value);
    } else {
      errors.push(result.reason?.message || 'Unknown fetch error');
    }
  }

  const filtered = allArticles.filter(a => matchesTopic(a.title, a.snippet));
  const deduped = deduplicate(filtered);

  const summary = Object.entries(sourceCounts)
    .map(([s, c]) => `${s}:${c}`).join(', ');
  if (summary) console.log(`  Raw articles per source — ${summary}`);
  console.log(`  Topic-matched: ${filtered.length}/${allArticles.length}  →  ${deduped.length} unique`);

  return { articles: deduped.slice(0, 20), errors };
}
