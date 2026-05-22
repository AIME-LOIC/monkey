'use strict';

import { UI, encodePayload } from './htmlTemplate.js';

function inferType(name) {
  const n = name.toLowerCase();
  if (n.includes('email'))                               return 'email';
  if (n.includes('password') || n.includes('pass'))      return 'password';
  if (n.includes('date') || n.includes('birth'))         return 'date';
  if (n.includes('phone') || n.includes('tel'))          return 'tel';
  if (n.includes('url') || n.includes('website') || n.includes('link')) return 'url';
  if (
    n.includes('age')   || n.includes('price')  || n.includes('amount') ||
    n.includes('count') || n.includes('qty')    || n.includes('quantity') ||
    n.includes('stock') || n.includes('salary') || n.includes('total')   ||
    (n === 'id')        || n.endsWith('_id')    || n.endsWith('Id')
  )                                                     return 'number';
  return 'text';
}

function buildField(name) {
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1'),
    type: inferType(name),
    placeholder: 'Enter ' + name
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
      m[1].split(',').forEach(function(part) {
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
  if (p.includes('login') || p.includes('signin') || p.includes('auth/login'))    return ['email', 'password'].map(buildField);
  if (p.includes('register') || p.includes('signup') || p.includes('auth/register')) return ['username', 'email', 'password'].map(buildField);
  if (p.includes('user'))    return ['username', 'email', 'password'].map(buildField);
  if (p.includes('product')) return ['name', 'price', 'stock'].map(buildField);
  if (p.includes('order'))   return ['productId', 'quantity', 'address'].map(buildField);
  return [];
}

function extractRouterPrefix(layer) {
  if (!layer.regexp) return '';
  const src = layer.regexp.source;
  const patterns = [/^\^\\\/([^\\?$]+)/, /^\^\\\/([a-zA-Z0-9_/-]+)/];
  for (var i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(src);
    if (m && m[1]) return '/' + m[1].replace(/\\\//g, '/').replace(/\\/g, '');
  }
  return '';
}

function parseStack(stack, detectedEndpoints, prefix) {
  if (!Array.isArray(stack)) return;

  for (var i = 0; i < stack.length; i++) {
    var layer = stack[i];
    if (layer.route) {
      var rawPath  = typeof layer.route.path === 'string' ? layer.route.path : (layer.route.path ? String(layer.route.path) : '');
      var fullPath = (prefix + rawPath).replace(/\/+/g, '/') || '/';

      if (fullPath.startsWith('/api/tester')) continue;

      var methods    = Object.keys(layer.route.methods || {});
      var pathParams = [];
      var paramRe    = /:([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      var pm;
      while ((pm = paramRe.exec(fullPath)) !== null) {
        pathParams.push({ name: pm[1], label: pm[1].charAt(0).toUpperCase() + pm[1].slice(1), placeholder: 'value' });
      }

      var bodyFields = [];
      if (methods.some(function(m) { return ['POST', 'PUT', 'PATCH'].indexOf(m.toUpperCase()) !== -1; })) {
        var handlers = (layer.route.stack || []).map(function(sl) { return sl.handle; }).filter(Boolean);
        for (var j = 0; j < handlers.length; j++) {
          bodyFields.push.apply(bodyFields, extractBodyFields(handlers[j]));
        }
        var seen2 = new Map();
        bodyFields = bodyFields.filter(function(f) {
          if (seen2.has(f.name)) return false;
          seen2.set(f.name, true);
          return true;
        });
        if (bodyFields.length === 0 && pathParams.length === 0) {
          bodyFields = fallbackFields(fullPath);
        }
      }

      for (var k = 0; k < methods.length; k++) {
        var httpMethod = methods[k].toUpperCase();
        var key        = httpMethod + '::' + fullPath;
        detectedEndpoints[key] = {
          method: httpMethod,
          path:   fullPath,
          title:  httpMethod + ' ' + fullPath,
          desc:   'Auto-discovered endpoint — ' + fullPath,
          params: pathParams,
          fields: bodyFields
        };
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      parseStack(layer.handle.stack, detectedEndpoints, prefix + extractRouterPrefix(layer));
    }
  }
}

export function endtesterExpress() {
  return function monkeyTesterMiddleware(req, res, next) {
    var normalized = req.path.replace(/\/+$/, '');

    // Tester sandbox — must be checked before static pages so query strings don't collide
    if (normalized.startsWith('/api/tester')) {
      var app  = req.app;
      var eps  = app.__monkey_endpoints_cache__ || {};
      if (!app.__monkey_endpoints_cache__) {
        eps  = {};
        var raw = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
        parseStack(raw, eps);
        app.__monkey_endpoints_cache__ = eps;
      }
      var b64 = encodePayload(eps);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(UI.tester(b64));
    }

    // Standalone HTML pages — resolved dynamically against discovered routes
    if (normalized === '/login')    return res.send(UI.login());
    if (normalized === '/signup')   return res.send(UI.signup());
   if (normalized === '/dashboard') {
  if (!app.__monkey_endpoints_cache__) {
    var eps2 = {};
    var raw2 = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
    parseStack(raw2, eps2);
    app.__monkey_endpoints_cache__ = eps2;
  }
  var b64dash = encodePayload(app.__monkey_endpoints_cache__);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(UI.dashboard(b64dash));
}

    next();
  };
}

export default { endtesterExpress };
