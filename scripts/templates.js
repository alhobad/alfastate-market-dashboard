function ordinal(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return n + 'th';
}

function fedMeetingNote(data) {
  if (data.fedMeetingNextWeek) {
    return `The Fed holds its June 16–17 meeting this week, with futures markets pricing a near-certain hold.`;
  }
  return `The Fed's next meeting is scheduled for later this month, with markets closely watching for any shift in tone.`;
}

function bocNextDate(now = new Date()) {
  const y = now.getFullYear();
  const scheduled = [
    [y, 0, 29], [y, 2, 12], [y, 3, 16], [y, 5, 4],
    [y, 6, 16], [y, 8, 17], [y, 9, 29], [y, 11, 10]
  ];
  for (const [yr, mo, day] of scheduled) {
    const d = new Date(yr, mo, day);
    if (d > now) {
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }
  }
  return 'TBD';
}

function interpolate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === 'bocOrdinal') return ordinal(data.bocConsecutiveHolds);
    if (key === 'bocNextDate') return bocNextDate();
    if (key === 'fedMeetingNote') return fedMeetingNote(data);
    if (key === 'usDirection') {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      if (diff > 0.05) return 'tick back up';
      if (diff < -0.05) return 'ease slightly';
      return 'hold steady';
    }
    if (key === 'usChangeArrow') {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      if (diff > 0.05) return '↑';
      if (diff < -0.05) return '↓';
      return '→';
    }
    if (key === 'usChangeDir') {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      if (diff > 0.05) return 'up';
      if (diff < -0.05) return 'down';
      return 'neutral';
    }
    if (key === 'usChangeText') {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      if (data.us30yrPrevRate) {
        return `from ${data.us30yrPrevRate.toFixed(2)}% last week`;
      }
      return 'weekly survey (Freddie Mac PMMS)';
    }
    if (key === 'bocStatusText') {
      return `Held · ${ordinal(data.bocConsecutiveHolds)} time`;
    }
    if (key === 'sourceDate') return new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
    if (key === 'todayDate') return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }) + ' · 7:00 AM ET';
    if (data[key] !== undefined && data[key] !== null) return data[key];
    return `{${key}}`;
  });
}

function padTemplate(text, data) {
  let result = interpolate(text, data);
  return result.replace(/\{([^}]+)\}/g, `{${'$1'}}`);
}

const templates = [
  {
    name: 'bocHeldUsUp',
    test: (data) => {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      return diff > 0.05;
    },
    headline: `Canada holds steady — US mortgage rates {usDirection} as the Fed prepares to hold again.`,
    lede: `The Bank of Canada's rate stays parked at {bocRate}% with no meeting until {bocNextDate}. In the US, the 30-year mortgage average climbed back to {us30yrRate}% this week after last week's brief dip — and with the Fed widely expected to hold at its upcoming meeting, relief isn't coming soon. Here's what it means for buyers and sellers right now.`,
    briefingP1: `The Bank of Canada's policy rate remains parked at {bocRate}% following its last hold — the {bocOrdinal} consecutive hold — with the next decision not until {bocNextDate}. Consumer rates are reflecting that stability: the best available 5-year variable is {canVariableRate}% (WOWA), tracking the prime rate of {canPrimeRate}%, which won't move until the BoC does. The best available 5-year fixed sits at {canFixedRate}% — fixed rates follow bond yields, not the BoC directly, so they can drift even when the policy rate doesn't.`,
    briefingP2: `In the US, last week's brief pullback has reversed. The 30-year fixed mortgage average sits at {us30yrRate}% — up from {us30yrPrevRate}% the previous week. {fedMeetingNote} Persistent inflation and a resilient labour market give the Fed little room to cut anytime soon.`,
    impactP1: `Canadian variable-rate mortgage holders see no change to payments this month — nothing moves until {bocNextDate} at the earliest. With the best 5-year variable at {canVariableRate}% and fixed at {canFixedRate}%, clients weighing a renewal or a summer purchase have a reasonably clear window to plan against.`,
    impactP2: `On the US side, the brief dip in mortgage rates last week didn't hold — {us30yrRate}% is back near recent highs, and with the Fed almost certain to hold again, no meaningful relief is coming before fall at the earliest. For clients comparing both markets, Canada's lower borrowing costs remain a clear advantage for local buyers and a continued drag on cross-border activity from US purchasers.`
  },
  {
    name: 'bocHeldUsDown',
    test: (data) => {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      return diff < -0.05;
    },
    headline: `Canada holds steady — US mortgage rates {usDirection}, but the Fed isn't budging.`,
    lede: `The Bank of Canada's rate stays parked at {bocRate}% with no meeting until {bocNextDate}. South of the border, mortgage rates dipped slightly from recent highs, but a hot inflation print keeps the Fed on hold for now — here's what it means for buyers and sellers this week.`,
    briefingP1: `The Bank of Canada's policy rate remains parked at {bocRate}% following its last hold — the {bocOrdinal} consecutive hold — with the next decision not until {bocNextDate}. That stability is showing up in consumer rates too: the best available 5-year variable sits at {canVariableRate}%, tracking the prime rate ({canPrimeRate}%), which won't move until the BoC does. The best available 5-year fixed is at {canFixedRate}% — fixed rates move with bond yields rather than the BoC directly, so this can shift even when the policy rate doesn't.`,
    briefingP2: `In the US, the picture is more nuanced than it looked a few days ago. The average 30-year fixed mortgage rate sits at {us30yrRate}% this morning — down from {us30yrPrevRate}% last week. But recent CPI data came in hotter than hoped, and combined with a resilient labour market, markets see little chance of a Fed rate cut at the upcoming meeting.`,
    impactP1: `Canadian variable-rate mortgage holders see no change to payments this month, and the coming weeks are predictable — nothing moves until {bocNextDate}. That's useful for clients planning renewals or weighing timing for a listing or purchase this summer.`,
    impactP2: `On the US side, the recent pullback in mortgage rates is a modest tailwind for cross-border buyers, but it shouldn't be read as the start of a trend — a hot inflation print and resilient labor market mean the Fed has little room to cut soon. For clients comparing markets, the relative stability in Canada continues to be the more reliable planning anchor right now.`
  },
  {
    name: 'bocHeldUsStable',
    test: (data) => {
      const diff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);
      return Math.abs(diff) <= 0.05 || !data.us30yrPrevRate;
    },
    headline: `Canada holds steady — US mortgage rates hold this week as markets wait on the Fed.`,
    lede: `The Bank of Canada's rate stays parked at {bocRate}% with no meeting until {bocNextDate}. US mortgage rates are largely unchanged from last week, as markets pause ahead of the Fed's next decision. Here's what clients need to know.`,
    briefingP1: `The Bank of Canada's policy rate remains parked at {bocRate}% — the {bocOrdinal} consecutive hold — with the next decision not until {bocNextDate}. This stability is flowing through to consumer rates: the best available 5-year variable is {canVariableRate}% (WOWA), and the best 5-year fixed is {canFixedRate}%. Fixed rates follow bond yields rather than the BoC directly, so they can drift even when the policy rate doesn't.`,
    briefingP2: `In the US, the 30-year fixed mortgage average is at {us30yrRate}%, holding relatively steady. {fedMeetingNote} Markets are in a wait-and-see pattern as economic data continues to come in mixed — inflation remains above target while the labour market shows signs of gradual cooling.`,
    impactP1: `Canadian variable-rate mortgage holders see no change to payments this month. With the next BoC decision not until {bocNextDate}, clients have a predictable window for planning renewals, purchases, or listings this summer.`,
    impactP2: `The stable US rate environment offers a moment of clarity for cross-border buyers. While no major moves are expected from the Fed in the near term, the current rate picture gives clients on both sides of the border a reliable baseline for decision-making.`
  }
];

function selectTemplate(data) {
  for (const t of templates) {
    if (t.test(data)) return t;
  }
  return templates[templates.length - 1];
}

function buildPatches(data) {
  const tmpl = selectTemplate(data);

  const usDiff = data.us30yrRate - (data.us30yrPrevRate || data.us30yrRate);

  const patches = {
    'header-date': interpolate(`{todayDate}`, data),
    'headline': interpolate(tmpl.headline, data),
    'lede': interpolate(tmpl.lede, data),

    'boc-rate': `${data.bocRate}%`,
    'boc-status': interpolate(`{bocStatusText}`, data),
    'boc-next': interpolate(`Next decision {bocNextDate}`, data),

    'variable-rate': `${data.canVariableRate}%`,
    'variable-desc': `Best available · 5-yr`,

    'fixed-rate': `${data.canFixedRate}%`,
    'fixed-desc': `Best available · 5-yr`,

    'fed-rate': `${(data.usFedRangeLow || 3.50).toFixed(2)}–${(data.usFedRangeHigh || 3.75).toFixed(2)}%`,
    'fed-status': data.fedMeetingNextWeek
      ? 'Expected hold this week'
      : 'No meeting scheduled this week',

    'us-30yr-rate': `${data.us30yrRate}%`,
    'us-30yr-change': {
      text: interpolate(`{usChangeArrow} {usChangeText}`, data),
      classes: { add: interpolate(`{usChangeDir}`, data) }
    },
    'us-30yr-note': `Weekly survey (Freddie Mac PMMS)`,

    'briefing-p1': interpolate(tmpl.briefingP1, data),
    'briefing-p2': interpolate(tmpl.briefingP2, data),

    'impact-p1': interpolate(tmpl.impactP1, data),
    'impact-p2': interpolate(tmpl.impactP2, data),

    'source-date-boc': interpolate(`{sourceDate}`, data),
    'source-date-ratehub': interpolate(`{sourceDate}`, data),
    'source-date-bankrate': interpolate(`{sourceDate}`, data),
    'source-date-freddie': interpolate(`{sourceDate}`, data),
  };

  return patches;
}

export { buildPatches, fedMeetingNote, ordinal };
