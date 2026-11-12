/* Food Tracker - local-first state, persistence, merge (sync) and local search. No DOM. */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};
  var N = FT.nutrition || (typeof require !== 'undefined' ? require('./nutrition.js') : null);
  var KEY = 'foodtracker.v1';
  var TOMBSTONE_DAYS = 90;

  function defaults() {
    return {
      version: 1,
      settings: {
        targets: { kcal: 2000, p: 120, c: 220, f: 70 },
        // targets.c is the NET carb target (rev 3). Earlier revisions stored a total-carb target under the same key;
        // the number carries over unchanged.
        usdaKey: 'DEMO_KEY', useOFF: false, useUSDA: true,
        driveClientId: '', imperial: false, sv: 3, u: 0
      },
      foods: {},      // id -> food (custom foods + remote foods that were logged/favorited)
      entries: {},    // id -> entry (deleted ones stay as tombstones {del:true})
      usage: {},      // foodId -> {n, t, qty, unit}   (recents + last-used portion)
      favorites: {}   // foodId -> {on, u}
    };
  }

  function memoryStorage() {
    var m = {};
    return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, memory: true };
  }
  /* localStorage when usable (it throws inside some sandboxed iframes), else memory. */
  function pickStorage() {
    try {
      var ls = root.localStorage; ls.setItem('__ft', '1'); ls.removeItem('__ft'); return ls;
    } catch (e) { return memoryStorage(); }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    var d = defaults();
    var out = { version: 1 };
    out.settings = Object.assign({}, d.settings, s.settings || {});
    out.settings.targets = Object.assign({}, d.settings.targets, (s.settings && s.settings.targets) || {});
    // Settings written before rev 3 (no sv): USDA becomes the primary database and Open Food Facts search an opt-in.
    // One-time: once sv is 3 the user's own choice for useOFF is kept. Idempotent, so it is safe on every load and merge.
    if (s.settings && !((s.settings.sv || 0) >= 3)) { out.settings.useOFF = false; out.settings.sv = 3; }
    ['foods', 'entries', 'usage', 'favorites'].forEach(function (k) {
      out[k] = s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) ? s[k] : {};
    });
    return out;
  }

  /* Per-record last-write-wins merge of two states. Pure. */
  function merge(a, b) {
    a = normalize(a); b = normalize(b);
    var out = { version: 1 };
    out.settings = (b.settings.u || 0) > (a.settings.u || 0) ? b.settings : a.settings;
    function lww(x, y, stamp) {
      var r = {}, k;
      for (k in x) r[k] = x[k];
      for (k in y) if (!(k in r) || (y[k][stamp] || 0) > (r[k][stamp] || 0)) r[k] = y[k];
      return r;
    }
    out.entries = lww(a.entries, b.entries, 'u');
    out.foods = lww(a.foods, b.foods, 'u');
    out.favorites = lww(a.favorites, b.favorites, 'u');
    out.usage = lww(a.usage, b.usage, 't');
    for (var k in out.usage) {
      var n = Math.max((a.usage[k] && a.usage[k].n) || 0, (b.usage[k] && b.usage[k].n) || 0);
      if (!out.usage[k].gone && n !== out.usage[k].n) out.usage[k] = Object.assign({}, out.usage[k], { n: n });
    }
    return out;
  }

  function prune(state, now) {
    var cut = (now || Date.now()) - TOMBSTONE_DAYS * 864e5;
    for (var id in state.entries) { var e = state.entries[id]; if (e.del && (e.u || 0) < cut) delete state.entries[id]; }
    return state;
  }

  /* Rank a food name against a query. 0 = no match. */
  function score(food, tokens) {
    var name = (food.name + ' ' + (food.brand || '')).toLowerCase(), s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i], idx = name.indexOf(t);
      if (idx < 0) return 0;
      s += idx === 0 ? 30 : (/[\s,(\/-]/.test(name.charAt(idx - 1)) ? 20 : 8);
    }
    return s + Math.max(0, 10 - name.length / 8);
  }

  function createStore(storage, now) {
    storage = storage || pickStorage();
    now = now || function () { return Date.now(); };
    var listeners = [];
    var starter = {};
    (FT.starterFoods || []).forEach(function (f) { starter[f.id] = f; });

    var st = {
      state: defaults(), storage: storage, persistent: !storage.memory,
      load: function () {
        try { st.state = prune(normalize(JSON.parse(storage.getItem(KEY) || 'null')), now()); }
        catch (e) { st.state = defaults(); }
        return st;
      },
      save: function (silent) {
        try { storage.setItem(KEY, JSON.stringify(st.state)); } catch (e) { st.lastError = e; }
        if (!silent) listeners.forEach(function (fn) { fn(); });
      },
      onChange: function (fn) { listeners.push(fn); },

      /* ---- foods ---- */
      getFood: function (id) { var f = st.state.foods[id]; return f ? (f.del ? null : f) : (starter[id] || null); },
      saveFood: function (food) {
        var f = Object.assign({}, food, { u: now() });
        if (!f.id) f.id = 'c:' + uid();
        st.state.foods[f.id] = f; st.save(); return f;
      },
      /* Persist a remote/starter food the first time it is used, so entries and recents resolve offline. */
      keepFood: function (food) {
        if (food.src === 'starter' || st.state.foods[food.id]) return food;
        st.state.foods[food.id] = Object.assign({}, food, { u: now() });
        return food;
      },
      isFavorite: function (id) { var f = st.state.favorites[id]; return !!(f && f.on); },
      toggleFavorite: function (food) {
        var on = !st.isFavorite(food.id);
        if (on) st.keepFood(food);
        st.state.favorites[food.id] = { on: on, u: now() }; st.save(); return on;
      },
      favorites: function () {
        return Object.keys(st.state.favorites).filter(st.isFavorite).map(st.getFood).filter(Boolean)
          .sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      recents: function (limit) {
        var u = st.state.usage;
        return Object.keys(u).filter(function (k) { return !u[k].gone; }).sort(function (a, b) { return u[b].t - u[a].t; }).map(st.getFood).filter(Boolean).slice(0, limit || 20);
      },
      lastPortion: function (id) { var u = st.state.usage[id]; return u && !u.gone ? u : null; },
      customFoods: function () {
        return Object.keys(st.state.foods).map(function (k) { return st.state.foods[k]; }).filter(function (f) { return f.src === 'custom' && !f.del; });
      },
      deleteFood: function (id) {
        var f = st.state.foods[id]; if (!f) return;
        st.state.foods[id] = Object.assign({}, f, { del: true, u: now() });
        if (st.state.usage[id]) st.state.usage[id] = { n: 0, t: now(), gone: true }; st.state.favorites[id] = { on: false, u: now() }; st.save();
      },

      /* ---- search over starter + saved foods; instant ---- */
      searchLocal: function (query, limit) {
        var tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!tokens.length) return [];
        var seen = {}, out = [];
        function consider(f) {
          if (!f || f.del || seen[f.id]) return; seen[f.id] = 1;
          var s = score(f, tokens); if (!s) return;
          var use = st.lastPortion(f.id);
          if (use) s += 15 + Math.min(use.n || 0, 20);
          if (st.isFavorite(f.id)) s += 12;
          if (f.src === 'custom') s += 5;
          out.push({ food: f, s: s });
        }
        Object.keys(st.state.foods).forEach(function (k) { consider(st.state.foods[k]); });
        Object.keys(starter).forEach(function (k) { consider(starter[k]); });
        out.sort(function (a, b) { return b.s - a.s || a.food.name.localeCompare(b.food.name); });
        return out.slice(0, limit || 25).map(function (x) { return x.food; });
      },

      /* ---- entries ---- */
      /* p: {food, qty, unit:{label,g}, date, meal} */
      addEntry: function (p) {
        var amount = N.portionAmount(p.qty, p.unit), n = N.nutrientsFor(p.food.per100, amount), t = now();
        st.keepFood(p.food);
        var e = {
          id: uid(), date: p.date, meal: p.meal, foodId: p.food.id, name: p.food.name, brand: p.food.brand || '',
          qty: N.num(p.qty), unit: p.unit.label, unitG: p.unit.g, amount: N.round(amount, 1), base: p.food.base || 'g',
          kcal: N.round(n.kcal, 1), p: N.round(n.p, 1), c: N.round(n.c, 1), f: N.round(n.f, 1), fi: N.round(n.fi, 1), t: t, u: t
        };
        st.state.entries[e.id] = e;
        var use = st.lastPortion(p.food.id) || { n: 0 };
        st.state.usage[p.food.id] = { n: (use.n || 0) + 1, t: t, qty: e.qty, unit: e.unit };
        st.save(); return e;
      },
      quickAdd: function (p) {
        var t = now();
        var e = {
          id: uid(), date: p.date, meal: p.meal, foodId: null, name: p.name || 'Quick add', brand: '',
          qty: 1, unit: '', unitG: 0, amount: 0, base: 'g',
          kcal: N.num(p.kcal), p: N.num(p.p), c: N.num(p.c), f: N.num(p.f), t: t, u: t
        };
        st.state.entries[e.id] = e; st.save(); return e;
      },
      /* Change portion/meal of an entry; nutrients are rescaled from the food when known, else from the entry itself. */
      updateEntry: function (id, ch) {
        var e = st.state.entries[id]; if (!e || e.del) return null;
        var n = Object.assign({}, e);
        if (ch.meal) n.meal = ch.meal;
        if (ch.date) n.date = ch.date;
        if (ch.qty != null && ch.unit) {
          var amount = N.portionAmount(ch.qty, ch.unit), food = e.foodId && st.getFood(e.foodId), per100 = food && food.per100;
          if (!per100 && e.amount > 0) per100 = { kcal: e.kcal / e.amount * 100, p: e.p / e.amount * 100, c: e.c / e.amount * 100, f: e.f / e.amount * 100, fi: (e.fi || 0) / e.amount * 100 };
          if (per100) {
            var v = N.nutrientsFor(per100, amount);
            n.qty = N.num(ch.qty); n.unit = ch.unit.label; n.unitG = ch.unit.g; n.amount = N.round(amount, 1);
            n.kcal = N.round(v.kcal, 1); n.p = N.round(v.p, 1); n.c = N.round(v.c, 1); n.f = N.round(v.f, 1); n.fi = N.round(v.fi, 1);
            if (e.foodId && st.lastPortion(e.foodId)) { st.state.usage[e.foodId].qty = n.qty; st.state.usage[e.foodId].unit = n.unit; st.state.usage[e.foodId].t = now(); }
          }
        }
        ['kcal', 'p', 'c', 'f', 'name'].forEach(function (k) { if (ch[k] != null && !ch.unit) n[k] = k === 'name' ? ch[k] : N.num(ch[k]); });
        n.u = now(); st.state.entries[id] = n; st.save(); return n;
      },
      deleteEntry: function (id) {
        var e = st.state.entries[id]; if (!e) return;
        st.state.entries[id] = { id: id, date: e.date, del: true, u: now() }; st.save();
      },
      restoreEntry: function (e) { st.state.entries[e.id] = Object.assign({}, e, { u: now() }); st.save(); },
      entriesFor: function (date) {
        var out = [], all = st.state.entries;
        for (var id in all) { var e = all[id]; if (e.date === date && !e.del) out.push(e); }
        return out.sort(function (a, b) { return a.t - b.t; });
      },
      totalsFor: function (date) { return N.sum(st.entriesFor(date)); },

      /* ---- settings ---- */
      setSettings: function (patch) {
        var s = st.state.settings;
        if (patch.targets) patch = Object.assign({}, patch, { targets: Object.assign({}, s.targets, patch.targets) });
        st.state.settings = Object.assign({}, s, patch, { u: now() }); st.save();
      },

      /* ---- import / export / sync ---- */
      exportJSON: function () { return JSON.stringify(Object.assign({ app: 'food-tracker', exportedAt: new Date(now()).toISOString() }, st.state), null, 1); },
      /* mode 'merge' (default) keeps newer records from both sides; 'replace' overwrites. */
      importJSON: function (text, mode) {
        var data = JSON.parse(text);
        if (!data || typeof data !== 'object' || !data.entries) throw new Error('Not a Food Tracker export');
        st.state = prune(mode === 'replace' ? normalize(data) : merge(st.state, data), now());
        st.save();
      },
      mergeRemote: function (remote) { st.state = prune(merge(st.state, remote), now()); st.save(); return st.state; },
      clearAll: function () { st.state = defaults(); st.save(); },
      /* Erase in a way that also wins a later merge with Drive / the artifact store:
         entries and foods become tombstones instead of vanishing locally and coming back on the next pull. */
      eraseAll: function () {
        var t = now(), s = st.state, id;
        for (id in s.entries) s.entries[id] = { id: id, date: s.entries[id].date, del: true, u: t };
        for (id in s.foods) s.foods[id] = Object.assign({}, s.foods[id], { del: true, u: t });
        for (id in s.favorites) s.favorites[id] = { on: false, u: t };
        for (id in s.usage) s.usage[id] = { n: 0, t: t, gone: true };
        s.settings = Object.assign(defaults().settings, { driveClientId: s.settings.driveClientId, usdaKey: s.settings.usdaKey, u: t });
        st.save();
      }
    };
    return st.load();
  }

  FT.store = { createStore: createStore, merge: merge, normalize: normalize, defaults: defaults, memoryStorage: memoryStorage, prune: prune, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.store;
})(typeof window !== 'undefined' ? window : globalThis);
