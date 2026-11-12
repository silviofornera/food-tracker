/* Food Tracker - storage adapter for the Claude-artifact build.
   When the page runs as a Claude artifact with the `db` capability, the state is mirrored into the
   viewer's private subtree (data/users/<id>/...) so it survives reloads and follows the account
   across devices. Everywhere else (Apache, file://) this module is inert and localStorage is used.

   The store stays synchronous and local (instant UI); this adapter pulls + merges on start and on
   return to the tab, and pushes only the documents that changed, debounced, one write at a time.

   Documents (each well under the 256 KiB per-document limit):
     meta          settings (minus API key), usage, favorites
     foods-0..7    saved/custom foods, bucketed by a stable hash of the food id
     e-YYYY-MM     that month's entries (incl. delete tombstones)                                  */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};
  var S = FT.store || (typeof require !== 'undefined' ? require('./store.js') : null);
  var BUCKETS = 8, MAX_CHARS = 200000;

  function bucket(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % BUCKETS; }
  /* Key-order independent JSON, used only to decide whether a document changed. */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }

  /* state -> {docId: body}. Pure. */
  function split(state) {
    var settings = Object.assign({}, state.settings); delete settings.usdaKey;       // no keys in the shared store
    var docs = { meta: { v: 1, settings: settings, usage: state.usage || {}, favorites: state.favorites || {} } }, id, key;
    for (id in state.foods) { key = 'foods-' + bucket(id); (docs[key] = docs[key] || { foods: {} }).foods[id] = state.foods[id]; }
    for (id in state.entries) {
      var m = String(state.entries[id].date || '').slice(0, 7);
      key = /^\d{4}-\d{2}$/.test(m) ? 'e-' + m : 'e-misc';
      (docs[key] = docs[key] || { entries: {} }).entries[id] = state.entries[id];
    }
    return docs;
  }
  /* {docId: body} -> state-shaped object for store.mergeRemote. Pure; tolerates junk. */
  function join(docs) {
    var out = { foods: {}, entries: {}, usage: {}, favorites: {} }, id, d;
    function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
    for (id in docs) {
      d = obj(docs[id]);
      if (id === 'meta') { if (d.settings && typeof d.settings === 'object') out.settings = d.settings; out.usage = obj(d.usage); out.favorites = obj(d.favorites); }
      else if (/^foods-/.test(id)) Object.assign(out.foods, obj(d.foods));
      else if (/^e-/.test(id)) Object.assign(out.entries, obj(d.entries));
    }
    return out;
  }

  /* o: {db, uid, store, onStatus(status, error), delay, timeoutMs, setTimeout, clearTimeout}
     status: 'connecting' | 'saving' | 'synced' | 'error' */
  function createCloud(o) {
    var col = o.db.collection('data/users/' + o.uid);
    var sT = o.setTimeout || function (f, ms) { return setTimeout(f, ms); }, cT = o.clearTimeout || function (t) { clearTimeout(t); };
    var last = {}, timer = null, busy = null, dirty = false, applying = false, pulled = false;
    var api = { status: 'connecting', error: null };

    function set(s, e) { api.status = s; api.error = e || null; if (o.onStatus) o.onStatus(s, e || null); }
    function limit(p, ms) {
      return new Promise(function (ok, fail) {
        var t = sT(function () { fail({ code: 'timeout', message: 'no answer from the store' }); }, ms);
        p.then(function (v) { cT(t); ok(v); }, function (e) { cT(t); fail(e); });
      });
    }
    function write(id, body) {
      return col.doc(id).set(body).catch(function (e) {
        if (!e || e.code !== 'unavailable') throw e;                     // transient: retry once after a short random delay
        return new Promise(function (ok) { sT(ok, 400 + Math.random() * 800); }).then(function () { return col.doc(id).set(body); });
      });
    }
    function pull() {
      return limit(col.get(), o.timeoutMs || 10000).then(function (snap) {
        var docs = {};
        (snap.docs || []).forEach(function (d) {
          var b = d.exists === false ? null : d.data();
          if (b) { docs[d.id] = b; last[d.id] = stable(b); }
        });
        applying = true;
        try { o.store.mergeRemote(join(docs)); } finally { applying = false; }
        pulled = true;
      });
    }
    function push() {
      if (busy) { dirty = true; return busy; }
      var docs = split(o.store.state);
      var ids = Object.keys(docs).filter(function (id) { return stable(docs[id]) !== last[id]; });
      if (!ids.length) { set('synced'); return Promise.resolve(); }
      set('saving');
      busy = ids.reduce(function (p, id) {
        return p.then(function () {
          var js = stable(docs[id]);
          if (js.length > MAX_CHARS) throw { code: 'too_large', message: id };
          return write(id, JSON.parse(JSON.stringify(docs[id]))).then(function () { last[id] = js; });
        });
      }, Promise.resolve()).then(function () {
        busy = null;
        if (dirty) { dirty = false; return push(); }
        set('synced');
      }, function (e) { busy = null; dirty = false; set('error', e || { code: 'unavailable' }); });
      return busy;
    }
    /* Pull remote, merge, then push whatever local has that remote lacks. Never pushes before a successful pull,
       so a device that could not read can not overwrite newer remote documents with stale ones. */
    api.sync = function () {
      if (api.syncing) return api.syncing;
      api.syncing = pull().then(push, function (e) { set('error', e || { code: 'unavailable' }); })
        .then(function () { api.syncing = null; }, function () { api.syncing = null; });
      return api.syncing;
    };
    api.flush = function () { if (timer) { cT(timer); timer = null; } return pulled ? push() : api.sync(); };
    api.schedule = function () {
      if (applying) return;
      if (timer) cT(timer);
      timer = sT(function () { timer = null; api.flush(); }, o.delay == null ? 1500 : o.delay);
    };
    o.store.onChange(api.schedule);
    return api;
  }

  FT.cloud = { createCloud: createCloud, split: split, join: join, stable: stable, bucket: bucket };
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.cloud;
})(typeof window !== 'undefined' ? window : globalThis);
