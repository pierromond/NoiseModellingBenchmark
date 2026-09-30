// ─────────────────────────────────────────────
// THEME (dark by default, light alternative)
// ─────────────────────────────────────────────
function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
const C = cssVar;

function redrawCharts() {
  if (histoRedraw) histoRedraw();
  if (boxplotRedraw) boxplotRedraw();
  if (pairRefresh) pairRefresh();
  const mp = document.getElementById('panel-montagne');
  if (montagneChart && montagneData.length && mp && mp.classList.contains('active')) {
    drawMontagneScatter(montagneEntries());
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('nm-theme', theme); } catch (e) {}
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? 'Dark' : 'Light';
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  redrawCharts();
}

// Color palette per version index
const PALETTE = ['#00e5ff','#ff6b35','#7fff6b','#f7d716','#c77dff','#ff4081','#00e676','#ff9100','#40c4ff','#ea80fc','#b388ff','#1de9b6'];


const ISO_COLORS_BY_LVL = {
  0:  '#82a7ac',  // < 35
  1:  '#a0bbbf',  // 35-40
  2:  '#b8d6d1',  // 40-45
  3:  '#cfe4cc',  // 45-50
  4:  '#e3f2bf',  // 50-55
  5:  '#f4c683',  // 55-60
  6:  '#e87d4d',  // 60-65
  7:  '#cd463f',  // 65-70
  8:  '#a11a4d',  // 70-75
  9:  '#75095d',  // 75-80
  10: '#430a4a',  // > 80
};

const ISO_COLORS_BY_LABEL = {
  '< 35':  '#82a7ac',
  '35-40': '#a0bbbf',
  '40-45': '#b8d6d1',
  '45-50': '#cfe4cc',
  '50-55': '#e3f2bf',
  '55-60': '#f4c683',
  '60-65': '#e87d4d',
  '65-70': '#cd463f',
  '70-75': '#a11a4d',
  '75-80': '#75095d',
  '> 80':  '#430a4a',
};

function isoColor(labelOrLvl, lvl) {
  if (lvl !== undefined && ISO_COLORS_BY_LVL[lvl] !== undefined) {
    return ISO_COLORS_BY_LVL[lvl];
  }
  if (typeof labelOrLvl === 'number' && ISO_COLORS_BY_LVL[labelOrLvl] !== undefined) {
    return ISO_COLORS_BY_LVL[labelOrLvl];
  }

  const label = String(labelOrLvl || '').trim();
  if (ISO_COLORS_BY_LABEL[label]) return ISO_COLORS_BY_LABEL[label];

  const num = parseFloat(label);
  if (!isNaN(num)) {
    if (num < 35) return ISO_COLORS_BY_LVL[0];
    else if (num < 40) return ISO_COLORS_BY_LVL[1];
    else if (num < 45) return ISO_COLORS_BY_LVL[2];
    else if (num < 50) return ISO_COLORS_BY_LVL[3];
    else if (num < 55) return ISO_COLORS_BY_LVL[4];
    else if (num < 60) return ISO_COLORS_BY_LVL[5];
    else if (num < 65) return ISO_COLORS_BY_LVL[6];
    else if (num < 70) return ISO_COLORS_BY_LVL[7];
    else if (num < 75) return ISO_COLORS_BY_LVL[8];
    else if (num < 80) return ISO_COLORS_BY_LVL[9];
    else return ISO_COLORS_BY_LVL[10];
  }
  return '#82a7ac';
}

