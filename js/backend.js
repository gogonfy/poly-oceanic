/* =========================================================
   POLY — статистика сайта и учёт покупок
   Данные хранятся в Firebase Realtime Database:
   stats/visits — уникальные браузеры всего,
   stats/daily/{дата} — уникальные браузеры за день,
   stats/peak/{дата} — пиковый онлайн за день,
   presence — активные вкладки прямо сейчас,
   status — статус сайта, purchases — клики «Купить».
   Без настроек (js/config.js) окно показывает демо-режим.
   ========================================================= */

(function () {
  'use strict';

  const config = window.POLY_CONFIG || {};
  const fbConfig = config.firebase || {};
  const dialog = document.getElementById('stats-dialog');
  const openButtons = document.querySelectorAll('[data-open-stats]');
  const isWeb = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  const isConfigured = Boolean(fbConfig.databaseURL) &&
    fbConfig.databaseURL.indexOf('YOUR-PROJECT') === -1 &&
    typeof window.firebase !== 'undefined';

  Array.prototype.forEach.call(document.querySelectorAll('[data-buy]'), function (link) {
    link.setAttribute('href', config.buyUrl || '#courses');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
  });

  const STATES = {
    ok: { label: 'Сайт работает', tone: 'ok' },
    maintenance: { label: 'Технические работы', tone: 'warn' },
    down: { label: 'Сайт недоступен', tone: 'down' },
    demo: { label: 'Демо-режим', tone: 'demo' },
    offline: { label: 'Открыт с файла', tone: 'demo' }
  };

  const DAYS = 14;
  const els = dialog ? {
    state: dialog.querySelector('[data-dialog-state]'),
    online: dialog.querySelector('[data-dialog-online]'),
    visits: dialog.querySelector('[data-dialog-visits]'),
    peak: dialog.querySelector('[data-dialog-peak]'),
    note: dialog.querySelector('[data-dialog-note]'),
    updated: dialog.querySelector('[data-dialog-updated]'),
    chart: dialog.querySelector('[data-chart]')
  } : null;

  const state = {
    mode: 'demo',
    status: { key: config.status || 'ok', note: config.statusNote || '' },
    online: null,
    visits: null,
    peakToday: null,
    daily: null
  };
  let lastPeakSent = 0;
  let db = null;

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function lastDays(count) {
    const out = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
    }
    return out;
  }

  function fmt(value) {
    return value === null || value === undefined ? '—' : String(value);
  }

  function stateInfo() {
    if (state.mode === 'offline') return { label: STATES.offline.label, tone: 'demo' };
    if (state.mode === 'demo') return { label: STATES.demo.label, tone: 'demo' };
    const info = STATES[state.status.key] || STATES.ok;
    return { label: state.status.note || info.label, tone: info.tone };
  }

  function renderDialog() {
    if (!els) return;
    const info = stateInfo();
    els.state.textContent = info.label;
    els.state.dataset.tone = info.tone;
    els.online.textContent = fmt(state.online);
    els.visits.textContent = fmt(state.visits);
    els.peak.textContent = fmt(state.peakToday);

    if (state.mode === 'demo') {
      els.note.textContent = 'Демо-режим: чтобы видеть реальную статистику, заполните блок firebase в js/config.js.';
    } else if (state.mode === 'offline') {
      els.note.textContent = 'Страница открыта как файл. Статистика доступна при запуске через start-server.bat или на сайте.';
    } else {
      els.note.textContent = 'Посетитель считается один раз в браузере. Пик онлайна — максимум одновременно открытых вкладок за день.';
    }

    const now = new Date();
    els.updated.textContent = 'Обновлено ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

    renderChart();
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function renderChart() {
    if (!els) return;
    const W = 640;
    const H = 230;
    const left = 40;
    const right = 8;
    const top = 18;
    const bottom = 34;
    const innerW = W - left - right;
    const innerH = H - top - bottom;

    const keys = lastDays(DAYS);
    const today = dayKey(new Date());
    const values = keys.map(function (k) {
      return (state.daily && state.daily[k]) || 0;
    });
    const max = Math.max(4, Math.ceil(Math.max.apply(null, values) * 1.2));

    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'График посещений за 14 дней' });
    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: 'stats-grad-today', x1: '0', y1: '0', x2: '0', y2: '1' });
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#5a80ff' }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#1f4fe0' }));
    const gradRest = svgEl('linearGradient', { id: 'stats-grad-rest', x1: '0', y1: '0', x2: '0', y2: '1' });
    gradRest.appendChild(svgEl('stop', { offset: '0', 'stop-color': '#46c9bf' }));
    gradRest.appendChild(svgEl('stop', { offset: '1', 'stop-color': '#0f9d8a' }));
    defs.appendChild(grad);
    defs.appendChild(gradRest);
    svg.appendChild(defs);

    for (let g = 0; g <= 4; g++) {
      const value = Math.round((max / 4) * g);
      const y = top + innerH - (innerH * g) / 4;
      svg.appendChild(svgEl('line', { x1: left, x2: W - right, y1: y, y2: y, class: 'chart-grid' }));
      const label = svgEl('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-axis' });
      label.textContent = String(value);
      svg.appendChild(label);
    }

    const slot = innerW / DAYS;
    const barW = Math.min(34, slot * 0.56);

    keys.forEach(function (key, index) {
      const value = values[index];
      const h = (value / max) * innerH;
      const x = left + index * slot + (slot - barW) / 2;
      const y = top + innerH - h;
      const isToday = key === today;
      const parts = key.split('-');

      const group = svgEl('g', { class: 'chart-bar' + (isToday ? ' is-today' : '') });
      const title = svgEl('title', {});
      title.textContent = parts[2] + '.' + parts[1] + ': ' + value;
      group.appendChild(title);

      if (h > 0) {
        group.appendChild(svgEl('rect', {
          x: x,
          y: y,
          width: barW,
          height: Math.max(h, 3),
          rx: 7,
          fill: isToday ? 'url(#stats-grad-today)' : 'url(#stats-grad-rest)'
        }));
      } else {
        group.appendChild(svgEl('rect', {
          x: x,
          y: top + innerH - 3,
          width: barW,
          height: 3,
          rx: 1.5,
          class: 'chart-empty'
        }));
      }

      if (value > 0) {
        const v = svgEl('text', { x: x + barW / 2, y: y - 7, 'text-anchor': 'middle', class: 'chart-value' });
        v.textContent = String(value);
        group.appendChild(v);
      }

      const label = svgEl('text', {
        x: x + barW / 2,
        y: H - 10,
        'text-anchor': 'middle',
        class: 'chart-label' + (isToday ? ' is-today' : '')
      });
      label.textContent = parts[2] + '.' + parts[1];
      group.appendChild(label);

      svg.appendChild(group);
    });

    els.chart.innerHTML = '';
    els.chart.appendChild(svg);
    els.chart.scrollLeft = els.chart.scrollWidth;
  }

  function loadDaily() {
    if (!db) {
      renderChart();
      return;
    }
    db.ref('stats/daily').limitToLast(DAYS).once('value').then(function (snap) {
      state.daily = snap.val() || {};
      renderChart();
    }).catch(function () {
      renderChart();
    });
  }

  function openStats() {
    if (!dialog || dialog.open) return;
    const navToggle = document.querySelector('.nav-toggle');
    if (navToggle && document.body.classList.contains('nav-open')) navToggle.click();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
    renderDialog();
    loadDaily();
  }

  function closeStats() {
    if (!dialog || !dialog.open) return;
    dialog.close();
  }

  if (dialog) {
    Array.prototype.forEach.call(openButtons, function (btn) {
      btn.addEventListener('click', openStats);
    });
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-stats-close]'), function (btn) {
      btn.addEventListener('click', closeStats);
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeStats();
    });
    dialog.addEventListener('close', function () {
      document.body.classList.remove('dialog-open');
    });
  } else {
    Array.prototype.forEach.call(openButtons, function (btn) {
      btn.hidden = true;
    });
  }

  function updatePeak(count) {
    if (!db) return;
    if (count <= (state.peakToday || 0) || count <= lastPeakSent) return;
    lastPeakSent = count;
    db.ref('stats/peak/' + dayKey(new Date())).transaction(function (current) {
      return Math.max(current || 0, count);
    });
  }

  if (!isConfigured || !isWeb) {
    state.mode = isWeb ? 'demo' : 'offline';
    renderDialog();
    return;
  }

  state.mode = 'live';
  firebase.initializeApp(fbConfig);
  db = firebase.database();

  Array.prototype.forEach.call(document.querySelectorAll('[data-buy]'), function (link) {
    link.addEventListener('click', function () {
      db.ref('purchases').push({
        course: link.dataset.buy,
        page: window.location.pathname,
        t: firebase.database.ServerValue.TIMESTAMP
      });
    });
  });

  db.ref('status').on('value', function (snap) {
    const value = snap.val() || {};
    if (STATES[value.state]) state.status.key = value.state;
    state.status.note = value.note || config.statusNote || '';
    renderDialog();
  });

  const todayKey = dayKey(new Date());

  const totalKey = 'poly-fb-visit-v1';
  if (localStorage.getItem(totalKey) !== '1') {
    db.ref('stats/visits').transaction(function (current) {
      return (current || 0) + 1;
    }, function (error, committed) {
      if (!error && committed) localStorage.setItem(totalKey, '1');
    });
  }

  const dayStorageKey = 'poly-fb-day-v1';
  if (localStorage.getItem(dayStorageKey) !== todayKey) {
    db.ref('stats/daily/' + todayKey).transaction(function (current) {
      return (current || 0) + 1;
    }, function (error, committed) {
      if (!error && committed) localStorage.setItem(dayStorageKey, todayKey);
    });
  }

  db.ref('stats/visits').on('value', function (snap) {
    state.visits = snap.val() || 0;
    renderDialog();
  });

  db.ref('stats/peak/' + todayKey).on('value', function (snap) {
    state.peakToday = snap.val() || 0;
    renderDialog();
  });

  db.ref('.info/connected').on('value', function (snap) {
    if (snap.val() !== true) return;
    const presenceRef = db.ref('presence').push();
    presenceRef.onDisconnect().remove();
    presenceRef.set({
      page: window.location.pathname,
      t: firebase.database.ServerValue.TIMESTAMP
    });
  });

  db.ref('presence').on('value', function (snap) {
    state.online = snap.numChildren();
    renderDialog();
    updatePeak(state.online);
  });

  renderDialog();
})();
