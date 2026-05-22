'use strict';

import { getHtmlTemplate } from './htmlTemplate.js';

// ─── Field type inference ─────────────────────────────────────────────────────
function inferType(name) {
  const n = name.toLowerCase();
  if (n.includes('email'))                                          return 'email';
  if (n.includes('password') || n.includes('pass'))                return 'password';
  if (n.includes('date') || n.includes('birth'))                   return 'date';
  if (n.includes('phone') || n.includes('tel'))                    return 'tel';
  if (n.includes('url') || n.includes('website') || n.includes('link')) return 'url';
  if (
    n.includes('age')   || n.includes('price')  || n.includes('amount') ||
    n.includes('count') || n.includes('qty')    || n.includes('quantity') ||
    n.includes('stock') || n.includes('salary') || n.includes('total')   ||
    (n === 'id')        || n.endsWith('_id')    || n.endsWith('Id')
  )                                                                 return 'number';
  return 'text';
}

function buildField(name) {
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1'),
    type: inferType(name),
    placeholder: `Enter ${name}`
  };
}

// ─── Extract req.body fields from handler source ──────────────────────────────
function extractBodyFields(handler) {
  try {
    const source = handler.toString();
    if (!source || source.includes('[native code]')) return [];

    const seen = new Map();

    // Pattern 1 — destructuring: const { email, password } = req.body
    const destructRe = /(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/g;
    let m;
    while ((m = destructRe.exec(source)) !== null) {
      m[1].split(',').forEach(part => {
        const name = part.split(':')[0].split('=')[0].trim();
        if (name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && !seen.has(name)) {
          seen.set(name, buildField(name));
        }
      });
    }

    // Pattern 2 — property access: req.body.email  /  req.body['email']
    const accessRe = /req\.body\.([a-zA-Z_$][a-zA-Z0-9_$]*)|req\.body\[['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]]/g;
    while ((m = accessRe.exec(source)) !== null) {
      const name = m[1] || m[2];
      if (name && !seen.has(name)) seen.set(name, buildField(name));
    }

    return Array.from(seen.values());
  } catch {
    return [];
  }
}

// ─── Path-based fallback fields ───────────────────────────────────────────────
function fallbackFields(path) {
  const p = path.toLowerCase();

  if (p.includes('login') || p.includes('signin') || p.includes('auth/login')) {
    return ['email', 'password'].map(buildField);
  }
  if (p.includes('register') || p.includes('signup') || p.includes('auth/register')) {
    return ['username', 'email', 'password'].map(buildField);
  }
  if (p.includes('user')) {
    return ['username', 'email', 'password'].map(buildField);
  }
  if (p.includes('product')) {
    return ['name', 'price', 'stock'].map(buildField);
  }
  if (p.includes('order')) {
    return ['productId', 'quantity', 'address'].map(buildField);
  }
  return [];
}

// ─── Extract router prefix safely from Express layer ─────────────────────────
function extractRouterPrefix(layer) {
  // Prefer explicit path if available
  if (layer.path && typeof layer.path === 'string') {
    return layer.path === '/' ? '' : layer.path;
  }

  if (!layer.regexp) return '';

  // Convert the regexp back to a path prefix by looking at the regexp source
  // Express generates regexps like: /^\/api\/v1\/?(?=\/|$)/i
  const src = layer.regexp.source;

  // Extract the literal path segment before any optional/lookahead parts
  // Match from start: ^\/ then literal segments
  const match = src.match(/^\^((?:\\\/[^\\(?[*+{}|$^]+)+)/);
  if (!match) return '';

  // Unescape the extracted path
  const raw = match[1].replace(/\\\//g, '/');

  // Remove trailing slash if present
  return raw.replace(/\/$/, '') || '';
}

// ─── Walk the Express router stack recursively ────────────────────────────────
function parseStack(stack, detectedEndpoints, prefix = '') {
  if (!Array.isArray(stack)) return;

  for (const layer of stack) {
    // ── Named route (app.get / app.post …) ──────────────────────────────────
    if (layer.route) {
      const rawPath = typeof layer.route.path === 'string'
        ? layer.route.path
        : (layer.route.path ? String(layer.route.path) : '');

      const fullPath = (prefix + rawPath).replace(/\/+/g, '/') || '/';

      // Skip the tester route itself
      if (fullPath.startsWith('/api/tester')) continue;

      const methods = Object.keys(layer.route.methods || {});

      for (const method of methods) {
        const httpMethod = method.toUpperCase();
        const key = `${httpMethod}::${fullPath}`;

        // ── Path params (:id, :slug …) ────────────────────────────────────
        const pathParams = [];
        const paramRe = /:([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        const matches = [...fullPath.matchAll(paramRe)];

        for (const pm of matches) {
          pathParams.push({
            name: pm[1],
            label: pm[1].charAt(0).toUpperCase() + pm[1].slice(1),
            placeholder: 'value'
          });
        }

        // ── Body fields ──────────────────────────────────────────────────
        let bodyFields = [];
        if (['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
          const handlers = (layer.route.stack || []).map(sl => sl.handle).filter(Boolean);
          for (const handler of handlers) {
            bodyFields.push(...extractBodyFields(handler));
          }
          // Deduplicate
          const seen = new Map();
          bodyFields = bodyFields.filter(f => {
            if (seen.has(f.name)) return false;
            seen.set(f.name, true);
            return true;
          });
          if (bodyFields.length === 0) {
            bodyFields = fallbackFields(fullPath);
          }
        }

        detectedEndpoints[key] = {
          method:  httpMethod,
          path:    fullPath,
          title:   `${httpMethod} ${fullPath}`,
          desc:    `Auto-discovered endpoint — ${fullPath}`,
          params:  pathParams,
          fields:  bodyFields,
        };
      }
    }

    // ── Nested router (app.use('/prefix', router)) ───────────────────────────
    else if (layer.handle && typeof layer.handle === 'function' && layer.handle.stack) {
      const routerPrefix = extractRouterPrefix(layer);
      parseStack(layer.handle.stack, detectedEndpoints, prefix + routerPrefix);
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
function endtesterExpress() {
  return function monkeyTesterMiddleware(req, res, next) {
    // Normalize path: strip trailing slash, handle both req.path and req.url
    const rawPath = (req.path || req.url || '').split('?')[0].replace(/\/+$/, '');

    if (rawPath !== '/api/tester') {
      return next();
    }

    const app = req.app;

    // Wait a tick to ensure all routes are registered before scanning
    // (handles edge cases where middleware is mounted before some routes)
    const detectedEndpoints = {};

    const rootStack =
      (app._router && app._router.stack) ||   // Express 4
      (app.router  && app.router.stack)  ||   // Express 5
      [];

    parseStack(rootStack, detectedEndpoints);

    const html = getHtmlTemplate(detectedEndpoints);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  };
}

export { endtesterExpress };