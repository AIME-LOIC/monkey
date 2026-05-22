'use strict';

import { getHtmlTemplate } from './htmlTemplate.js';

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

function extractBodyFields(handler) {
  try {
    const source = handler.toString();
    if (!source || source.includes('[native code]')) return [];

    const seen = new Map();
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

function fallbackFields(path) {
  const p = path.toLowerCase();
  if (p.includes('login') || p.includes('signin') || p.includes('auth/login')) return ['email', 'password'].map(buildField);
  if (p.includes('register') || p.includes('signup') || p.includes('auth/register')) return ['username', 'email', 'password'].map(buildField);
  if (p.includes('user')) return ['username', 'email', 'password'].map(buildField);
  if (p.includes('product')) return ['name', 'price', 'stock'].map(buildField);
  if (p.includes('order')) return ['productId', 'quantity', 'address'].map(buildField);
  return [];
}

function extractRouterPrefix(layer) {
  if (!layer.regexp) return '';
  const src = layer.regexp.source;
  const patterns = [/^\^\\\/([^\\?$]+)/, /^\^\\\/([a-zA-Z0-9_/-]+)/];
  for (const re of patterns) {
    const m = re.exec(src);
    if (m && m[1]) return '/' + m[1].replace(/\\\//g, '/').replace(/\\/g, '');
  }
  return '';
}

function parseStack(stack, detectedEndpoints, prefix = '') {
  if (!Array.isArray(stack)) return;

  for (const layer of stack) {
    if (layer.route) {
      const rawPath = typeof layer.route.path === 'string' ? layer.route.path : (layer.route.path ? String(layer.route.path) : '');
      const fullPath = (prefix + rawPath).replace(/\/+/g, '/') || '/';

      if (fullPath.startsWith('/api/tester')) continue;

      const methods = Object.keys(layer.route.methods || {});

      for (const method of methods) {
        const httpMethod = method.toUpperCase();
        const key = `${httpMethod}::${fullPath}`;

        const pathParams = [];
        const paramRe = /:([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let pm;
        while ((pm = paramRe.exec(fullPath)) !== null) {
          pathParams.push({ name: pm[1], label: pm[1].charAt(0).toUpperCase() + pm[1].slice(1), placeholder: 'value' });
        }

        let bodyFields = [];
        // Inside your parseStack function in monkey.js, update this block:
if (['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
  const handlers = (layer.route.stack || []).map(sl => sl.handle).filter(Boolean);
  for (const handler of handlers) {
    bodyFields.push(...extractBodyFields(handler));
  }
  
  const seen = new Map();
  bodyFields = bodyFields.filter(f => {
    if (seen.has(f.name)) return false;
    seen.set(f.name, true);
    return true;
  });

  // CHANGE THIS: Only apply generic fallbacks if there are no explicit path parameters
  if (bodyFields.length === 0 && pathParams.length === 0) {
    bodyFields = fallbackFields(fullPath);
  }
}

        detectedEndpoints[key] = {
          method: httpMethod,
          path: fullPath,
          title: `${httpMethod} ${fullPath}`,
          desc: `Auto-discovered endpoint - ${fullPath}`, // Safe ASCII character
          params: pathParams,
          fields: bodyFields,
        };
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const routerPrefix = extractRouterPrefix(layer);
      parseStack(layer.handle.stack, detectedEndpoints, prefix + routerPrefix);
    }
  }
}

// function endtesterExpress() { ... }


// Change it to this instead:
export function endtesterExpress() {
  return function monkeyTesterMiddleware(req, res, next) {
    if (req.path !== '/api/tester' && req.path !== '/api/tester/') {
      return next();
    }

    const app = req.app;
    const detectedEndpoints = {};

    const rootStack =
      (app._router && app._router.stack) ||
      (app.router  && app.router.stack)  ||
      [];

    parseStack(rootStack, detectedEndpoints);

    const html = getHtmlTemplate(detectedEndpoints);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  };
}

// export { endtesterExpress };
