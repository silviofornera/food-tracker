/* Food Tracker - Google Drive sync (appDataFolder, one JSON file).
   Auth: Google Identity Services token flow, loaded only when a client ID is configured. */
(function (root) {
  'use strict';
  var FT = root.FT = root.FT || {};
  var FILE = 'food-tracker.json';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var API = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var token = null, tokenExp = 0, gisPromise = null;

  function loadGIS() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (!gisPromise) gisPromise = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { gisPromise = null; fail(new Error('Could not load Google sign-in')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  /* Must be called from a user gesture the first time (opens the Google popup). */
  function getToken(clientId) {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    return loadGIS().then(function () {
      return new Promise(function (ok, fail) {
        var client = root.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: SCOPE,
          callback: function (r) {
            if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; ok(token); }
            else fail(new Error((r && r.error) || 'Sign-in failed'));
          },
          error_callback: function (e) { fail(new Error((e && (e.message || e.type)) || 'Sign-in cancelled')); }
        });
        client.requestAccessToken({ prompt: '' });
      });
    });
  }
  function hasToken() { return !!token && Date.now() < tokenExp - 60000; }
  function signOut() { token = null; tokenExp = 0; }

  function call(f, url, tok, init) {
    init = init || {};
    init.headers = Object.assign({ Authorization: 'Bearer ' + tok }, init.headers || {});
    return f(url, init).then(function (r) {
      if (!r.ok) { var e = new Error('Drive HTTP ' + r.status); e.status = r.status; throw e; }
      return r;
    });
  }

  /* Download remote file (if any), merge with local, upload the result.
     o: {token, fetch, getLocal():state, applyMerged(remoteState):mergedState} */
  function syncOnce(o) {
    var f = o.fetch || root.fetch.bind(root), tok = o.token;
    var q = encodeURIComponent("name='" + FILE + "' and trashed=false");
    return call(f, API + '?spaces=appDataFolder&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&q=' + q, tok)
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var file = (list.files || [])[0];
        if (!file) return { id: null, remote: null };
        return call(f, API + '/' + file.id + '?alt=media', tok).then(function (r) { return r.json(); })
          .then(function (remote) { return { id: file.id, remote: remote }; });
      })
      .then(function (x) {
        var merged = x.remote ? o.applyMerged(x.remote) : o.getLocal();
        var body = JSON.stringify(merged);
        if (x.id) {
          return call(f, UPLOAD + '/' + x.id + '?uploadType=media', tok, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body })
            .then(function () { return { created: false, pulled: true }; });
        }
        var boundary = 'ftb' + Date.now();
        var multi = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify({ name: FILE, parents: ['appDataFolder'] }) + '\r\n--' + boundary +
          '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + boundary + '--';
        return call(f, UPLOAD + '?uploadType=multipart', tok, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multi })
          .then(function () { return { created: true, pulled: false }; });
      });
  }

  function sync(store) {
    var id = store.state.settings.driveClientId;
    if (!id) return Promise.reject(new Error('No Google client ID set'));
    return getToken(id).then(function (tok) {
      return syncOnce({ token: tok, getLocal: function () { return store.state; }, applyMerged: function (r) { return store.mergeRemote(r); } });
    }).catch(function (e) { if (e.status === 401) signOut(); throw e; });
  }

  FT.drive = { sync: sync, syncOnce: syncOnce, hasToken: hasToken, signOut: signOut, FILE: FILE };
  if (typeof module !== 'undefined' && module.exports) module.exports = FT.drive;
})(typeof window !== 'undefined' ? window : globalThis);
