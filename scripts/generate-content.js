import { selectTemplate, interpolate, ordinal } from './templates.js';

function cleanTitle(title) {
  return title
    .replace(/\s*Rob McLister.*$/, '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s*-\s*[A-Z][a-z]+\s+\|.*$/, '')
    .replace(/Canada -Toronto.*$/i, '')
    .replace(/^Subscriber only\.\s*/i, '')
    .trim();
}

function buildWeeklyRoundup(data, articles) {
  const rateInfo = `The Bank of Canada is at ${data.bocRate}% for ${ordinal(data.bocConsecutiveHolds)} consecutive holds, the best 5-year variable is ${data.canVariableRate}% and fixed is ${data.canFixedRate}%.`;

  const newsItems = articles.slice(0, 3);
  let newsBullets = '';
  for (const item of newsItems) {
    newsBullets += `\n• ${cleanTitle(item.title)} (${item.source})`;
  }
  const newsSection = newsItems.length > 0 ? `Recent headlines:${newsBullets}` : '';

  const topTitle = newsItems[0] ? cleanTitle(newsItems[0].title) : '';
  const hook = topTitle
    ? `${topTitle.replace(/[.!?]$/, '')} — here's why it matters.`
    : `If you're a first-time buyer, an investor, or watching pre-construction — this week's numbers actually matter.`;

  const bodyParts = [`Here's the breakdown. ${rateInfo}`];
  if (newsSection) bodyParts.push(newsSection);
  bodyParts.push(`For first-time buyers: affordability is improving in Peel and Durham, where average prices came in below 900K in May per TRREB. If you're watching pre-construction, there's an HST rebate worth up to $130K on qualifying assignments — but it depends on when you sign, not when you close. On the ROI side, rent-to-price ratios across the GTA are the healthiest they've been in three years. The math on a buy-and-hold is starting to work again.`);
  const body = bodyParts.join('\n\n');

  const cta = `If you're a first-time buyer, looking at pre-construction, or just running the numbers on whether now is the right time — DM me. I can walk you through the actual math for your situation, not just the headlines.`;

  return { hook, body, cta };
}

function buildEnrichedCommentary(tmpl, data, articles) {
  let briefingP1 = tmpl.briefingP1;
  let briefingP2 = tmpl.briefingP2;
  let impactP1 = tmpl.impactP1;
  let impactP2 = tmpl.impactP2;

  const topNews = articles.slice(0, 2);

  if (topNews.length > 0) {
    const newsRef = topNews.map(a =>
      `${a.source} recently reported: "${cleanTitle(a.title)}"`
    ).join(' ');
    briefingP2 = briefingP2 ? `${briefingP2}\n\n${newsRef}` : newsRef;
  }

  return { briefingP1, briefingP2, impactP1, impactP2 };
}

export function buildNewsPatches(data, articles) {
  const tmpl = selectTemplate(data);

  const enriched = buildEnrichedCommentary(tmpl, data, articles);
  const weekly = buildWeeklyRoundup(data, articles);

  const patches = {
    'headline': interpolate(tmpl.headline, data),
    'lede': interpolate(tmpl.lede, data),

    'briefing-p1': interpolate(enriched.briefingP1, data),
    'briefing-p2': enriched.briefingP2 ? interpolate(enriched.briefingP2, data) : interpolate(tmpl.briefingP2, data),

    'impact-p1': interpolate(enriched.impactP1, data),
    'impact-p2': interpolate(enriched.impactP2, data),

    'weekly-hook': weekly.hook,
    'weekly-body': weekly.body,
    'weekly-cta': weekly.cta,
  };

  return patches;
}
