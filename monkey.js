'use strict';

import { UI } from './htmlTemplate.js';

function inferType(name) {
  const n = name.toLowerCase();
  if (n.includes('email')) return 'email';
  if (n.includes('password') || n.includes('pass')) return 'password';
  if (n.includes('date')) return 'date';
  if (n.includes('age') || n.includes('price') || n.includes('quantity') || n.includes('stock') || n === 'id' || n.endsWith('id')) return 'number';
  return 'text';
}

function buildField(name) {
  return { name, label: name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1'), type: inferType(name), placeholder: `Enter ${name}` };
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
        if (name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && !seen.has(name)) seen.set(name, buildField(name));
      });
    }
    const accessRe = /req\.body\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    while ((m = accessRe.exec(source)) !== null) {
      const name = m[1]; if (name && !seen.has(name)) seen.set(name, buildField(name));
    }
    return Array.from(seen.values());
  } catch { return []; }
}

function extractRouterPrefix(layer) {
  if (!layer.regexp) return '';
  const m = [/^\^\\\/([^\\?$]+)/, /^\^\\\/([a-zA-Z0-9_/-]+)/].reduce((acc, re) => acc || re.exec(layer.regexp.source), null);
  return m && m[1] ? '/' + m[1].replace(/\\\//g, '/').replace(/\\/g, '') : '';
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
        if (['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
          const handlers = (layer.route.stack || []).map(sl => sl.handle).filter(Boolean);
          for (const handler of handlers) bodyFields.push(...extractBodyFields(handler));
          const seen = new Map();
          bodyFields = bodyFields.filter(f => !seen.has(f.name) && seen.set(f.name, true));
        }

        detectedEndpoints[key] = { method: httpMethod, path: fullPath, title: `${httpMethod} ${fullPath}`, desc: `Auto-discovered endpoint - ${fullPath}`, params: pathParams, fields: bodyFields };
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      parseStack(layer.handle.stack, detectedEndpoints, prefix + extractRouterPrefix(layer));
    }
  }
}

export function endtesterExpress() {
  return function monkeyTesterMiddleware(req, res, next) {
    const route = req.path.toLowerCase().replace(/\/$/, '');

    // 1. Serve Standalone Frontend Templates Interceptions
    if (route === '/login') return res.send(UI.login());
    if (route === '/signup') return res.send(UI.signup());
    if (route === '/dashboard') return res.send(UI.dashboard());

    // 2. Serve the main Tester UI environment
    if (route === '/api/tester') {
      const app = req.app;
      const detectedEndpoints = {};
      const rootStack = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
      parseStack(rootStack, detectedEndpoints);
      const b64 = Buffer.from(JSON.stringify(detectedEndpoints)).toString('base64');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(UI.tester(b64));
    }

    next();
  };
}

export default { endtesterExpress };