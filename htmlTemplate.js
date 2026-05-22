export function getHtmlTemplate(endpoints) {
  const safeJsonString = Buffer.from(JSON.stringify(endpoints)).toString('base64');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Endtester — API Environment</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0e0c09;
    --surface: #181510;
    --surface2: #221d14;
    --border: #3a3020;
    --accent: #e8a838;
    --accent2: #c47a1e;
    --text: #f0e8d8;
    --text-dim: #9a8c78;
    --red: #d45c3c;
    --green: #6ba05a;
    --blue: #5a86c0;
    --radius: 8px;
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    background: var(--bg); 
    color: var(--text); 
    font-family: 'DM Sans', sans-serif; 
    font-size: 14px; 
    height: 100vh;
    overflow: hidden; /* Prevents whole-page scrolling */
    background-image: radial-gradient(ellipse 80% 60% at 50% -20%, #3a2a0a22 0%, transparent 70%);
  }
  
  header {
    border-bottom: 1px solid var(--border); 
    padding: 16px 32px; 
    display: flex; 
    align-items: center; 
    gap: 20px;
    background: #0e0c09ee; 
    backdrop-filter: blur(8px); 
    height: 65px;
  }
  
  .logo { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--accent); letter-spacing: 0.02em; }
  .logo span { color: var(--text-dim); font-size: 11px; font-family: 'DM Mono', monospace; display: inline-block; margin-left: 8px; font-weight: 400; }
  .header-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
  .jwt-wrap, .base-url-wrap { display: flex; align-items: center; gap: 8px; }
  .jwt-wrap label, .base-url-wrap label { color: var(--text-dim); font-size: 11px; font-family: 'DM Mono', monospace; letter-spacing: 0.05em; }
  
  #jwt-input, #base-url {
    background: var(--surface2); border: 1px solid var(--border); color: var(--text);
    font-family: 'DM Mono', monospace; font-size: 12px; padding: 6px 12px; border-radius: var(--radius); width: 220px; outline: none;
  }
  
  /* Fixed view height viewport matrix layout grid rules */
  .layout { 
    display: grid; 
    grid-template-columns: 280px 1fr 450px; 
    height: calc(100vh - 65px); 
    overflow: hidden;
  }
  
  aside { 
    border-right: 1px solid var(--border); 
    overflow-y: auto; 
    padding: 16px 0; 
    background: #0b0907;
  }
  
  .section-label { font-size: 10px; font-family: 'DM Mono', monospace; color: var(--text-dim); letter-spacing: 0.12em; text-transform: uppercase; padding: 12px 18px 6px; }
  
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 18px; cursor: pointer; border-left: 2px solid transparent; color: var(--text-dim); transition: all 0.2s; }
  .nav-item:hover { background: var(--surface); color: var(--text); }
  .nav-item.active { border-left-color: var(--accent); background: var(--surface); color: var(--accent); }
  
  .method-badge { font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; min-width: 52px; text-align: center; text-transform: uppercase; }
  .GET { background: #1a3a22; color: #6ba05a; }
  .POST { background: #1a2e3a; color: #5a86c0; }
  .PUT, .PATCH { background: #3a2e10; color: #e8a838; }
  .DELETE { background: #3a1a14; color: #d45c3c; }
  
  .nav-label { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  
  main { 
    overflow-y: auto; 
    padding: 32px; 
    background: #0e0c09;
  }
  
  .endpoint-title { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--accent); margin-bottom: 8px; }
  .endpoint-path { font-family: 'DM Mono', monospace; font-size: 13px; color: var(--text-dim); margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
  .endpoint-desc { color: var(--text-dim); font-size: 13px; line-height: 1.6; margin-bottom: 24px; border-left: 2px solid var(--border); padding-left: 12px; }
  
  .form-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 20px; }
  .form-section-title { font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  
  .field-row { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 16px; margin-bottom: 14px; }
  .field-row:last-child { margin-bottom: 0; }
  .field-label { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--text-dim); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  
  input[type=text], input[type=password], input[type=number], input[type=date], input[type=tel], input[type=url], select { 
    background: var(--surface2); border: 1px solid var(--border); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 8px 12px; border-radius: var(--radius); width: 100%; outline: none; transition: border-color 0.2s; 
  }
  input:focus { border-color: var(--accent); }
  
  .btn-row { margin-top: 24px; display: flex; gap: 12px; }
  .btn { background: var(--accent); color: #0e0c09; border: none; padding: 10px 24px; border-radius: var(--radius); font-size: 13px; font-weight: 500; cursor: pointer; transition: background-color 0.2s; }
  .btn:hover { background: #f0b850; }
  .btn-secondary { background: var(--surface2); color: var(--text-dim); border: 1px solid var(--border); }
  .btn-secondary:hover { color: var(--text); background: var(--surface); }
  
  /* FIXED: Response block scroll logic layout rules */
  .response-panel { 
    border-left: 1px solid var(--border); 
    display: flex; 
    flex-direction: column; 
    overflow: hidden; 
    background: #110e0a;
  }
  .response-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; background: var(--surface); height: 50px; }
  .response-header-title { font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .status-badge { font-family: 'DM Mono', monospace; font-size: 12px; margin-left: auto; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
  .status-ok { background: #1a3a22; color: #6ba05a; }
  .status-err { background: #3a1a14; color: #d45c3c; }
  .status-idle { background: var(--surface2); color: var(--text-dim); }
  
  /* FIXED: Body panel scrolls y natively, inner token element handles x scrolling */
  .response-body { 
    flex: 1; 
    overflow-y: auto; 
    overflow-x: hidden; 
    padding: 0; 
    background: #0d0b08;
  }
  .response-body.empty { 
    color: var(--text-dim); 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    padding: 20px;
    text-align: center;
    font-size: 13px;
  }
  
  /* FIXED: Token code output container handles micro horizontal data flows elegantly */
  .json-render-block {
    display: block;
    padding: 20px;
    margin: 0;
    font-family: 'DM Mono', monospace; 
    font-size: 12px; 
    line-height: 1.5;
    white-space: pre; 
    overflow-x: auto; 
    word-break: normal;
    word-wrap: normal;
  }
  
  .json-key { color: #e8a838; } 
  .json-str { color: #9ab878; } 
  .json-num { color: #5a86c0; }
  
  #toast { position: fixed; bottom: 24px; right: 24px; background: var(--surface2); border: 1px solid var(--border); padding: 10px 18px; border-radius: var(--radius); opacity: 0; transition: all .25s; z-index: 1000; font-family: 'DM Mono', monospace; font-size: 12px; color: var(--accent); }
  #toast.show { opacity: 1; }
</style>
</head>
<body>

<div id="endtester-data-vault" data-payload="${safeJsonString}" style="display: none;"></div>

<header>
  <div class="logo">Endtester <span>Application Runtime Sandbox</span></div>
  <div class="header-right">
    <div class="base-url-wrap">
      <label>TARGET HOST</label>
      <input id="base-url" type="text" value="">
    </div>
    <div class="jwt-wrap">
      <label>BEARER AUTH</label>
      <input id="jwt-input" type="text" placeholder="Token value...">
    </div>
  </div>
</header>

<div class="layout">
  <aside id="sidebar-nav">
    <div class="section-label">Discovered Endpoints</div>
  </aside>
  <main id="main-panel"></main>
  <div class="response-panel">
    <div class="response-header">
      <span class="response-header-title">Response Output</span>
      <span id="status-badge" class="status-badge status-idle">—</span>
    </div>
    <div class="response-body empty" id="response-body">Execute a request row to generate feedback data</div>
  </div>
</div>

<div id="toast"></div>

<script>
const rawPayload = document.getElementById('endtester-data-vault').getAttribute('data-payload');
const ENDPOINTS = JSON.parse(atob(rawPayload));

let currentEp = '';

document.getElementById('base-url').value = window.location.origin;

function buildSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  const keys = Object.keys(ENDPOINTS);

  if (keys.length === 0) {
    sidebar.innerHTML += '<div style="padding:15px; color:var(--text-dim)">No active application endpoints discovered.</div>';
    return;
  }

  keys.forEach((key, index) => {
    const ep = ENDPOINTS[key];
    const div = document.createElement('div');
    div.className = index === 0 ? 'nav-item active' : 'nav-item';
    div.setAttribute('data-ep', key);
    div.innerHTML = '<span class="method-badge ' + ep.method + '">' + ep.method + '</span><span class="nav-label">' + ep.path + '</span>';
    div.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      div.classList.add('active');
      clearResponse();
      renderPanel(key);
    });
    sidebar.appendChild(div);
  });

  if (keys.length > 0) renderPanel(keys[0]);
}

function makeInputString(type, id, placeholder) {
  const pAttr = placeholder ? ' placeholder="' + placeholder + '"' : '';
  return '<input type="' + type + '" id="' + id + '"' + pAttr + ' />';
}

function renderPanel(epKey) {
  currentEp = epKey;
  const ep = ENDPOINTS[epKey];
  const main = document.getElementById('main-panel');
  if (!ep) return;

  let html = \`
    <div class="endpoint-title">\${ep.title}</div>
    <div class="endpoint-path">
      <span class="method-badge \${ep.method}">\${ep.method}</span>
      <span>\${ep.path}</span>
    </div>
    <div class="endpoint-desc">\${ep.desc}</div>
  \`;

  if (ep.params && ep.params.length) {
    html += \`<div class="form-section"><div class="form-section-title">Path Parameters</div>\`;
    ep.params.forEach(function(p) {
      const inputHtml = makeInputString('text', 'param-' + p.name, p.placeholder);
      html += \`
        <div class="field-row">
          <label class="field-label">\${p.label}</label>
          \${inputHtml}
        </div>
      \`;
    });
    html += \`</div>\`;
  }

  if (ep.fields && ep.fields.length) {
    html += \`<div class="form-section"><div class="form-section-title">HTTP JSON Request Payload Parameters</div>\`;
    ep.fields.forEach(function(f) {
      const inputHtml = makeInputString(f.type || 'text', 'field-' + f.name, f.placeholder || '');
      html += \`
        <div class="field-row">
          <label class="field-label">\${f.label}</label>
          \${inputHtml}
        </div>
      \`;
    });
    html += \`</div>\`;
  }

  html += \`
    <div class="btn-row">
      <button class="btn" onclick="sendRequest()">Execute Route</button>
      <button class="btn btn-secondary" onclick="clearResponse()">Clear Context</button>
    </div>
  \`;

  main.innerHTML = html;
}

async function sendRequest() {
  const ep = ENDPOINTS[currentEp];
  let path = ep.path;

  if (ep.params) {
    for (const p of ep.params) {
      const val = document.getElementById('param-' + p.name)?.value.trim();
      if (!val) { showToast('Warning: Parameter ' + p.label + ' is required'); return; }
      path = path.replace(':' + p.name, encodeURIComponent(val));
    }
  }

  const baseUrl = document.getElementById('base-url').value.replace(/[/]+$/, '');
  const url = baseUrl + path;
  const headers = { 'Content-Type': 'application/json' };

  const jwt = document.getElementById('jwt-input').value.trim();
  if (jwt) headers['Authorization'] = 'Bearer ' + jwt;

  let body = undefined;
  if (ep.fields && ep.fields.length && ['POST', 'PUT', 'PATCH'].includes(ep.method)) {
    const jsonPayload = {};
    for (const f of ep.fields) {
      const targetEl = document.getElementById('field-' + f.name);
      if (targetEl) {
        let entryVal = targetEl.value.trim();
        if (f.type === 'number' && entryVal !== '') {
          entryVal = Number(entryVal);
        }
        jsonPayload[f.name] = entryVal;
      }
    }
    body = JSON.stringify(jsonPayload);
  }

  setResponse(null, 'loading');
  const start = Date.now();

  try {
    const res = await fetch(url, { method: ep.method, headers, body });
    const ms = Date.now() - start;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    setResponse(json, res.ok ? 'ok' : 'err', res.status, ms);
  } catch (err) {
    setResponse({ error: err.message }, 'err', 'FAIL', 0);
  }
}

function setResponse(data, state, status, ms) {
  const badge = document.getElementById('status-badge');
  const body  = document.getElementById('response-body');

  if (state === 'loading') {
    badge.className = 'status-badge status-idle';
    badge.textContent = '...';
    body.className = 'response-body empty';
    body.innerHTML = 'Executing transmission...';
    return;
  }

  badge.className = 'status-badge ' + (state === 'ok' ? 'status-ok' : 'status-err');
  badge.textContent = status + ' · ' + ms + 'ms';
  body.className = 'response-body';
  
  // FIXED: Nested rendering inside dedicated horizontal scrolling code tag block wrapper elements
  const outputString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  body.innerHTML = '<pre class="json-render-block">' + highlightJson(outputString) + '</pre>';
}

function clearResponse() {
  const badge = document.getElementById('status-badge');
  const body  = document.getElementById('response-body');
  badge.className = 'status-badge status-idle';
  badge.textContent = '—';
  body.className = 'response-body empty';
  body.textContent = 'Execute a request row to generate feedback data';
}

function highlightJson(str) {
  return str
    .replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/[>]/g, '&gt;')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return '<span class="json-key">' + match + '</span>';
        return '<span class="json-str">' + match + '</span>';
      }
      return '<span class="json-num">' + match + '</span>';
    });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

buildSidebar();
</script>
</body>
</html>
`;
}
