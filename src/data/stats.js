import { formatValue, isStale } from './city-data.js';

export function renderStats(city, source, { doc = document, now = Date.now() } = {}) {
  const el = doc.createElement('section');
  el.id = 'stats';
  el.dataset.source = source;
  el.dataset.stale = String(isStale(city, now));
  const rows = [
    ['AI tokens', 'tokens', formatValue(city.totals.tokens)],
    ['Commits', 'commits', formatValue(city.totals.commits)],
    ['Top language', 'top_language', formatValue(city.totals.top_language)],
    ['As of', 'as_of', city.generated_at.slice(0, 10)],
  ];
  const dl = el.appendChild(doc.createElement('dl'));
  for (const [label, stat, value] of rows) {
    dl.appendChild(doc.createElement('dt')).textContent = label;
    const dd = dl.appendChild(doc.createElement('dd'));
    dd.dataset.stat = stat;
    dd.textContent = value;
  }
  doc.body.appendChild(el);
  return el;
}
