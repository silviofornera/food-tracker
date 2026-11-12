/* Food Tracker - UI. All logic lives in nutrition/store/api/drive; this file only wires DOM. */
(function () {
  'use strict';
  var FT = window.FT, N = FT.nutrition, api = FT.api;
  var store = FT.store.createStore();
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var SINGLE = !!window.FT_SINGLE;                        // true in the inlined single-file build
  var ARTIFACT = !!(window.claude && typeof window.claude.use === 'function');   // running as a Claude artifact
  var cloud = null, caps = { downloads: null, mcp: null }, cloudMsg = '';
  var FINE = window.matchMedia && matchMedia('(pointer: fine)').matches;

  var ui = {
    date: N.dateKey(), query: '', meal: null, flash: null,
    remote: { off: { st: 'idle', foods: [], q: '' }, usda: { st: 'idle', foods: [], q: '' } },
    known: {}, cache: {}, timer: null, ctl: null, sheetClose: null, syncing: false, syncTimer: null
  };
  var q = $('#q');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function settings() { return store.state.settings; }
  function kc(v) { return N.fmt(v, 0); }
  function g1(v) { return N.fmt(v, v < 10 ? 1 : 0); }
  function know(f) { ui.known[f.id] = f; return f; }
  function foodById(id) { return ui.known[id] || store.getFood(id); }
  function unitText(qty, unit) { return unit.g === 1 ? N.fmt(qty) + ' ' + unit.label : N.fmt(qty) + ' × ' + unit.label.replace(/^1 /, ''); }
  function defaultFor(food) {
    var units = N.unitsFor(food, { imperial: settings().imperial });
    var d = N.defaultPortion(units, store.lastPortion(food.id));
    return { units: units, qty: d.qty, unit: units[d.unitIndex] };
  }

  /* ================= header ================= */
  function renderHeader() {
    var d = N.parseDateKey(ui.date), today = N.dateKey();
    var rel = ui.date === today ? 'Today' : ui.date === N.shiftDate(today, -1) ? 'Yesterday' : ui.date === N.shiftDate(today, 1) ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' });
    $('#date-label').innerHTML = esc(rel) + '<small>' + esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) + '</small>';
    var t = store.totalsFor(ui.date), tg = settings().targets, left = tg.kcal - t.kcal;
    function pct(v, max) { return max > 0 ? Math.min(100, v / max * 100).toFixed(1) : 0; }
    function macro(k, label) {
      return '<div class="m-' + k + '">' + label + ' <b>' + kc(t[k]) + '</b> / ' + kc(tg[k]) + ' g<div class="bar"><i style="width:' + pct(t[k], tg[k]) + '%"></i></div></div>';
    }
    $('#totals').innerHTML =
      '<div class="kcal-line"><b>' + kc(t.kcal) + '</b><span>/ ' + kc(tg.kcal) + ' kcal</span><span class="left' + (left < 0 ? ' over' : '') + '">' +
      (left >= 0 ? kc(left) + ' left' : kc(-left) + ' over') + '</span></div><div class="bar"><i style="width:' + pct(t.kcal, tg.kcal) + '%"></i></div>' +
      '<div class="macros">' + macro('p', 'Protein') + macro('c', 'Carbs') + macro('f', 'Fat') + '</div>';
    $('#sync-btn').hidden = !settings().driveClientId;
    q.placeholder = ui.meal ? 'Add to ' + N.MEAL_LABEL[ui.meal] : 'Search food to add';
  }

  /* ================= home (quick picks + day log) ================= */
  function renderHome() {
    var html = '', seen = {}, picks = [];
    store.favorites().forEach(function (f) { seen[f.id] = 1; picks.push({ f: f, fav: true }); });
    store.recents(14).forEach(function (f) { if (!seen[f.id]) picks.push({ f: f }); });
    if (picks.length) {
      html += '<h2>Favorites &amp; recent</h2><div class="quick">' + picks.slice(0, 20).map(function (x) {
        var d = defaultFor(x.f), n = N.nutrientsFor(x.f.per100, N.portionAmount(d.qty, d.unit));
        return '<button class="qchip" data-act="food" data-id="' + esc(x.f.id) + '"><b>' + (x.fav ? '<span class="star">★</span> ' : '') + esc(x.f.name) + '</b><span>' +
          esc(unitText(d.qty, d.unit)) + ' · ' + kc(n.kcal) + ' kcal</span></button>';
      }).join('') + '</div>';
    }
    var entries = store.entriesFor(ui.date);
    N.MEALS.forEach(function (meal) {
      var list = entries.filter(function (e) { return e.meal === meal; }), sum = N.sum(list);
      html += '<h2>' + N.MEAL_LABEL[meal] + '<span class="h-kcal">' + (list.length ? kc(sum.kcal) + ' kcal' : '') + '</span>' +
        '<button class="add" data-act="meal-add" data-meal="' + meal + '" aria-label="Add to ' + N.MEAL_LABEL[meal] + '">+</button></h2>';
      if (list.length) {
        html += '<div class="card">' + list.map(function (e) {
          var sub = e.foodId ? unitText(e.qty, { label: e.unit, g: e.unitG }) + (e.unitG !== 1 ? ' · ' + N.fmt(e.amount, 0) + ' ' + e.base : '') : 'quick add';
          return '<div class="entry' + (ui.flash === e.id ? ' flash' : '') + '" data-act="entry" data-id="' + e.id + '"><div class="row-main"><div class="row-name">' + esc(e.name) +
            (e.brand ? ' <span class="brand">' + esc(e.brand) + '</span>' : '') + '</div><div class="row-sub">' + esc(sub) + '</div></div>' +
            '<div class="row-kcal">' + kc(e.kcal) + '<small>P' + kc(e.p) + ' C' + kc(e.c) + ' F' + kc(e.f) + '</small></div></div>';
        }).join('') + '</div>';
      }
    });
    html += '<div class="actions"><button class="btn" data-act="quick">Quick add kcal</button><button class="btn" data-act="custom">New custom food</button></div>';
    $('#home').innerHTML = html;
    ui.flash = null;
  }

  /* ================= search results ================= */
  function foodRow(f) {
    know(f);
    var d = defaultFor(f), n = N.nutrientsFor(f.per100, N.portionAmount(d.qty, d.unit));
    var tag = f.src === 'off' ? 'OFF' : f.src === 'usda' ? 'USDA' : f.src === 'custom' ? 'MINE' : '';
    return '<div class="row" data-act="food" data-id="' + esc(f.id) + '"><div class="row-main"><div class="row-name">' + (store.isFavorite(f.id) ? '★ ' : '') + esc(f.name) +
      (f.brand ? ' <span class="brand">' + esc(f.brand) + '</span>' : '') + '</div><div class="row-sub">' + esc(unitText(d.qty, d.unit)) + ' · ' + kc(n.kcal) + ' kcal' +
      (tag ? '<span class="tag">' + tag + '</span>' : '') + '</div></div>' +
      '<button class="fast" data-act="fast" data-id="' + esc(f.id) + '" aria-label="Add ' + esc(unitText(d.qty, d.unit)) + '">+</button></div>';
  }
  function renderResults() {
    var on = !!ui.query;
    $('#results').hidden = !on; $('#home').hidden = on; $('#cancel-btn').hidden = !on;
    if (!on) { $('#results').innerHTML = ''; return; }
    var local = store.searchLocal(ui.query, 20), seen = {}, html = '';
    local.forEach(function (f) { seen[f.id] = 1; });
    html += local.length ? '<div class="card">' + local.map(foodRow).join('') + '</div>' : '';
    [['off', 'Open Food Facts'], ['usda', 'USDA FoodData Central']].forEach(function (s) {
      var r = ui.remote[s[0]];
      if (r.st === 'idle' || r.q !== ui.query) return;
      var foods = r.foods.filter(function (f) { return !seen[f.id]; });
      html += '<h2' + (r.st === 'load' ? ' class="dots"' : '') + '>' + s[1] + '</h2>';
      if (r.st === 'err') html += '<div class="src-note">' + esc(r.msg) + '</div>';
      else if (foods.length) html += '<div class="card">' + foods.map(foodRow).join('') + '</div>';
      else if (r.st === 'done') html += '<div class="src-note">No matches.</div>';
    });
    html += '<div class="actions"><button class="btn" data-act="custom">Create “' + esc(ui.query) + '”</button>' +
      (!ARTIFACT && /^\d{8,14}$/.test(ui.query) ? '<button class="btn" data-act="barcode-q">Look up barcode</button>' : '') + '</div>';
    $('#results').innerHTML = html;
  }
  function errText(name, e) {
    if (e && e.status === 429) return name + ': rate limit reached' + (name === 'USDA' && settings().usdaKey === 'DEMO_KEY' ? ' (add your own free API key in Settings).' : '.');
    if (e && e.status === 403) return name + ': API key rejected (check Settings).';
    return name + ' is unreachable right now (offline or blocked). Local foods still work.';
  }
  function remoteSearch(query) {
    if (ui.ctl) ui.ctl.abort();
    clearTimeout(ui.timer);
    var s = settings(), sources = [];
    if (!ARTIFACT && query.length >= 2 && !/^\d+$/.test(query)) {   // artifacts cannot reach other hosts
      if (s.useOFF) sources.push(['off', 'Open Food Facts', function (o) { return api.searchOFF(query, o); }]);
      if (s.useUSDA) sources.push(['usda', 'USDA', function (o) { return api.searchUSDA(query, s.usdaKey, o); }]);
    }
    ['off', 'usda'].forEach(function (k) { ui.remote[k] = { st: 'idle', foods: [], q: query }; });
    if (!sources.length) return;
    sources.forEach(function (src) {
      var hit = ui.cache[src[0] + '|' + query];
      if (hit) ui.remote[src[0]] = { st: 'done', foods: hit, q: query };
    });
    ui.timer = setTimeout(function () {
      var ctl = ui.ctl = window.AbortController ? new AbortController() : null;
      sources.forEach(function (src) {
        if (ui.remote[src[0]].st === 'done') return;
        ui.remote[src[0]] = { st: 'load', foods: [], q: query };
        src[2]({ signal: ctl && ctl.signal }).then(function (foods) {
          ui.cache[src[0] + '|' + query] = foods;
          if (ui.query === query) { ui.remote[src[0]] = { st: 'done', foods: foods, q: query }; renderResults(); }
        }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (ui.query === query) { ui.remote[src[0]] = { st: 'err', foods: [], q: query, msg: errText(src[1], e) }; renderResults(); }
        });
      });
      if (ui.query === query) renderResults();
    }, 320);
  }
  function setQuery(v) {
    ui.query = v.trim().toLowerCase() ? v.trim() : '';
    remoteSearch(ui.query);
    renderResults();
  }
  function endSearch(refocus) {
    q.value = ''; ui.meal = null; setQuery(''); renderHeader();
    if (refocus && FINE) q.focus(); else q.blur();
    window.scrollTo(0, 0);
  }

  /* ================= toast ================= */
  var toastTimer;
  function toast(msg, undo) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button>Undo</button>' : '');
    t.hidden = false;
    if (undo) $('button', t).onclick = function () { t.hidden = true; undo(); renderAll(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, undo ? 5000 : 2600);
  }

  /* ================= sheet ================= */
  function openSheet(html, onClose) {
    closeSheet();
    var s = $('#sheet'); s.innerHTML = html; s.hidden = false; s.scrollTop = 0; $('#backdrop').hidden = false;
    ui.sheetClose = onClose || null;
    return s;
  }
  function closeSheet() {
    if (ui.sheetClose) { var fn = ui.sheetClose; ui.sheetClose = null; fn(); }
    $('#sheet').hidden = true; $('#sheet').innerHTML = ''; $('#backdrop').hidden = true;
  }
  function head(title, sub, extra) {
    return '<div class="sheet-head"><h1>' + esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</h1>' + (extra || '') +
      '<button class="icon small" data-act="close" aria-label="Close">✕</button></div>';
  }
  function mealChips(sel) {
    return '<div class="label">Meal</div><div class="chips" id="meals">' + N.MEALS.map(function (m) {
      return '<button class="chip' + (m === sel ? ' on' : '') + '" data-meal="' + m + '">' + N.MEAL_LABEL[m] + '</button>';
    }).join('') + '</div>';
  }
  function bindChips(el, attr, cb) {
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[' + attr + ']'); if (!b) return;
      $$('.chip', el).forEach(function (c) { c.classList.toggle('on', c === b); });
      cb(b.getAttribute(attr));
    });
  }

  /* ---------- log a food ---------- */
  function logFood(food, qty, unit, meal) {
    var e = store.addEntry({ food: food, qty: qty, unit: unit, date: ui.date, meal: meal || ui.meal || N.mealForTime() });
    ui.flash = e.id;
    closeSheet(); endSearch(true); renderAll();
    toast('Added ' + unitText(e.qty, unit) + ' ' + food.name + ' · ' + kc(e.kcal) + ' kcal', function () { store.deleteEntry(e.id); });
    return e;
  }

  /* ---------- portion sheet (add or edit) ---------- */
  function openPortion(food, entry) {
    know(food);
    var units = N.unitsFor(food, { imperial: settings().imperial }), cur, qty, meal;
    if (entry) {
      cur = units.filter(function (u) { return u.label === entry.unit; })[0];
      if (!cur) { cur = { label: entry.unit, g: entry.unitG }; units.unshift(cur); }
      qty = entry.qty; meal = entry.meal;
    } else {
      var d = N.defaultPortion(units, store.lastPortion(food.id));
      cur = units[d.unitIndex]; qty = d.qty; meal = ui.meal || N.mealForTime();
    }
    var base = food.base || 'g', p = food.per100;
    var s = openSheet(
      head(food.name, (food.brand ? food.brand + ' · ' : '') + kc(p.kcal) + ' kcal · P ' + g1(p.p) + ' · C ' + g1(p.c) + ' · F ' + g1(p.f) + ' per 100 ' + base,
        '<button class="icon small star-btn' + (store.isFavorite(food.id) ? ' on' : '') + '" id="fav" aria-label="Favorite">★</button>') +
      '<div class="qty-row"><button class="step" id="minus" aria-label="Less">−</button>' +
      '<input id="qty" type="text" inputmode="decimal" autocomplete="off" aria-label="Quantity" value="' + N.fmt(qty, 2) + '">' +
      '<button class="step" id="plus" aria-label="More">+</button></div>' +
      '<div class="chips scroll" id="units"></div><div class="amount" id="amount"></div>' +
      '<div class="live"><div class="k"><b id="l-kcal"></b><span>kcal</span></div><div class="lp"><b id="l-p"></b><span>protein g</span></div>' +
      '<div class="lc"><b id="l-c"></b><span>carbs g</span></div><div class="lf"><b id="l-f"></b><span>fat g</span></div></div>' +
      mealChips(meal) +
      (entry ? '<div class="btn-row"><button class="btn danger" id="del">Delete</button><button class="btn primary" id="go">Save</button></div>'
        : '<div class="btn-row"><button class="btn primary big" id="go"></button></div>') +
      (food.src === 'custom' && !entry ? '<div class="btn-row"><button class="btn" id="edit-food">Edit food</button></div>' : ''));
    var qin = $('#qty', s);
    function drawUnits() {
      $('#units', s).innerHTML = units.map(function (u, i) { return '<button class="chip' + (u === cur ? ' on' : '') + '" data-u="' + i + '">' + esc(u.label) + '</button>'; }).join('');
    }
    function live() {
      qty = N.num(qin.value);
      var amt = N.portionAmount(qty, cur), n = N.nutrientsFor(p, amt);
      $('#l-kcal', s).textContent = kc(n.kcal); $('#l-p', s).textContent = g1(n.p); $('#l-c', s).textContent = g1(n.c); $('#l-f', s).textContent = g1(n.f);
      $('#amount', s).textContent = cur.g === 1 ? '' : '= ' + N.fmt(amt, amt < 20 ? 1 : 0) + ' ' + base;
      if (!entry) $('#go', s).textContent = 'Add to ' + N.MEAL_LABEL[meal];
      $('#go', s).disabled = !(qty > 0);
    }
    function setQty(v) { qin.value = N.fmt(Math.max(0, v), 2); live(); }
    $('#units', s).addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-u]'); if (!b) return;
      var next = units[+b.getAttribute('data-u')];
      // switching between a counted unit and raw g/ml: pick a sensible quantity instead of "1 g" / "100 cups"
      if (next.g === 1 && cur.g !== 1) setQty(Math.round(N.portionAmount(qty, cur)) || 100);
      else if (next.g !== 1 && cur.g === 1) setQty(1);
      cur = next; drawUnits(); live();
    });
    $('#minus', s).onclick = function () { var st = cur.g === 1 ? 10 : 0.5; setQty(Math.max(st, N.round(qty - st, 2))); };
    $('#plus', s).onclick = function () { var st = cur.g === 1 ? 10 : 0.5; setQty(N.round(qty + st, 2)); };
    qin.addEventListener('input', live);
    qin.addEventListener('focus', function () { qin.select(); });
    qin.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); $('#go', s).click(); } });
    bindChips($('#meals', s), 'data-meal', function (m) { meal = m; live(); });
    $('#fav', s).onclick = function () { this.classList.toggle('on', store.toggleFavorite(food)); };
    $('#go', s).onclick = function () {
      if (!(qty > 0)) return;
      if (entry) { store.updateEntry(entry.id, { qty: qty, unit: cur, meal: meal }); ui.flash = entry.id; closeSheet(); renderAll(); }
      else logFood(food, qty, cur, meal);
    };
    if (entry) $('#del', s).onclick = function () { removeEntry(entry); };
    if ($('#edit-food', s)) $('#edit-food', s).onclick = function () { openCustom(food); };
    drawUnits(); live();
    if (FINE) { qin.focus(); qin.select(); }

    // USDA search rows often carry no household units; pull them from the detail record in the background.
    if (food.src === 'usda' && !food.detailed && (food.units || []).length < 2 && settings().useUSDA) {
      api.detailUSDA(food.fdcId, settings().usdaKey).then(function (full) {
        food.detailed = true;
        if (!full || !full.units.length) return;
        var have = {}; (food.units || []).forEach(function (u) { have[u.label.toLowerCase()] = 1; });
        food.units = (food.units || []).concat(full.units.filter(function (u) { return !have[u.label.toLowerCase()]; }));
        if (store.state.foods[food.id]) store.saveFood(food);
        if (!$('#sheet').hidden && $('#qty', s) === qin) {
          var keep = cur.label; units = N.unitsFor(food, { imperial: settings().imperial });
          cur = units.filter(function (u) { return u.label === keep; })[0] || units[0]; drawUnits(); live();
        }
      }).catch(function () { });
    }
  }
  function removeEntry(entry) {
    store.deleteEntry(entry.id); closeSheet(); renderAll();
    toast('Deleted ' + entry.name, function () { store.restoreEntry(entry); });
  }
  function openEntry(id) {
    var e = store.state.entries[id]; if (!e || e.del) return;
    if (!e.foodId) return openQuick(e);
    var food = store.getFood(e.foodId);
    if (!food) {   // food record gone: rebuild enough from the entry snapshot to rescale it
      var k = e.amount > 0 ? 100 / e.amount : 0;
      food = { id: e.foodId, src: 'entry', name: e.name, brand: e.brand, base: e.base, per100: { kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k }, units: [{ label: e.unit, g: e.unitG }] };
    }
    openPortion(food, e);
  }

  /* ---------- quick add kcal ---------- */
  function openQuick(entry) {
    var meal = entry ? entry.meal : ui.meal || N.mealForTime(), e = entry || {};
    var s = openSheet(head(entry ? 'Edit quick add' : 'Quick add', 'Raw calories, no food lookup') +
      '<form class="form" id="f"><label>Calories (kcal)</label><input type="text" inputmode="decimal" id="qa-kcal" value="' + (entry ? kc(e.kcal) : '') + '">' +
      '<label>Protein / carbs / fat in g (optional)</label><div class="grid4" style="grid-template-columns:repeat(3,1fr)">' +
      '<input type="text" inputmode="decimal" id="qa-p" placeholder="P" value="' + (e.p ? g1(e.p) : '') + '"><input type="text" inputmode="decimal" id="qa-c" placeholder="C" value="' + (e.c ? g1(e.c) : '') + '">' +
      '<input type="text" inputmode="decimal" id="qa-f" placeholder="F" value="' + (e.f ? g1(e.f) : '') + '"></div>' +
      '<label>Label (optional)</label><input type="text" id="qa-name" value="' + esc(entry ? e.name : '') + '" placeholder="Quick add">' + mealChips(meal) +
      '<div class="btn-row">' + (entry ? '<button type="button" class="btn danger" id="del">Delete</button>' : '') +
      '<button class="btn primary' + (entry ? '' : ' big') + '">' + (entry ? 'Save' : 'Add') + '</button></div></form>');
    bindChips($('#meals', s), 'data-meal', function (m) { meal = m; });
    $('#meals', s).addEventListener('click', function (ev) { ev.preventDefault(); });
    if (entry) $('#del', s).onclick = function () { removeEntry(entry); };
    $('#f', s).onsubmit = function (ev) {
      ev.preventDefault();
      var v = { kcal: N.num($('#qa-kcal', s).value), p: N.num($('#qa-p', s).value), c: N.num($('#qa-c', s).value), f: N.num($('#qa-f', s).value), name: $('#qa-name', s).value.trim() || 'Quick add' };
      if (!v.kcal && (v.p || v.c || v.f)) v.kcal = N.round(N.kcalFromMacros(v.p, v.c, v.f), 0);
      if (!(v.kcal > 0)) { $('#qa-kcal', s).focus(); return; }
      if (entry) { store.updateEntry(entry.id, Object.assign({ meal: meal }, v)); ui.flash = entry.id; closeSheet(); renderAll(); return; }
      var ne = store.quickAdd(Object.assign({ date: ui.date, meal: meal }, v));
      ui.flash = ne.id; closeSheet(); endSearch(false); renderAll();
      toast('Added ' + kc(ne.kcal) + ' kcal', function () { store.deleteEntry(ne.id); });
    };
    $('#qa-kcal', s).focus();
  }

  /* ---------- custom food ---------- */
  function openCustom(food) {
    var f = food || { name: ui.query && !/^\d+$/.test(ui.query) ? ui.query : '', brand: '', base: 'g', per100: {}, units: [] }, base = f.base || 'g';
    var u = (f.units || []).concat([{}, {}]).slice(0, 2), p = f.per100 || {};
    function v(x) { return x == null || x === '' ? '' : esc(N.fmt(x, 1)); }
    function unitRow(i) {
      return '<div class="grid2"><input type="text" id="cu-l' + i + '" placeholder="e.g. 1 slice" value="' + esc(u[i].label || '') + '">' +
        '<input type="text" inputmode="decimal" id="cu-g' + i + '" placeholder="g / ml" value="' + v(u[i].g) + '"></div>';
    }
    var s = openSheet(head(food ? 'Edit food' : 'New custom food') +
      '<form class="form" id="f"><label>Name</label><input type="text" id="cu-name" value="' + esc(f.name) + '">' +
      '<label>Brand (optional)</label><input type="text" id="cu-brand" value="' + esc(f.brand || '') + '">' +
      '<div class="label">Measured in</div><div class="chips" id="cu-base"><button type="button" class="chip' + (base === 'g' ? ' on' : '') + '" data-b="g">grams (solid)</button>' +
      '<button type="button" class="chip' + (base === 'ml' ? ' on' : '') + '" data-b="ml">ml (liquid)</button></div>' +
      '<label>Per 100 <span id="cu-bl">' + base + '</span>: kcal / protein / carbs / fat</label><div class="grid4">' +
      '<input type="text" inputmode="decimal" id="cu-kcal" placeholder="kcal" value="' + v(p.kcal) + '"><input type="text" inputmode="decimal" id="cu-p" placeholder="P" value="' + v(p.p) + '">' +
      '<input type="text" inputmode="decimal" id="cu-c" placeholder="C" value="' + v(p.c) + '"><input type="text" inputmode="decimal" id="cu-f" placeholder="F" value="' + v(p.f) + '"></div>' +
      '<label>Household portions (optional): name and size</label>' + unitRow(0) + '<div style="height:8px"></div>' + unitRow(1) +
      '<div class="btn-row">' + (food ? '<button type="button" class="btn danger" id="del">Delete food</button>' : '') + '<button class="btn primary">Save food</button></div></form>');
    bindChips($('#cu-base', s), 'data-b', function (b) { base = b; $('#cu-bl', s).textContent = b; });
    if (food) $('#del', s).onclick = function () { store.deleteFood(food.id); delete ui.known[food.id]; closeSheet(); renderAll(); toast('Food deleted'); };
    $('#f', s).onsubmit = function (ev) {
      ev.preventDefault();
      var name = $('#cu-name', s).value.trim(); if (!name) { $('#cu-name', s).focus(); return; }
      var per = { kcal: N.num($('#cu-kcal', s).value), p: N.num($('#cu-p', s).value), c: N.num($('#cu-c', s).value), f: N.num($('#cu-f', s).value) };
      if (!per.kcal) per.kcal = N.round(N.kcalFromMacros(per.p, per.c, per.f), 0);
      var units = [0, 1].map(function (i) {
        var l = $('#cu-l' + i, s).value.trim(), g = N.num($('#cu-g' + i, s).value);
        return l && g > 0 ? { label: /^\d/.test(l) ? l : '1 ' + l, g: g } : null;
      }).filter(Boolean);
      var saved = store.saveFood({ id: food && food.id, src: 'custom', name: name, brand: $('#cu-brand', s).value.trim(), base: base, per100: per, units: units });
      know(saved); openPortion(saved);
    };
    if (!food || FINE) $(f.name ? '#cu-kcal' : '#cu-name', s).focus();
  }

  /* ---------- barcode ---------- */
  function lookupBarcode(code) {
    code = String(code).replace(/\D/g, '');
    if (code.length < 8) { toast('Enter the 8–14 digit barcode'); return; }
    var saved = store.getFood('off:' + code);
    if (saved) return openPortion(saved);
    toast('Looking up ' + code + '…');
    api.barcodeOFF(code).then(function (food) {
      if (food) openPortion(food);
      else { closeSheet(); toast('Barcode not in Open Food Facts. Create it as a custom food.'); }
    }).catch(function (e) { toast(errText('Open Food Facts', e)); });
  }
  function openScan() {
    var canScan = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !SINGLE;
    var stream = null, stop = false;
    var s = openSheet(head('Barcode', canScan ? 'Point the camera at the barcode, or type it' : 'Type the number under the barcode') +
      (canScan ? '<video class="scan" id="video" playsinline muted></video>' : '') +
      '<form class="form" id="f"><label>Barcode number</label><input type="text" inputmode="numeric" id="code" autocomplete="off">' +
      '<div class="btn-row"><button class="btn primary big">Look up</button></div></form>',
      function () { stop = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); });
    $('#f', s).onsubmit = function (ev) { ev.preventDefault(); lookupBarcode($('#code', s).value); };
    if (!canScan) { $('#code', s).focus(); return; }
    var video = $('#video', s), det;
    try { det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); } catch (e) { video.hidden = true; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (st) {
      if (stop) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = st; video.srcObject = st; video.play();
      (function tick() {
        if (stop) return;
        det.detect(video).then(function (codes) {
          if (stop) return;
          if (codes && codes.length) { stop = true; lookupBarcode(codes[0].rawValue); } else setTimeout(tick, 250);
        }).catch(function () { setTimeout(tick, 500); });
      })();
    }).catch(function () { video.hidden = true; $('#code', s).focus(); });
  }

  /* ---------- settings ---------- */
  function openSettings() {
    var st = settings(), t = st.targets;
    var s = openSheet(head('Settings') +
      '<form class="form" id="f"><div class="label">Daily targets</div><div class="grid4">' +
      '<div><label>kcal</label><input type="text" inputmode="decimal" id="t-kcal" value="' + kc(t.kcal) + '"></div><div><label>Protein g</label><input type="text" inputmode="decimal" id="t-p" value="' + kc(t.p) + '"></div>' +
      '<div><label>Carbs g</label><input type="text" inputmode="decimal" id="t-c" value="' + kc(t.c) + '"></div><div><label>Fat g</label><input type="text" inputmode="decimal" id="t-f" value="' + kc(t.f) + '"></div></div>' +
      (ARTIFACT ? '<div class="label">Food databases</div><div class="hint">Inside Claude the page cannot reach Open Food Facts or USDA, so search covers the built-in list, your custom foods and recents. The web version adds the online databases and barcodes.</div>'
        : '<div class="label">Food databases</div>' +
      '<label class="check"><input type="checkbox" id="s-off"' + (st.useOFF ? ' checked' : '') + '> Open Food Facts (packaged products, barcodes)</label>' +
      '<label class="check"><input type="checkbox" id="s-usda"' + (st.useUSDA ? ' checked' : '') + '> USDA FoodData Central (generic foods, portions)</label>' +
      '<label>USDA API key</label><input type="text" id="s-key" autocomplete="off" value="' + esc(st.usdaKey) + '"><div class="hint">DEMO_KEY is limited to about 30 searches per hour. A free key from api.data.gov raises that to 1000.</div>') +
      '<div class="label">Units</div><label class="check"><input type="checkbox" id="s-imp"' + (st.imperial ? ' checked' : '') + '> Also offer oz / fl oz in portion picker (grams and ml stay the default)</label>' +
      (ARTIFACT ? '<div class="label">Storage</div><div class="hint" id="cloud-hint">' + esc(cloudLine()) + '</div>' +
        (caps.mcp ? '<div class="btn-row"><button type="button" class="btn" id="drive-backup">Back up to Google Drive</button></div><div class="hint" id="drive-hint">Creates a new backup file in your Drive through your Google Drive connector. To restore, download that file and use Import.</div>' : '')
        : '<div class="label">Google Drive sync</div><label>OAuth client ID</label><input type="text" id="s-drive" autocomplete="off" placeholder="xxxx.apps.googleusercontent.com" value="' + esc(st.driveClientId) + '">' +
      '<div class="hint" id="drive-hint">' + (st.driveClientId ? 'Data syncs to a private app folder in your Drive.' : 'Leave empty to keep everything on this device.') + '</div>' +
      '<div class="btn-row"><button type="button" class="btn" id="sync-now">Sync now</button></div>') +
      '<div class="label">Backup</div><div class="btn-row">' + (ARTIFACT && !caps.downloads ? '' : '<button type="button" class="btn" id="exp">Export file</button>') + '<button type="button" class="btn" id="copy">Copy JSON</button><button type="button" class="btn" id="imp">Import</button></div>' +
      '<div id="imp-box" hidden><label>Choose an export file or paste its JSON</label><input type="file" id="imp-file" accept="application/json,.json"><textarea id="imp-text" spellcheck="false" style="margin-top:8px"></textarea>' +
      '<div class="btn-row"><button type="button" class="btn" id="imp-merge">Merge into my data</button><button type="button" class="btn danger" id="imp-replace">Replace my data</button></div></div>' +
      '<div class="btn-row"><button type="button" class="btn danger" id="wipe">Erase all data</button></div>' +
      '<div class="btn-row"><button class="btn primary big">Save settings</button></div>' +
      '<div class="hint" style="text-align:center;margin-top:10px">Food Tracker rev 2 · ' + (ARTIFACT ? 'Claude artifact' : store.persistent ? 'stored on this device' : 'storage unavailable, session only') + '</div></form>');
    function collect() {
      var out = {
        targets: { kcal: N.num($('#t-kcal', s).value), p: N.num($('#t-p', s).value), c: N.num($('#t-c', s).value), f: N.num($('#t-f', s).value) },
        imperial: $('#s-imp', s).checked
      };
      if (!ARTIFACT) {
        out.useOFF = $('#s-off', s).checked; out.useUSDA = $('#s-usda', s).checked;
        out.usdaKey = $('#s-key', s).value.trim() || 'DEMO_KEY'; out.driveClientId = $('#s-drive', s).value.trim();
      }
      return out;
    }
    $('#f', s).onsubmit = function (ev) { ev.preventDefault(); store.setSettings(collect()); ui.cache = {}; closeSheet(); renderAll(); toast('Settings saved'); };
    if ($('#sync-now', s)) $('#sync-now', s).onclick = function () {
      store.setSettings(collect());
      if (!settings().driveClientId) { $('#drive-hint', s).textContent = 'Enter a Google OAuth client ID first (see README).'; return; }
      doSync(true, function (msg) { if ($('#drive-hint', s)) $('#drive-hint', s).textContent = msg; });
    };
    if ($('#drive-backup', s)) $('#drive-backup', s).onclick = function () {
      var btn = this, hint = $('#drive-hint', s), text = store.exportJSON(), name = 'food-tracker-backup-' + N.dateKey() + '.json';
      if (text.length > 900000) { hint.textContent = 'The backup is too large to send through the connector. Use Export file instead.'; return; }
      btn.disabled = true; hint.textContent = 'Sending to Google Drive\u2026';
      // One call per click and never retried automatically: a create that failed ambiguously may still have happened.
      caps.mcp.callTool('Google Drive', 'create_file', { title: name, textContent: text, contentMimeType: 'application/json', disableConversionToGoogleType: true })
        .then(function () { return 'Saved to your Google Drive as ' + name + '.'; }, driveErr)
        .then(function (msg) { btn.disabled = false; if ($('#drive-hint', s) === hint) hint.textContent = msg; toast(msg); });
    };
    if ($('#exp', s)) $('#exp', s).onclick = function () {
      var name = 'food-tracker-' + N.dateKey() + '.json', text = store.exportJSON();
      if (caps.downloads) {
        caps.downloads.save({ filename: name, data: text }).then(function () { toast('Backup file saved'); }, function (e) {
          if (e && e.code === 'declined') return;
          toast(e && e.code === 'rate_limited' ? 'A save prompt is already open. Try again in a moment.' : 'Saving a file is not available here. Use Copy JSON.');
        });
        return;
      }
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      } catch (e) { toast('Download blocked here. Use Copy JSON.'); }
    };
    $('#copy', s).onclick = function () {
      var text = store.exportJSON();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Backup copied to clipboard'); })
        .catch(function () { $('#imp-box', s).hidden = false; $('#imp-text', s).value = text; $('#imp-text', s).select(); toast('Copy the selected text'); });
    };
    $('#imp', s).onclick = function () { $('#imp-box', s).hidden = !$('#imp-box', s).hidden; };
    $('#imp-file', s).onchange = function () {
      var file = this.files[0]; if (!file) return;
      var r = new FileReader(); r.onload = function () { $('#imp-text', s).value = r.result; }; r.readAsText(file);
    };
    function doImport(mode) {
      try { store.importJSON($('#imp-text', s).value, mode); closeSheet(); renderAll(); toast('Import done'); }
      catch (e) { toast('Could not import: ' + e.message); }
    }
    $('#imp-merge', s).onclick = function () { doImport('merge'); };
    $('#imp-replace', s).onclick = function () { doImport('replace'); };
    var armed = false;
    $('#wipe', s).onclick = function () {
      if (!armed) { armed = true; this.textContent = ARTIFACT ? 'Tap again to erase everything' : 'Tap again to erase everything on this device'; return; }
      store.eraseAll(); closeSheet(); renderAll(); toast('All data erased');
    };
  }

  /* ---------- Claude-artifact storage (db capability) ---------- */
  function cloudLine() {
    if (!cloud) return cloudMsg || 'Connecting to your Claude account\u2026';
    if (cloud.status === 'error') return cloudMsg;
    return cloud.status === 'synced' ? 'Saved to your Claude account, private to you. Open this page on any device signed in to the same account to see the same log.' : 'Saving to your Claude account\u2026';
  }
  function cloudErr(e) {
    var c = e && e.code;
    if (c === 'quota_exceeded') return 'Storage for this page is full. Export a backup in Settings, then erase old data.';
    if (c === 'too_large') return 'One month holds too much data to save. Export a backup in Settings.';
    if (c === 'timeout' || c === 'unavailable') return 'Your saved data cannot be reached right now. Entries are kept in this browser and saved when the connection returns.';
    if (c === 'invalid_argument') return 'This view cannot write to your Claude account (view-only access). Entries stay in this browser only.';
    return 'Saving to your Claude account is not available in this view. Entries stay in this browser only; Settings has Copy JSON for a backup.';
  }
  function driveErr(e) {
    var c = e && e.code;
    if (c === 'needs_reauth') return 'Reconnect Google Drive in claude.ai Settings \u2192 Connectors, then try again.';
    if (c === 'server_not_connected' || c === 'selection_required' || c === 'server_not_found') return 'Add Google Drive in claude.ai Settings \u2192 Connectors, then try again.';
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required' || c === 'blocked_by_policy') return 'Google Drive was not allowed for this page, so nothing was saved.';
    if (c === 'tool_error') return 'Google Drive refused the backup. Nothing was saved.';
    if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'The Google Drive connector is not available in this view.';
    return 'Google Drive did not confirm the backup. Check your Drive before trying again; the file may exist.';
  }
  function renderNotice() {
    var msg = ARTIFACT ? cloudMsg : store.persistent ? '' : 'Browser storage is unavailable here, so entries last for this session only. Use Settings \u2192 Copy JSON to keep a backup.';
    $('#notice').innerHTML = msg ? '<div class="notice">' + esc(msg) + '</div>' : '';
    var h = $('#cloud-hint'); if (h) h.textContent = cloudLine();
  }
  function cloudSync() { if (cloud) cloud.sync().then(function () { if ($('#sheet').hidden) renderAll(); else { renderHeader(); } }); }
  function startCloud() {
    function use(n) { try { return Promise.resolve(window.claude.use(n)).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); } }
    function none() { cloudMsg = cloudErr(null); renderNotice(); }
    $('[data-act=scan]').hidden = true;                      // no camera and no barcode database inside the sandbox
    use('downloads').then(function (d) { caps.downloads = d; });
    use('mcp').then(function (m) { caps.mcp = m; });
    Promise.all([use('db'), use('user')]).then(function (r) {
      if (!r[0] || !r[1]) return none();
      return Promise.resolve(r[1].id()).then(function (uid) {
        if (!uid) return none();
        cloud = FT.cloud.createCloud({ db: r[0], uid: uid, store: store, onStatus: function (st, e) { cloudMsg = st === 'error' ? cloudErr(e) : ''; renderNotice(); } });
        cloudSync();
      });
    }).catch(none);
  }

  /* ---------- Drive sync ---------- */
  function doSync(interactive, report) {
    if (ui.syncing || !settings().driveClientId) return;
    if (!interactive && !FT.drive.hasToken()) return;
    ui.syncing = true; $('#sync-btn').classList.add('spin');
    FT.drive.sync(store).then(function () {
      var msg = 'Synced with Google Drive at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (interactive) toast(msg); if (report) report(msg);
    }).catch(function (e) {
      var msg = 'Sync failed: ' + (e && e.message || 'unknown error');
      if (interactive) toast(msg); if (report) report(msg);
    }).then(function () { ui.syncing = false; $('#sync-btn').classList.remove('spin'); renderAll(); });
  }

  /* ================= wiring ================= */
  function renderAll() { renderHeader(); renderHome(); renderResults(); }

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id'), food;
    switch (act) {
      case 'prev': ui.date = N.shiftDate(ui.date, -1); renderAll(); break;
      case 'next': ui.date = N.shiftDate(ui.date, 1); renderAll(); break;
      case 'today': ui.date = N.dateKey(); renderAll(); break;
      case 'settings': openSettings(); break;
      case 'sync': doSync(true); break;
      case 'scan': openScan(); break;
      case 'cancel': endSearch(false); break;
      case 'close': closeSheet(); break;
      case 'quick': openQuick(); break;
      case 'custom': openCustom(); break;
      case 'barcode-q': lookupBarcode(ui.query); break;
      case 'meal-add': ui.meal = el.getAttribute('data-meal'); renderHeader(); q.focus(); break;
      case 'entry': openEntry(id); break;
      case 'fast': ev.stopPropagation(); food = foodById(id); if (food) { var d = defaultFor(food); logFood(food, d.qty, d.unit); } break;
      case 'food': food = foodById(id); if (food) openPortion(food); break;
    }
  });
  $('#backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!$('#sheet').hidden) closeSheet(); else if (ui.query || ui.meal) endSearch(true);
  });
  q.addEventListener('input', function () { setQuery(q.value); });
  q.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (!ARTIFACT && /^\d{8,14}$/.test(ui.query)) return lookupBarcode(ui.query);
    var first = $('#results .row'); if (first) first.click();   // Enter opens the top hit
  });

  // Auto-sync shortly after a change, but only once the user has signed in during this session.
  store.onChange(function () {
    if (ui.syncing) return;
    clearTimeout(ui.syncTimer); ui.syncTimer = setTimeout(function () { doSync(false); }, 4000);
  });
  // Roll the date over if the app is left open past midnight while showing "today".
  var lastToday = N.dateKey();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (cloud) cloud.flush(); return; }
    var now = N.dateKey();
    if (now !== lastToday) { if (ui.date === lastToday) ui.date = now; lastToday = now; renderAll(); }
    doSync(false); cloudSync();
  });

  renderNotice();
  if (ARTIFACT) startCloud();
  else window.addEventListener('load', function () {       // safety net in case the host adds window.claude after this script ran
    if (!(window.claude && typeof window.claude.use === 'function')) return;
    ARTIFACT = true; startCloud(); renderAll();
  });
  renderAll();

  if (!SINGLE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
  FT.app = { store: store, ui: ui, renderAll: renderAll, openPortion: openPortion, cloud: function () { return cloud; } };
})();
