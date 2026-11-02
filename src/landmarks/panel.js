// Landmark panel: the fields for one landmark, proximity choice, and the flat
// HTML copy of the panel (phones, screen readers, tests). Unstyled on purpose:
// the 3D panel and all styling belong to the design tickets.
import { LANDMARKS } from './registry.js';
import { formatValue, DASH } from '../data/city-data.js';

export function panelModel(key, city) {
  const { name, line, site } = LANDMARKS.find((l) => l.key === key);
  const stats = city.landmarks[key];
  return {
    key, name, line,
    commits: formatValue(stats.commits_total),
    commits30d: formatValue(stats.commits_30d),
    lastUpdate: stats.pushed_this_week ? 'pushed this week' : (stats.last_push_date ?? DASH),
    language: formatValue(stats.language),
    site,
  };
}

// spots: [{ key, x, z }]; returns the nearest key within radius, or null.
export function nearestLandmark(position, spots, radius) {
  let best = null;
  let bestD = radius;
  for (const s of spots) {
    const d = Math.hypot(s.x - position.x, s.z - position.z);
    if (d <= bestD) [best, bestD] = [s.key, d];
  }
  return best;
}

// Flat HTML panel; holds which landmark is open.
export function createPanel(doc = document) {
  const el = doc.createElement('section');
  el.id = 'landmark-panel';
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  doc.body.appendChild(el);
  const panel = {
    current: null,
    open(model) {
      if (panel.current === model.key) return;
      panel.current = model.key;
      el.dataset.landmark = model.key;
      el.replaceChildren();
      const add = (tag, text, field) => {
        const n = el.appendChild(doc.createElement(tag));
        n.textContent = text;
        if (field) n.dataset.field = field;
        return n;
      };
      add('h2', model.name, 'name');
      add('p', model.line, 'line');
      const dl = el.appendChild(doc.createElement('dl'));
      for (const [label, field] of [['Commits', 'commits'], ['Last 30 days', 'commits30d'], ['Last update', 'lastUpdate'], ['Language', 'language']]) {
        dl.appendChild(doc.createElement('dt')).textContent = label;
        const dd = dl.appendChild(doc.createElement('dd'));
        dd.textContent = model[field];
        dd.dataset.field = field;
      }
      if (model.site) {
        const a = add('a', 'Visit site', 'site');
        a.href = model.site;
        a.target = '_blank';
        a.rel = 'noopener';
      }
      const close = add('button', 'Close');
      close.type = 'button';
      close.addEventListener('click', () => panel.close());
      el.hidden = false;
    },
    close() {
      panel.current = null;
      el.hidden = true;
      delete el.dataset.landmark;
    },
  };
  return panel;
}
