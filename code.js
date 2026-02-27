figma.showUI(__html__, { width: 520, height: 600 });

const collections = figma.variables.getLocalVariableCollections();

/* =============================
   CONFIG
============================= */

const COLLECTION_NAME = 'Colors';
const GROUP_COLOR_RAMP = 'ColorRamp';
const GROUP_SEMANTIC = 'Semantic';
const KEY_COLORRAMP = 'a';

/* =============================
   UTILITIES
============================= */

const pascal = str =>
  str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(s => s[0].toUpperCase() + s.slice(1))
    .join('');

const camel = str => {
  const p = pascal(str);
  return p[0].toLowerCase() + p.slice(1);
};

function toKebab(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-');
}

function resolveAliasPath(variable, modeId, depth = 0) {
  if (depth > 20) return null;

  const raw = variable.valuesByMode[modeId];
  if (!raw) return null;

  if (raw.type === 'VARIABLE_ALIAS') {
    const ref = figma.variables.getVariableById(raw.id);
    if (!ref) return null;
    return resolveAliasPath(ref, modeId, depth + 1);
  }

  return variable;
}

/* =============================
   COLOR CONVERSION (ALPHA SAFE)
============================= */

const figmaRGBToHex = c => {
  const toHex = n =>
    Math.round(n * 255).toString(16).padStart(2, '0');

  const alpha = toHex(c.a !== undefined ? c.a : 1);

  return `0x${alpha}${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`.toUpperCase();
};

const figmaRGBToCSS = c => {
  const toHex = n =>
    Math.round(n * 255).toString(16).padStart(2, '0');

  const r = toHex(c.r);
  const g = toHex(c.g);
  const b = toHex(c.b);
  const a = toHex(c.a !== undefined ? c.a : 1);

  return `#${r}${g}${b}${a}`.toUpperCase();
};

/* =============================
   RESOLVE COLOR (ALIAS SAFE)
============================= */

function resolveColor(variable, modeId, depth = 0) {
  if (depth > 10) return null;

  const raw = variable.valuesByMode[modeId];
  if (!raw) return null;

  if (raw && raw.type === 'VARIABLE_ALIAS') {
    const ref = figma.variables.getVariableById(raw.id);
    return ref ? resolveColor(ref, modeId, depth + 1) : null;
  }

  if (variable.resolvedType === 'COLOR') {
    return {
      hex: figmaRGBToHex(raw),
      css: figmaRGBToCSS(raw),
      variable
    };
  }

  return null;
}

/* =============================
   TREE BUILDER (DART)
============================= */

function insert(tree, path, value) {
  let node = tree;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (!node[key]) node[key] = i === path.length - 1 ? value : {};
    node = node[key];
  }
}

/* =============================
   DART EXPORT
============================= */

function emitClass(name, node, indent) {
  const pad = ' '.repeat(indent);
  let out = `${pad}class ${pascal(name)} {\n`;

  for (const key in node) {
    const value = node[key];

    if (typeof value === 'string') {
      const field = /^\d/.test(key) ? `${KEY_COLORRAMP}${key}` : camel(key);
      out += `${pad}  static const Color ${field} = ${value};\n`;
    } else {
      out += emitClass(key, value, indent + 2);
    }
  }

  out += `${pad}}\n\n`;
  return out;
}

function buildDart(collection, mode) {
  const rampTree = {};
  const semanticTree = {};

  for (const id of collection.variableIds) {
    const v = figma.variables.getVariableById(id);
    if (!v) continue;

    const path = v.name.split('/').map(p => p.trim());
    const resolved = resolveColor(v, mode.modeId);
    if (!resolved) continue;

    if (path[0] === GROUP_COLOR_RAMP && path.length >= 3) {
      insert(rampTree, path.slice(1), `Color(${resolved.hex})`);
    }

    if (path[0] === GROUP_SEMANTIC && path.length >= 3) {

      const original = v.valuesByMode[mode.modeId];

      if (original && original.type === 'VARIABLE_ALIAS') {

        const ref = figma.variables.getVariableById(original.id);
        if (!ref) continue;

        const refPath = ref.name.split('/').map(p => p.trim());

        // Alias → Semantic
        if (refPath[0] === GROUP_SEMANTIC) {

          insert(
            semanticTree,
            path.slice(1),
            refPath.slice(1).map(p => pascal(p)).join('.')
          );

          continue;
        }

        // Alias → ColorRamp
        if (refPath[0] === GROUP_COLOR_RAMP && refPath.length >= 3) {

          insert(
            semanticTree,
            path.slice(1),
            `${GROUP_COLOR_RAMP}.${pascal(refPath[1])}.${KEY_COLORRAMP}${refPath[2]}`
          );

          continue;
        }
      }

      // fallback raw color
      insert(semanticTree, path.slice(1), `Color(${resolved.hex})`);
    }
  }

  let output = `class ${pascal(mode.name)} {\n`;
  output += emitClass(GROUP_COLOR_RAMP, rampTree, 2);
  output += emitClass(GROUP_SEMANTIC, semanticTree, 2);
  output += `}\n\n`;

  return output;
}

/* =============================
   CSS EXPORT
============================= */

function buildCSSMode(collection, mode, indent = 2) {
  const rampVars = {};
  const semanticVars = {};

  for (const id of collection.variableIds) {
    const v = figma.variables.getVariableById(id);
    if (!v) continue;

    const path = v.name.split('/').map(p => p.trim());
    const resolved = resolveColor(v, mode.modeId);
    if (!resolved) continue;

    // COLOR RAMP
    if (path[0] === GROUP_COLOR_RAMP && path.length >= 3) {
      const name = `--${toKebab(path[1])}-${toKebab(path[2])}`;
      rampVars[name] = resolved.css;
    }

    // SEMANTIC
    if (path[0] === GROUP_SEMANTIC && path.length >= 3) {
      const name = `--${path.slice(1).map(p => toKebab(p)).join('-')}`;
      const original = v.valuesByMode[mode.modeId];

      if (original && original.type === 'VARIABLE_ALIAS') {

        const ref = figma.variables.getVariableById(original.id);
        if (!ref) continue;

        const refPath = ref.name.split('/').map(p => p.trim());

        if (refPath[0] === GROUP_SEMANTIC) {

          semanticVars[name] =
            `var(--${refPath.slice(1).map(p => toKebab(p)).join('-')})`;

          continue;
        }

        if (refPath[0] === GROUP_COLOR_RAMP && refPath.length >= 3) {

          semanticVars[name] =
            `var(--${toKebab(refPath[1])}-${toKebab(refPath[2])})`;

          continue;
        }
      }

      semanticVars[name] = resolved.css;
    }
  }

  const pad = ' '.repeat(indent);
  let output = '';

  output += `${pad}/* Color Ramp */\n`;
  for (const k in rampVars) {
    output += `${pad}${k}: ${rampVars[k]};\n`;
  }

  output += `\n${pad}/* Semantic */\n`;
  for (const k in semanticVars) {
    output += `${pad}${k}: ${semanticVars[k]};\n`;
  }

  return output;
}

function buildCSS(collection) {
  const light = collection.modes.find(m =>
    m.name.toLowerCase().includes('light')
  );

  const dark = collection.modes.find(m =>
    m.name.toLowerCase().includes('dark')
  );

  let output = '';

  if (light) {
    output += `:root {\n\n`;
    output += buildCSSMode(collection, light, 2);
    output += `}\n\n`;
  }

  if (dark) {
    output += `@media (prefers-color-scheme: dark) {\n`;
    output += `  :root {\n\n`;
    output += buildCSSMode(collection, dark, 4);
    output += `  }\n`;
    output += `}\n\n`;
  }

  return output;
}

/* =============================
   MESSAGE HANDLER
============================= */

figma.ui.onmessage = msg => {
  const colors = collections.find(c => c.name === COLLECTION_NAME);
  if (!colors) return;

  let output = '';

  switch (msg.type) {
    case 'mobile':
      output += `import 'package:flutter/material.dart';\n\n`;
      colors.modes.forEach(mode => {
        output += buildDart(colors, mode);
      });
      break;

    case 'web':
      output = buildCSS(colors);
      break;
  }

  figma.ui.postMessage(output);
};