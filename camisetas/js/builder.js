/* ============================================================
   KIT BUILDER — JS
   ============================================================ */

// ── BACKGROUND CANVAS ──────────────────────────────────────
(function initBg() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + .3,
      vx: (Math.random() - .5) * .25,
      vy: (Math.random() - .5) * .25,
      a: Math.random()
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 80 }, mkParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,255,136,0.035)';
    ctx.lineWidth = 1;
    const gs = 50;
    for (let x = 0; x < W; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${p.a * .4})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

// ── STATE ──────────────────────────────────────────────────
const S = {
  primary:   '#1a1a2e',
  secondary: '#1a1a2e',
  textColor: '#ffffff',
  name:      '',
  number:    '',
  font:      'Orbitron',
  badgeUrl:  null,
  badgePos:  'left',
  badgeSize: 48,
  kitStyle:  'solid',
  step:      1
};

const tabOrder = ['colors', 'badge', 'details', 'style'];

// ── SVG REFS ────────────────────────────────────────────────
const jBody      = document.getElementById('j-body');
const jSleeveL   = document.getElementById('j-sleeve-l');
const jSleeveR   = document.getElementById('j-sleeve-r');
const jCollar    = document.getElementById('j-collar');
const jNumber    = document.getElementById('j-number');
const jName      = document.getElementById('j-name');
const jBadge     = document.getElementById('j-badge');
const jBadgeBg   = document.getElementById('j-badge-bg');
const jBadgePh   = document.getElementById('j-badge-placeholder');
const jBadgeImg  = document.getElementById('j-badge-img');
const jPattern   = document.getElementById('j-pattern');
const jerseyGlow = document.getElementById('jersey-glow');
const statColor  = document.getElementById('stat-color');
const statStyle  = document.getElementById('stat-style');

// ── RENDER ──────────────────────────────────────────────────
function render() {
  // Body / collar
  jBody.setAttribute('fill', S.primary);
  jCollar.setAttribute('fill', shadeHex(S.primary, -25));

  // Sleeves
  jSleeveL.setAttribute('fill', S.secondary);
  jSleeveR.setAttribute('fill', S.secondary);

  // Text
  jNumber.setAttribute('fill', S.textColor);
  jName.setAttribute('fill', S.textColor);
  jNumber.style.fontFamily = `'${S.font}', monospace`;
  jName.textContent  = (S.name || 'TU NOMBRE').toUpperCase();
  jNumber.textContent = S.number || '10';
  jNumber.setAttribute('font-size', (S.number || '10').length > 2 ? '54' : '72');

  // Glow matches primary
  const gColor = hexToRgb(S.primary);
  jerseyGlow.style.background =
    `radial-gradient(circle, rgba(${gColor},0.4) 0%, transparent 70%)`;

  // Stats HUD
  statColor.textContent = S.primary.toUpperCase();
  const styleLabels = {
    solid: 'SÓLIDO', 'stripes-v': 'RAYAS V.',
    'stripes-h': 'RAYAS H.', diagonal: 'DIAGONAL',
    halves: 'MITADES', sash: 'BANDA'
  };
  statStyle.textContent = styleLabels[S.kitStyle] || S.kitStyle;

  // Pattern
  renderPattern();

  // Badge
  renderBadge();

  // Style cards mini update
  updateMiniCards();
}

// ── PATTERN ─────────────────────────────────────────────────
const BODY_PATH = 'M 95,68 L 42,105 L 58,136 L 95,118 L 95,300 L 245,300 L 245,118 L 282,136 L 298,105 L 245,68 Q 228,57 210,50 Q 198,82 170,88 Q 142,82 130,50 Q 112,57 95,68 Z';

function renderPattern() {
  // Clear old pattern
  while (jPattern.firstChild) jPattern.removeChild(jPattern.firstChild);

  const acc = S.secondary !== S.primary
    ? S.secondary
    : lightenHex(S.primary, 40);

  if (S.kitStyle === 'solid') return;

  const shapes = {
    'stripes-v': () => {
      [110, 135, 160, 185, 210].forEach((x, i) => {
        if (i % 2 === 0) addRect(x - 5, 40, 14, 270, acc, .18);
      });
    },
    'stripes-h': () => {
      [130, 170, 210, 250, 290].forEach(y => {
        addRect(40, y, 220, 12, acc, .18);
      });
    },
    'diagonal': () => {
      addPath('M 95,68 L 245,300 L 175,300 L 95,155 Z', acc, .22);
    },
    'halves': () => {
      addPath('M 170,50 L 245,68 L 282,136 L 298,105 L 245,68 Q 228,57 210,50 Q 198,82 170,88 Z M 170,88 L 245,118 L 245,300 L 170,300 Z', acc, .5);
    },
    'sash': () => {
      addPath('M 95,140 L 245,68 L 245,115 L 95,187 Z', acc, .3);
    }
  };

  shapes[S.kitStyle] && shapes[S.kitStyle]();
}

function addPath(d, fill, opacity) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', fill);
  el.setAttribute('opacity', opacity);
  el.setAttribute('clip-path', 'url(#clip-body)');
  jPattern.appendChild(el);
}
function addRect(x, y, w, h, fill, opacity) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  el.setAttribute('x', x); el.setAttribute('y', y);
  el.setAttribute('width', w); el.setAttribute('height', h);
  el.setAttribute('fill', fill); el.setAttribute('opacity', opacity);
  el.setAttribute('clip-path', 'url(#clip-body)');
  jPattern.appendChild(el);
}

// ── BADGE ────────────────────────────────────────────────────
function renderBadge() {
  const size = S.badgeSize;
  const positions = { left: 108, center: 170 - size / 2, right: 232 - size };
  const x = positions[S.badgePos] ?? 108;
  const y = 118;

  jBadge.setAttribute('transform', `translate(${x},${y})`);
  jBadgeBg.setAttribute('width', size);
  jBadgeBg.setAttribute('height', size);

  // Update clip
  const clipRect = document.querySelector('#badge-rclip rect');
  if (clipRect) {
    clipRect.setAttribute('width', size);
    clipRect.setAttribute('height', size);
    clipRect.setAttribute('rx', Math.round(size * .15));
  }

  if (S.badgeUrl) {
    jBadgeImg.setAttribute('href', S.badgeUrl);
    jBadgeImg.setAttribute('width', size);
    jBadgeImg.setAttribute('height', size);
    jBadgeImg.style.display = '';
    jBadgePh.style.display = 'none';
    jBadgeBg.setAttribute('stroke-dasharray', 'none');
  } else {
    jBadgeImg.setAttribute('href', '');
    jBadgeImg.style.display = 'none';
    jBadgePh.style.display = '';
    jBadgeBg.setAttribute('stroke-dasharray', '4,3');
    jBadgePh.setAttribute('x', size / 2);
    jBadgePh.setAttribute('y', size * .72);
  }
}

// ── MINI CARD UPDATES ────────────────────────────────────────
function updateMiniCards() {
  document.querySelectorAll('.sc-body').forEach(el => el.setAttribute('fill', S.primary));
  document.querySelectorAll('.sc-sleeve-l, .sc-sleeve-r').forEach(el => el.setAttribute('fill', S.secondary));
}

// ── COLOR HELPERS ────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function shadeHex(hex, amount) {
  let r = parseInt(hex.slice(1,3),16);
  let g = parseInt(hex.slice(3,5),16);
  let b = parseInt(hex.slice(5,7),16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `rgb(${r},${g},${b})`;
}
function lightenHex(hex, amount) {
  return shadeHex(hex, amount);
}

// ── SWATCH SETUP ─────────────────────────────────────────────
function setupSwatches(containerId, key, pickerEl) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.sw:not(.sw-custom)').forEach(sw => {
    sw.addEventListener('click', () => {
      container.querySelectorAll('.sw').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      S[key] = sw.dataset.c;
      render();
    });
  });
  document.getElementById(pickerEl).addEventListener('input', e => {
    container.querySelectorAll('.sw').forEach(s => s.classList.remove('active'));
    S[key] = e.target.value;
    render();
  });
}

setupSwatches('sw-primary',   'primary',   'cp-primary');
setupSwatches('sw-secondary', 'secondary', 'cp-secondary');
setupSwatches('sw-text',      'textColor', 'cp-text');

// ── PLAYER INPUTS ────────────────────────────────────────────
const inpName   = document.getElementById('inp-name');
const inpNumber = document.getElementById('inp-number');
const charCount = document.getElementById('char-count');

inpName.addEventListener('input', () => {
  S.name = inpName.value;
  charCount.textContent = inpName.value.length;
  render();
});
inpNumber.addEventListener('input', () => {
  let v = parseInt(inpNumber.value) || '';
  if (v > 99) { v = 99; inpNumber.value = 99; }
  S.number = String(v);
  render();
});

document.getElementById('num-minus').addEventListener('click', () => {
  let v = parseInt(inpNumber.value) || 1;
  v = Math.max(1, v - 1);
  inpNumber.value = v; S.number = String(v); render();
});
document.getElementById('num-plus').addEventListener('click', () => {
  let v = parseInt(inpNumber.value) || 0;
  v = Math.min(99, v + 1);
  inpNumber.value = v; S.number = String(v); render();
});

// ── FONTS ────────────────────────────────────────────────────
document.querySelectorAll('.font-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.font-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    S.font = opt.dataset.font;
    render();
  });
});

// ── KIT STYLES ───────────────────────────────────────────────
document.querySelectorAll('.style-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    S.kitStyle = card.dataset.style;
    render();
  });
});

// ── BADGE POSITION ───────────────────────────────────────────
document.querySelectorAll('.pos-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    S.badgePos = btn.dataset.pos;
    render();
  });
});

// ── BADGE SIZE SLIDER ────────────────────────────────────────
const badgeSizeSlider = document.getElementById('badge-size');
const badgeSizeVal    = document.getElementById('badge-size-val');
badgeSizeSlider.addEventListener('input', () => {
  S.badgeSize = parseInt(badgeSizeSlider.value);
  badgeSizeVal.textContent = S.badgeSize;
  render();
});

// ── BADGE UPLOAD ─────────────────────────────────────────────
const badgeInput     = document.getElementById('badge-input');
const dropZone       = document.getElementById('drop-zone');
const dropInner      = document.getElementById('drop-inner');
const btnUpload      = document.getElementById('btn-upload-badge');
const btnRemoveBadge = document.getElementById('btn-remove-badge');

function loadBadge(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    S.badgeUrl = e.target.result;
    dropInner.innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;object-fit:contain;border-radius:10px;">
      <p class="drop-title" style="font-size:12px;margin-top:4px">Escudo cargado &#x2713;</p>`;
    btnRemoveBadge.style.display = '';
    render();
  };
  reader.readAsDataURL(file);
}

btnUpload.addEventListener('click', () => badgeInput.click());
badgeInput.addEventListener('change', e => loadBadge(e.target.files[0]));
dropZone.addEventListener('click', () => badgeInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('over');
  loadBadge(e.dataTransfer.files[0]);
});

btnRemoveBadge.addEventListener('click', e => {
  e.stopPropagation();
  S.badgeUrl = null;
  btnRemoveBadge.style.display = 'none';
  dropInner.innerHTML = `
    <div class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
    <p class="drop-title">Arrastr&#xE1; tu escudo aqu&#xED;</p>
    <p class="drop-sub">PNG o SVG con fondo transparente &middot; M&#xE1;x 2MB</p>`;
  render();
});

// ── TABS ─────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tabbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tabbar-btn[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`pane-${tabName}`).classList.add('active');
  S.currentTab = tabName;

  const idx = tabOrder.indexOf(tabName);
  updateStepUI(idx + 1);
}

document.querySelectorAll('.tabbar-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── STEPS ────────────────────────────────────────────────────
function updateStepUI(stepNum) {
  S.step = stepNum;
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 === stepNum) el.classList.add('active');
    else if (i + 1 < stepNum) el.classList.add('done');
  });
  // Pips
  document.querySelectorAll('.step-pip').forEach((pip, i) => {
    pip.classList.remove('active', 'done');
    if (i + 1 === stepNum) pip.classList.add('active');
    else if (i + 1 < stepNum) pip.classList.add('done');
  });
}

document.getElementById('btn-next').addEventListener('click', () => {
  const idx = tabOrder.indexOf(S.currentTab || 'colors');
  if (idx < tabOrder.length - 1) {
    switchTab(tabOrder[idx + 1]);
  } else {
    openModal();
  }
});
document.getElementById('btn-prev').addEventListener('click', () => {
  const idx = tabOrder.indexOf(S.currentTab || 'colors');
  if (idx > 0) switchTab(tabOrder[idx - 1]);
});

// ── RESET ────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('¿Reiniciar el diseño?')) return;
  S.primary = '#1a1a2e'; S.secondary = '#1a1a2e'; S.textColor = '#ffffff';
  S.name = ''; S.number = ''; S.font = 'Orbitron';
  S.badgeUrl = null; S.badgePos = 'left'; S.badgeSize = 48; S.kitStyle = 'solid';
  inpName.value = ''; inpNumber.value = '';
  charCount.textContent = '0';
  badgeSizeSlider.value = 48; badgeSizeVal.textContent = '48';
  document.querySelectorAll('.sw').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#sw-primary .sw:first-child, #sw-secondary .sw:first-child, #sw-text .sw:first-child').forEach(s => s.classList.add('active'));
  document.querySelectorAll('.font-opt').forEach(o => o.classList.remove('active'));
  document.querySelector('.font-opt[data-font="Orbitron"]').classList.add('active');
  document.querySelectorAll('.style-card').forEach(c => c.classList.remove('active'));
  document.querySelector('.style-card[data-style="solid"]').classList.add('active');
  switchTab('colors');
  render();
});

// ── MODAL ────────────────────────────────────────────────────
document.getElementById('btn-squad').addEventListener('click', openModal);

function openModal() {
  const body = document.getElementById('modal-body');
  const rows = [
    ['🎨 Color Cuerpo', `<span class="modal-swatch" style="background:${S.primary}"></span>${S.primary.toUpperCase()}`],
    ['👕 Color Mangas', `<span class="modal-swatch" style="background:${S.secondary}"></span>${S.secondary.toUpperCase()}`],
    ['✏️ Nombre', S.name || '—'],
    ['🔢 Número', S.number || '—'],
    ['🛡 Escudo', S.badgeUrl ? '✓ Subido' : '—'],
    ['🧩 Estilo', statStyle.textContent]
  ];
  body.innerHTML = rows.map(([label, val]) =>
    `<div class="modal-row">
      <span class="modal-row-label">${label}</span>
      <span class="modal-row-val">${val}</span>
    </div>`
  ).join('');
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}
window.closeModal = closeModal;

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ── INIT ─────────────────────────────────────────────────────
S.currentTab = 'colors';
render();
