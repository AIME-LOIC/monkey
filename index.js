import { getHtmlTemplate } from './htmlTemplate.js';

export function endtesterExpress() {
  return (req, res, next) => {
    if (
      req.path !== '/api/tester' &&
      req.path !== '/api/tester/'
    ) {
      return next();
    }

    const expressApp = req.app;
    const detectedEndpoints = {};

    // =========================
    // Detect Input Types
    // =========================
    function detectInputType(field) {
      const lower = field.toLowerCase();

      if (lower.includes('email')) return 'email';
      if (lower.includes('password')) return 'password';
      if (lower.includes('date')) return 'date';

      if (
        lower.includes('age') ||
        lower.includes('price') ||
        lower.includes('salary') ||
        lower.includes('stock') ||
        lower.includes('quantity') ||
        lower.includes('count') ||
        lower.includes('total') ||
        lower.includes('amount') ||
        lower.includes('id')
      ) {
        return 'number';
      }

      if (
        lower.includes('phone') ||
        lower.includes('tel')
      ) {
        return 'tel';
      }

      if (
        lower.includes('url') ||
        lower.includes('website')
      ) {
        return 'url';
      }

      return 'text';
    }

    // =========================
    // Context-Aware Static Fallbacks
    // =========================
    function getFallbackFieldsForPath(path) {
      const lowerPath = path.toLowerCase();
      let rawFields = [];

      if (lowerPath.includes('login') || lowerPath.includes('auth') || lowerPath.includes('signin')) {
        rawFields = ['email', 'password'];
      } else if (lowerPath.includes('user') || lowerPath.includes('register') || lowerPath.includes('signup')) {
        rawFields = ['username', 'email', 'password'];
      } else if (lowerPath.includes('product')) {
        rawFields = ['name', 'price', 'stock'];
      } else {
        return [];
      }

      return rawFields.map(field => ({
        name: field,
        label: field.charAt(0).toUpperCase() + field.slice(1),
        type: detectInputType(field),
        placeholder: `Enter ${field}`
      }));
    }

    // =========================
    // Extract req.body fields via Source Inspection
    // =========================
    function extractBodyFields(handler) {
      try {
        const source = handler.toString();
        
        // If it's a bound handler or lacks source reference code text
        if (!source || source.includes('[native code]')) return [];

        const regex = /(const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*req\.body/gs;
        const matches = [...source.matchAll(regex)];
        const fields = [];

        matches.forEach((match) => {
          const cleanedVariablesBlock = match[2]
            .replace(/\/\/.*$/gm, '') 
            .replace(/\/\*[\s\S]*?\*\//g, '') 
            .replace(/[\r\n\t]/g, ' '); 

          const variables = cleanedVariablesBlock
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);

          variables.forEach((field) => {
            let realField = field;

            if (field.includes(':')) {
              realField = field.split(':')[0].trim();
            }

            if (realField.includes('=')) {
              realField = realField.split('=')[0].trim();
            }

            realField = realField.trim();

            const alreadyExists = fields.find(f => f.name === realField);

            if (!alreadyExists && realField) {
              fields.push({
                name: realField,
                label: realField.charAt(0).toUpperCase() + realField.slice(1),
                type: detectInputType(realField),
                placeholder: `Enter ${realField}`
              });
            }
          });
        });

        return fields;
      } catch (err) {
        console.error('Field extraction error:', err);
        return [];
      }
    }

    // =========================
    // Parse Express Stack
    // =========================
    function parseStack(stack, prefix = '') {
      if (!stack) return;

      stack.forEach((layer) => {
        // =========================
        // ROUTES
        // =========================
        if (layer.route) {
          const methods = Object.keys(layer.route.methods);
          const path = (prefix + layer.route.path).replace(/\/+/g, '/');

          if (path.includes('/api/tester')) {
            return;
          }

          methods.forEach((method) => {
            const httpMethod = method.toUpperCase();
            const key = `${httpMethod.toLowerCase()}-` + path.replace(/[^a-zA-Z0-9]/g, '-');

            const pathParams = layer.route.keys
              ? layer.route.keys.map((k) => ({
                  name: k.name,
                  label: k.name.toUpperCase(),
                  placeholder: 'value'
                }))
              : [];

            // =========================
            // BODY FIELDS COMPILING
            // =========================
            let bodyFields = [];

            if (['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
              layer.route.stack.forEach((stackLayer) => {
                if (stackLayer.handle && typeof stackLayer.handle === 'function') {
                  const extractedFields = extractBodyFields(stackLayer.handle);
                  bodyFields.push(...extractedFields);
                }
              });

              // Deduplicate discovered elements
              bodyFields = bodyFields.filter(
                (field, index, self) => index === self.findIndex(f => f.name === field.name)
              );

              // CRITICAL FAILSAFE: If code reflection extracted nothing, apply smart path-based fallback fields
              if (bodyFields.length === 0) {
                bodyFields = getFallbackFieldsForPath(path);
              }
            }

            detectedEndpoints[key] = {
              method: httpMethod,
              path,
              title: `${httpMethod} ${path}`,
              desc: `Auto-discovered endpoint: ${path}`,
              params: pathParams,
              fields: bodyFields
            };
          });
        }

        // =========================
        // NESTED ROUTERS
        // =========================
        else if (
          layer.name === 'router' &&
          layer.handle &&
          layer.handle.stack
        ) {
          let routerPath = '';

          if (layer.regexp) {
            const match = layer.regexp
              .toString()
              .match(/^\/\^\\(.*?)\\\/\?/);

            if (match && match[1]) {
              routerPath = match[1].replace(/\\/g, '');
            }
          }

          parseStack(
            layer.handle.stack,
            prefix + '/' + routerPath
          );
        }
      });
    }

    // =========================
    // START PARSING
    // =========================
    if (expressApp._router && expressApp._router.stack) {
      parseStack(expressApp._router.stack);
    }

    // =========================
    // RENDER HTML
    // =========================
    const fullHtml = getHtmlTemplate(detectedEndpoints);
    res.setHeader('Content-Type', 'text/html');
    return res.send(fullHtml);
  };
}
