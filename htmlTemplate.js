'use strict';

// ─── Unicode-safe base64 helpers ─────────────────────────────────────────────
function encodePayload(obj) {
  const jsonStr = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(jsonStr);
  const binStr = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binStr);
}

const _decode = `function _decode(b64) {
  const binStr = atob(b64.replace(/\\s+/g, ''));
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}`;

// ─── Runtime sandbox (injected into tester page) ──────────────────────────────
function runtimeClientSandbox() {
  function _decode(b64) {
    const binStr = atob(b64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const ENDPOINTS = _decode(
    document.getElementById('__monkey_data__').textContent.trim()
  );

  let currentKey = null;

  document.getElementById('base-url').value = window.location.origin;

  const savedToken = localStorage.getItem('__auth_token__');
  if (savedToken) {
    document.getElementById('jwt-input').value = savedToken;
  }

  function buildSidebar() {
    const sidebar = document.getElementById('sidebar-nav');
    const keys = Object.keys(ENDPOINTS);
    if (keys.length === 0) {
      sidebar.innerHTML += '<div style="padding:18px;color:var(--text-dim);font-size:12px">No endpoints discovered.</div>';
      return;
    }
    keys.forEach((key, i) => {
      const ep = ENDPOINTS[key];
      const item = document.createElement('div');
      item.className = 'nav-item' + (i === 0 ? ' active' : '');
      item.setAttribute('data-key', key);
      item.innerHTML =
        '<span class="method-badge ' + ep.method + '">' + ep.method + '</span>' +
        '<span class="nav-label">' + ep.path + '</span>';
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        clearResponse();
        renderPanel(key);
      });
      sidebar.appendChild(item);
    });
    renderPanel(keys[0]);
  }

  function renderPanel(key) {
    currentKey = key;
    const ep = ENDPOINTS[key];
    const main = document.getElementById('main-panel');
    if (!ep) return;

    let html =
      '<div class="endpoint-title">' + ep.title + '</div>' +
      '<div class="endpoint-path"><span class="method-badge ' + ep.method + '">' + ep.method + '</span><span>' + ep.path + '</span></div>' +
      '<div class="endpoint-desc">' + ep.desc + '</div>';

    if (ep.params && ep.params.length) {
      html += '<div class="form-section"><div class="form-section-title">Path Parameters</div>';
      ep.params.forEach(p => {
        html +=
          '<div class="field-row"><label class="field-label">' + p.label + '</label>' +
          '<input type="text" id="param-' + p.name + '" placeholder="' + p.placeholder + '" /></div>';
      });
      html += '</div>';
    }

    if (ep.fields && ep.fields.length) {
      html += '<div class="form-section"><div class="form-section-title">HTTP JSON Payload Parameters</div>';
      ep.fields.forEach(f => {
        html +=
          '<div class="field-row"><label class="field-label">' + f.label + '</label>' +
          '<input type="' + (f.type || 'text') + '" id="field-' + f.name + '" placeholder="' + (f.placeholder || '') + '" /></div>';
      });
      html += '</div>';
    }

    html +=
      '<div class="btn-row">' +
      '<button class="btn" id="_exec_btn">Execute Route</button>' +
      '<button class="btn btn-secondary" id="_clear_btn">Clear Context</button>' +
      '</div>';

    main.innerHTML = html;
    document.getElementById('_exec_btn').addEventListener('click', sendRequest);
    document.getElementById('_clear_btn').addEventListener('click', clearResponse);
  }

  async function sendRequest() {
    const ep = ENDPOINTS[currentKey];
    let path = ep.path;

    if (ep.params && ep.params.length) {
      for (const p of ep.params) {
        const val = (document.getElementById('param-' + p.name) || {}).value || '';
        if (!val.trim()) { showToast('⚠ Path param "' + p.label + '" is required'); return; }
        path = path.replace(':' + p.name, encodeURIComponent(val.trim()));
      }
    }

    const baseUrl = document.getElementById('base-url').value.replace(/\/+$/, '');
    const url = baseUrl + path;
    const headers = { 'Content-Type': 'application/json' };
    const jwt = document.getElementById('jwt-input').value.trim();
    if (jwt) headers['Authorization'] = 'Bearer ' + jwt;

    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.fields && ep.fields.length) {
      const payload = {};
      ep.fields.forEach(f => {
        const el = document.getElementById('field-' + f.name);
        if (!el) return;
        let v = el.value.trim();
        if (f.type === 'number' && v !== '') v = Number(v);
        payload[f.name] = v;
      });
      body = JSON.stringify(payload);
    }

    setResponse(null, 'loading');
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: ep.method, headers, body });
      const ms = Date.now() - t0;
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      setResponse(data, res.ok ? 'ok' : 'err', res.status, ms);
    } catch (err) {
      setResponse({ error: err.message }, 'err', 'FAIL', 0);
    }
  }

  function setResponse(data, state, status, ms) {
    const badge = document.getElementById('status-badge');
    const body  = document.getElementById('response-body');
    if (state === 'loading') {
      badge.className = 'status-badge status-idle'; badge.textContent = '…';
      body.className  = 'response-body empty';      body.textContent = 'Executing transmission…';
      return;
    }
    badge.className = 'status-badge ' + (state === 'ok' ? 'status-ok' : 'status-err');
    badge.textContent = status + ' · ' + ms + 'ms';
    body.className = 'response-body';
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    body.innerHTML = '<pre class="json-render-block">' + highlight(str) + '</pre>';
  }

  function clearResponse() {
    document.getElementById('status-badge').className = 'status-badge status-idle';
    document.getElementById('status-badge').textContent = '—';
    const body = document.getElementById('response-body');
    body.className = 'response-body empty';
    body.textContent = 'Execute a request row to generate feedback data';
  }

  function highlight(str) {
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        m => {
          if (/^"/.test(m)) return /:$/.test(m)
            ? '<span class="json-key">'  + m + '</span>'
            : '<span class="json-str">'  + m + '</span>';
          if (/true|false/.test(m)) return '<span class="json-bool">' + m + '</span>';
          if (/null/.test(m))       return '<span class="json-null">' + m + '</span>';
          return '<span class="json-num">' + m + '</span>';
        }
      );
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  buildSidebar();
}

// ─── UI templates ─────────────────────────────────────────────────────────────
const UI = {

  // ── Tester sandbox ──────────────────────────────────────────────────────────
  // appName: displayed in the header logo
  tester: (endpointsJsonB64, appName = 'App') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>${appName} — API Tester</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root { --bg:#0e0c09; --surface:#181510; --surface2:#221d14; --border:#3a3020; --accent:#e8a838; --text:#f0e8d8; --text-dim:#9a8c78; --red:#d45c3c; --green:#6ba05a; --blue:#5a86c0; --radius:8px; }
  *  { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; font-size:14px; height:100vh; overflow:hidden; background-image:radial-gradient(ellipse 80% 60% at 50% -20%,#3a2a0a22 0%,transparent 70%); }
  header { border-bottom:1px solid var(--border); padding:16px 32px; display:flex; align-items:center; gap:20px; background:#0e0c09ee; backdrop-filter:blur(8px); height:65px; }
  .logo { font-family:'Playfair Display',serif; font-size:20px; color:var(--accent); }
  .logo span { color:var(--text-dim); font-size:11px; font-family:'DM Mono',monospace; margin-left:8px; }
  .header-right { margin-left:auto; display:flex; align-items:center; gap:16px; }
  .jwt-wrap,.base-url-wrap { display:flex; align-items:center; gap:8px; }
  .jwt-wrap label,.base-url-wrap label { color:var(--text-dim); font-size:11px; font-family:'DM Mono',monospace; }
  #jwt-input,#base-url { background:var(--surface2); border:1px solid var(--border); color:var(--text); font-family:'DM Mono',monospace; font-size:12px; padding:6px 12px; border-radius:var(--radius); width:220px; outline:none; }
  .layout { display:grid; grid-template-columns:280px 1fr 450px; height:calc(100vh - 65px); overflow:hidden; }
  aside { border-right:1px solid var(--border); overflow-y:auto; padding:16px 0; background:#0b0907; }
  .section-label { font-size:10px; font-family:'DM Mono',monospace; color:var(--text-dim); text-transform:uppercase; padding:12px 18px 6px; }
  .nav-item { display:flex; align-items:center; gap:10px; padding:10px 18px; cursor:pointer; border-left:2px solid transparent; color:var(--text-dim); }
  .nav-item.active { border-left-color:var(--accent); background:var(--surface); color:var(--accent); }
  .method-badge { font-family:'DM Mono',monospace; font-size:9px; font-weight:600; padding:2px 6px; border-radius:4px; min-width:52px; text-align:center; }
  .GET{background:#1a3a22;color:#6ba05a;} .POST{background:#1a2e3a;color:#5a86c0;} .PUT{background:#3a2e10;color:#e8a838;} .DELETE{background:#3a1a14;color:#d45c3c;}
  .nav-label { font-size:12px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  main { overflow-y:auto; padding:32px; background:#0e0c09; }
  .endpoint-title { font-family:'Playfair Display',serif; font-size:24px; color:var(--accent); margin-bottom:8px; }
  .endpoint-path { font-family:'DM Mono',monospace; font-size:13px; color:var(--text-dim); margin-bottom:24px; display:flex; align-items:center; gap:8px; }
  .endpoint-desc { color:var(--text-dim); font-size:13px; line-height:1.6; margin-bottom:24px; border-left:2px solid var(--border); padding-left:12px; }
  .form-section { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:20px; margin-bottom:20px; }
  .form-section-title { font-size:11px; font-family:'DM Mono',monospace; color:var(--text-dim); text-transform:uppercase; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:6px; }
  .field-row { display:grid; grid-template-columns:150px 1fr; align-items:center; gap:16px; margin-bottom:14px; }
  .field-label { font-family:'DM Mono',monospace; font-size:12px; color:var(--text-dim); text-align:right; }
  input[type=text],input[type=password],input[type=number],input[type=email],input[type=date],input[type=tel],input[type=url] { background:var(--surface2); border:1px solid var(--border); color:var(--text); font-size:13px; padding:8px 12px; border-radius:var(--radius); width:100%; outline:none; }
  .btn-row { margin-top:24px; display:flex; gap:12px; }
  .btn { background:var(--accent); color:#0e0c09; border:none; padding:10px 24px; border-radius:var(--radius); font-size:13px; font-weight:500; cursor:pointer; }
  .btn-secondary { background:var(--surface2); color:var(--text-dim); border:1px solid var(--border); }
  .response-panel { border-left:1px solid var(--border); display:flex; flex-direction:column; background:#110e0a; }
  .response-header { padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; background:var(--surface); height:50px; }
  .response-header-title { font-size:11px; font-family:'DM Mono',monospace; color:var(--text-dim); text-transform:uppercase; }
  .status-badge { font-family:'DM Mono',monospace; font-size:12px; margin-left:auto; padding:2px 8px; border-radius:4px; }
  .status-ok{background:#1a3a22;color:#6ba05a;} .status-err{background:#3a1a14;color:#d45c3c;} .status-idle{background:var(--surface2);color:var(--text-dim);}
  .response-body { flex:1; overflow-y:auto; padding:0; background:#0d0b08; }
  .response-body.empty { color:var(--text-dim); display:flex; align-items:center; justify-content:center; padding:20px; font-size:13px; }
  .json-render-block { display:block; padding:20px; font-family:'DM Mono',monospace; font-size:12px; line-height:1.5; white-space:pre; }
  .json-key{color:#e8a838;} .json-str{color:#9ab878;} .json-num{color:#5a86c0;} .json-bool{color:#c47a1e;} .json-null{color:var(--text-dim);}
  #toast { position:fixed; bottom:24px; right:24px; background:var(--surface2); border:1px solid var(--border); padding:10px 18px; border-radius:var(--radius); opacity:0; transition:all .25s; font-family:'DM Mono',monospace; font-size:12px; color:var(--accent); }
  #toast.show { opacity:1; }
</style>
</head>
<body>
<script id="__monkey_data__" type="text/plain">${endpointsJsonB64}</script>
<header>
  <div class="logo">${appName} <span>API Tester</span></div>
  <div class="header-right">
    <div class="base-url-wrap"><label>HOST</label><input id="base-url" type="text" value=""></div>
    <div class="jwt-wrap"><label>BEARER AUTH</label><input id="jwt-input" type="text" placeholder="Token value..."></div>
  </div>
</header>
<div class="layout">
  <aside id="sidebar-nav"><div class="section-label">Discovered Endpoints</div></aside>
  <main id="main-panel"></main>
  <div class="response-panel">
    <div class="response-header"><span class="response-header-title">Response Output</span><span id="status-badge" class="status-badge status-idle">—</span></div>
    <div class="response-body empty" id="response-body">Execute a request row to generate feedback data</div>
  </div>
</div>
<div id="toast"></div>
<script>(${runtimeClientSandbox.toString()})();</script>
</body>
</html>`,

  // ── Login page ──────────────────────────────────────────────────────────────
  // appName: shown as the page title and card heading
  // loginPath: the API endpoint to POST credentials to (default: /api/v1/auth/login)
  // redirectTo: where to send the user after a successful login (default: /dashboard)
  login: (appName = 'App', loginPath = '/api/v1/auth/login', redirectTo = '/dashboard') => `<!DOCTYPE html>
<html>
<head>
<title>${appName} — Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { background:#0e0c09; color:#f0e8d8; font-family:'DM Sans',sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
  .card { background:#181510; border:1px solid #3a3020; padding:40px; border-radius:12px; width:340px; }
  h2 { color:#e8a838; margin:0 0 8px; text-align:center; }
  .subtitle { color:#9a8c78; font-size:13px; text-align:center; margin:0 0 28px; }
  .field { margin-bottom:20px; }
  label { display:block; font-size:11px; color:#9a8c78; text-transform:uppercase; margin-bottom:8px; }
  input { background:#221d14; border:1px solid #3a3020; color:#f0e8d8; padding:12px; width:100%; box-sizing:border-box; border-radius:6px; outline:none; font-size:14px; }
  input::placeholder { color:#5a5040; }
  button { background:#e8a838; color:#0e0c09; border:none; padding:12px; width:100%; border-radius:6px; font-weight:600; cursor:pointer; margin-top:10px; font-size:14px; }
  .footer { text-align:center; margin-top:20px; font-size:13px; color:#9a8c78; }
  a { color:#e8a838; text-decoration:none; }
  #err { color:#d45c3c; font-size:13px; margin-bottom:15px; text-align:center; min-height:18px; }
</style>
</head>
<body>
<div class="card">
  <h2>${appName}</h2>
  <p class="subtitle">Sign in to your account</p>
  <div id="err"></div>
  <div class="field"><label>Email</label><input type="email" id="email" placeholder="you@example.com" autocomplete="email"></div>
  <div class="field"><label>Password</label><input type="password" id="password" placeholder="Your password" autocomplete="current-password"></div>
  <button onclick="handleLogin()">Sign In</button>
  <div class="footer">Need an account? <a href="/signup">Sign up</a></div>
</div>
<script>
async function handleLogin() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errDiv   = document.getElementById('err');
  errDiv.textContent = '';
  if (!email || !password) { errDiv.textContent = 'Please fill in all fields.'; return; }
  try {
    const res  = await fetch('${loginPath}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('__auth_token__', data.token);
      window.location.href = '${redirectTo}';
    } else {
      errDiv.textContent = data.error || data.message || 'Login failed.';
    }
  } catch (e) {
    errDiv.textContent = 'Network error — could not reach the server.';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
</script>
</body>
</html>`,

  // ── Signup page ─────────────────────────────────────────────────────────────
  // appName: shown as the page title and card heading
  // registerPath: the API endpoint to POST to (default: /api/v1/auth/register)
  signup: (appName = 'App', registerPath = '/api/v1/auth/register') => `<!DOCTYPE html>
<html>
<head>
<title>${appName} — Create Account</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { background:#0e0c09; color:#f0e8d8; font-family:'DM Sans',sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
  .card { background:#181510; border:1px solid #3a3020; padding:40px; border-radius:12px; width:340px; }
  h2 { color:#e8a838; margin:0 0 8px; text-align:center; }
  .subtitle { color:#9a8c78; font-size:13px; text-align:center; margin:0 0 28px; }
  .field { margin-bottom:20px; }
  label { display:block; font-size:11px; color:#9a8c78; text-transform:uppercase; margin-bottom:8px; }
  input { background:#221d14; border:1px solid #3a3020; color:#f0e8d8; padding:12px; width:100%; box-sizing:border-box; border-radius:6px; outline:none; font-size:14px; }
  input::placeholder { color:#5a5040; }
  button { background:#e8a838; color:#0e0c09; border:none; padding:12px; width:100%; border-radius:6px; font-weight:600; cursor:pointer; margin-top:10px; font-size:14px; }
  .footer { text-align:center; margin-top:20px; font-size:13px; color:#9a8c78; }
  a { color:#e8a838; text-decoration:none; }
  #msg { font-size:13px; margin-bottom:15px; text-align:center; min-height:18px; }
</style>
</head>
<body>
<div class="card">
  <h2>${appName}</h2>
  <p class="subtitle">Create your account</p>
  <div id="msg"></div>
  <div class="field"><label>Username</label><input type="text" id="username" placeholder="Choose a username" autocomplete="username"></div>
  <div class="field"><label>Email Address</label><input type="email" id="email" placeholder="you@example.com" autocomplete="email"></div>
  <div class="field"><label>Password</label><input type="password" id="password" placeholder="Choose a password" autocomplete="new-password"></div>
  <button onclick="handleRegister()">Create Account</button>
  <div class="footer">Have an account? <a href="/login">Sign in</a></div>
</div>
<script>
async function handleRegister() {
  const username = document.getElementById('username').value.trim();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const msgDiv   = document.getElementById('msg');
  msgDiv.textContent = '';
  if (!username || !email || !password) { msgDiv.style.color = '#d45c3c'; msgDiv.textContent = 'Please fill in all fields.'; return; }
  try {
    const res  = await fetch('${registerPath}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      msgDiv.style.color = '#6ba05a';
      msgDiv.textContent = 'Account created! Redirecting to login…';
      setTimeout(() => window.location.href = '/login', 1200);
    } else {
      msgDiv.style.color = '#d45c3c';
      msgDiv.textContent = data.error || data.message || 'Registration failed.';
    }
  } catch (e) {
    msgDiv.style.color = '#d45c3c';
    msgDiv.textContent = 'Network error — could not reach the server.';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });
</script>
</body>
</html>`,

  // ── Dashboard ────────────────────────────────────────────────────────────────
  // endpointsJsonB64: base64-encoded endpoints payload from encodePayload()
  // appName: shown in the page title and header h1
  dashboard: (endpointsJsonB64, appName = 'App') => `<!DOCTYPE html>
<html>
<head>
<title>${appName} — Admin Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#0e0c09; --surface:#181510; --surface2:#221d14; --border:#3a3020; --accent:#e8a838; --text:#f0e8d8; --text-dim:#9a8c78; --red:#d45c3c; --green:#6ba05a; }
  body { background:var(--bg); color:var(--text); font-family:'DM Sans',sans-serif; padding:40px; margin:0; }
  header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:20px; margin-bottom:30px; }
  h1 { color:var(--accent); margin:0; font-size:24px; }
  .nav-links { display:flex; gap:16px; align-items:center; }
  .nav-links a { color:var(--text-dim); text-decoration:none; font-size:14px; }
  .nav-links a:hover { color:var(--accent); }
  .logout-btn { background:#3a1a14; color:var(--red); border:1px solid #5a2014; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; }
  .selector-banner { background:var(--surface); border:1px solid var(--border); padding:12px 20px; border-radius:8px; margin-bottom:24px; display:flex; align-items:center; gap:12px; }
  select { background:var(--surface2); border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:6px; outline:none; font-weight:500; }
  .grid { display:grid; grid-template-columns:360px 1fr; gap:30px; }
  .panel { background:var(--surface); border:1px solid var(--border); padding:24px; border-radius:8px; height:fit-content; }
  h3 { color:var(--accent); margin-top:0; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:8px; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; }
  .field { margin-bottom:16px; }
  label { display:block; font-size:11px; color:var(--text-dim); text-transform:uppercase; margin-bottom:6px; font-family:monospace; }
  input { background:var(--surface2); border:1px solid var(--border); color:var(--text); padding:10px; width:100%; box-sizing:border-box; border-radius:6px; outline:none; }
  .btn { background:var(--accent); color:#0e0c09; border:none; padding:11px; width:100%; border-radius:6px; font-weight:700; cursor:pointer; }
  .btn-cancel { background:var(--surface2); color:var(--text-dim); border:1px solid var(--border); margin-top:8px; }
  .table-wrap { overflow-x:auto; background:var(--surface); border-radius:8px; border:1px solid var(--border); }
  table { width:100%; border-collapse:collapse; }
  th { color:var(--text-dim); text-align:left; padding:14px; border-bottom:2px solid var(--border); font-size:11px; text-transform:uppercase; background:#13100b; }
  td { padding:14px; border-bottom:1px solid var(--surface2); font-size:13px; font-family:monospace; }
  .actions-cell { display:flex; gap:8px; justify-content:flex-end; }
  .btn-sm { padding:4px 8px; border-radius:4px; border:none; font-weight:600; font-size:11px; cursor:pointer; }
  .btn-edit { background:#1a2e3a; color:#5a86c0; border:1px solid #224054; }
  .btn-del  { background:#3a1a14; color:var(--red); border:1px solid #5a2014; }
</style>
</head>
<body>
<script id="__monkey_data__" type="text/plain">${endpointsJsonB64}</script>

<header>
  <h1>${appName}</h1>
  <div class="nav-links">
    <a href="/api/tester" target="_blank">🛠 API Tester</a>
    <button class="logout-btn" onclick="localStorage.removeItem('__auth_token__'); window.location.href='/login'">Log Out</button>
  </div>
</header>

<div class="selector-banner">
  <label style="margin:0;">Resource collection:</label>
  <select id="route-selector" onchange="switchCollection()"></select>
</div>

<div class="grid">
  <div class="panel">
    <h3 id="form-title">Add Entry</h3>
    <div id="dynamic-fields-container"></div>
    <button class="btn" id="btn-submit" onclick="submitDataForm()">Submit</button>
    <button class="btn btn-sm btn-cancel" id="btn-cancel" style="display:none; margin-top:10px;" onclick="resetDataForm()">Cancel</button>
  </div>
  <div class="table-wrap">
    <table id="dynamic-table">
      <thead id="table-head"></thead>
      <tbody id="table-body"></tbody>
    </table>
  </div>
</div>

<script>
function _decode(b64) {
  const binStr = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

const ENDPOINTS = _decode(document.getElementById('__monkey_data__').textContent.trim());

const token = localStorage.getItem('__auth_token__');
if (!token) window.location.href = '/login';

let dynamicCollections = {};
let activeCollectionPath = '';
let activeEditId = null;

function resolveRoutes() {
  Object.values(ENDPOINTS).forEach(ep => {
    if (!ep.path.includes(':')) {
      if (!dynamicCollections[ep.path]) {
        dynamicCollections[ep.path] = { get: null, post: null, put: null, del: null, modelFields: ep.fields || [] };
      }
      if (ep.method === 'GET') dynamicCollections[ep.path].get = ep.path;
      if (ep.method === 'POST') {
        dynamicCollections[ep.path].post = ep.path;
        if (ep.fields && ep.fields.length) dynamicCollections[ep.path].modelFields = ep.fields;
      }
    } else {
      const basePath = ep.path.split('/:')[0];
      if (!dynamicCollections[basePath]) {
        dynamicCollections[basePath] = { get: null, post: null, put: null, del: null, modelFields: [] };
      }
      if (ep.method === 'PUT')    dynamicCollections[basePath].put = ep.path;
      if (ep.method === 'DELETE') dynamicCollections[basePath].del = ep.path;
    }
  });

  const selector = document.getElementById('route-selector');
  Object.keys(dynamicCollections).forEach(path => {
    if (dynamicCollections[path].get) {
      const opt = document.createElement('option');
      opt.value = path;
      // Derive a readable label from the path: /api/v1/students → Students
      const label = path.split('/').filter(Boolean).pop();
      opt.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      selector.appendChild(opt);
    }
  });

  if (selector.options.length > 0) switchCollection(selector.options[0].value);
}

function switchCollection(targetPath) {
  activeCollectionPath = targetPath || document.getElementById('route-selector').value;
  activeEditId = null;
  resetDataForm();
  renderFormFields();
  fetchData();
}

function renderFormFields() {
  const container = document.getElementById('dynamic-fields-container');
  container.innerHTML = '';
  const fields = dynamicCollections[activeCollectionPath].modelFields;

  if (!fields || fields.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-dim);">No writable fields detected for this endpoint.</p>';
    return;
  }

  fields.forEach(f => {
    container.innerHTML += \`
      <div class="field">
        <label>\${f.label}</label>
        <input type="\${f.type || 'text'}" id="input-\${f.name}" placeholder="\${f.placeholder || ''}">
      </div>
    \`;
  });
}

async function fetchData() {
  const head = document.getElementById('table-head');
  const body = document.getElementById('table-body');
  head.innerHTML = '';
  body.innerHTML = '<tr><td style="padding:20px;color:var(--text-dim)">Loading…</td></tr>';

  try {
    const res     = await fetch(activeCollectionPath, { headers: { 'Authorization': 'Bearer ' + token } });
    const rawData = await res.json();

    let list = [];
    if (Array.isArray(rawData)) {
      list = rawData;
    } else if (rawData && typeof rawData === 'object') {
      const arrayKey = Object.keys(rawData).find(k => Array.isArray(rawData[k]));
      list = arrayKey ? rawData[arrayKey] : [rawData];
    }

    if (!list || list.length === 0 || list[0] === null) {
      body.innerHTML = '<tr><td style="padding:30px;color:var(--text-dim)">No records found.</td></tr>';
      return;
    }

    const keys = Object.keys(list[0]).filter(k => typeof list[0][k] !== 'object');

    head.innerHTML = '<tr>' +
      keys.map(k => \`<th>\${k}</th>\`).join('') +
      '<th style="text-align:right;padding-right:20px;">Actions</th></tr>';

    body.innerHTML = '';
    list.forEach(row => {
      const targetId = row.id || row._id || list.indexOf(row);
      const rowJson  = btoa(unescape(encodeURIComponent(JSON.stringify(row))));
      const col      = dynamicCollections[activeCollectionPath];

      body.innerHTML +=
        '<tr>' +
        keys.map(k => \`<td>\${row[k] !== undefined ? row[k] : ''}</td>\`).join('') +
        \`<td class="actions-cell" style="padding-right:20px;">
          \${col.put ? \`<button class="btn-sm btn-edit" onclick="startRowEdit('\${targetId}','\${rowJson}')">Edit</button>\` : ''}
          \${col.del ? \`<button class="btn-sm btn-del"  onclick="deleteRow('\${targetId}')">Delete</button>\` : ''}
        </td></tr>\`;
    });

  } catch (e) {
    body.innerHTML = '<tr><td style="padding:20px;color:var(--red)">Failed to load data from this endpoint.</td></tr>';
    console.error(e);
  }
}

async function submitDataForm() {
  const fields  = dynamicCollections[activeCollectionPath].modelFields;
  const payload = {};
  fields.forEach(f => {
    const el = document.getElementById(\`input-\${f.name}\`);
    if (el) payload[f.name] = f.type === 'number' ? Number(el.value) : el.value;
  });

  let url    = activeCollectionPath;
  let method = 'POST';

  if (activeEditId !== null) {
    const putTemplate = dynamicCollections[activeCollectionPath].put;
    const paramName   = putTemplate.split('/:')[1];
    url    = putTemplate.replace(\`:\${paramName}\`, activeEditId);
    method = 'PUT';
  }

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(payload)
  });

  if (res.ok) { resetDataForm(); fetchData(); }
  else { alert('Request failed — check the console for details.'); }
}

async function deleteRow(id) {
  if (!confirm('Delete this record?')) return;
  const delTemplate = dynamicCollections[activeCollectionPath].del;
  const paramName   = delTemplate.split('/:')[1];
  const url         = delTemplate.replace(\`:\${paramName}\`, id);
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
  if (res.ok) fetchData(); else alert('Delete failed.');
}

function startRowEdit(id, encodedJson) {
  activeEditId = id;
  const data = JSON.parse(decodeURIComponent(escape(atob(encodedJson))));
  document.getElementById('form-title').textContent  = \`Edit record #\${id}\`;
  document.getElementById('btn-submit').textContent   = 'Save Changes';
  document.getElementById('btn-cancel').style.display = 'block';
  const fields = dynamicCollections[activeCollectionPath].modelFields;
  fields.forEach(f => {
    const el = document.getElementById(\`input-\${f.name}\`);
    if (el && data[f.name] !== undefined) el.value = data[f.name];
  });
}

function resetDataForm() {
  activeEditId = null;
  document.getElementById('form-title').textContent   = 'Add Entry';
  document.getElementById('btn-submit').textContent    = 'Submit';
  document.getElementById('btn-cancel').style.display  = 'none';
  (dynamicCollections[activeCollectionPath]?.modelFields || []).forEach(f => {
    const el = document.getElementById(\`input-\${f.name}\`);
    if (el) el.value = '';
  });
}

resolveRoutes();
</script>
</body>
</html>`

};

export { UI, encodePayload };