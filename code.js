figma.showUI(__html__, { width: 520, height: 650 });

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

function emitSemanticTree(node, indent = 2) {

  const pad = " ".repeat(indent);
  let out = "";

  for (const key in node) {

    const value = node[key];

    if (typeof value === "string") {

      out += `${pad}static const Color ${key} = ${value};\n`;

    } else {

      out += `\n${pad}// ${pascal(key)}\n`;
      out += emitSemanticTree(value, indent);

    }
  }

  return out;
}

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

  const ramp = {};
  const semantic = {};

  for (const id of collection.variableIds) {

    const v = figma.variables.getVariableById(id);
    if (!v) continue;

    const path = v.name.split('/').map(p => p.trim());
    const resolved = resolveColor(v, mode.modeId);
    if (!resolved) continue;

    /* =============================
       COLOR RAMP
    ============================= */

    if (path[0] === GROUP_COLOR_RAMP && path.length >= 3) {

      const group = camel(path[1]);
      const level = path[2];
      const key = `${group}${level}`;

      if (!ramp[group]) ramp[group] = {};

      ramp[group][key] = `Color(${resolved.hex})`;

      continue;
    }

    /* =============================
       SEMANTIC (INFINITE DEPTH)
    ============================= */

    if (path[0] === GROUP_SEMANTIC && path.length >= 3) {

      const group = pascal(path[1]) + "Colors";

      if (!semantic[group]) semantic[group] = {};

      const treePath = path.slice(2, -1);
      const property = camel(path.slice(1).join(' '));

      let node = semantic[group];

      treePath.forEach(p => {
        if (!node[p]) node[p] = {};
        node = node[p];
      });

      const original = v.valuesByMode[mode.modeId];

      if (original && original.type === "VARIABLE_ALIAS") {

        const ref = figma.variables.getVariableById(original.id);

        if (ref) {

          const refPath = ref.name.split('/').map(p => p.trim());

          /* Alias → ColorRamp */

          if (refPath[0] === GROUP_COLOR_RAMP) {

            node[property] =
              `ColorRamp.${camel(refPath[1])}${refPath[2]}`;

            continue;
          }

          /* Alias → Semantic */

          if (refPath[0] === GROUP_SEMANTIC) {

            const refGroup = pascal(refPath[1]) + "Colors";
            const refProp = camel(refPath.slice(1).join(' '));

            node[property] =
              `${refGroup}.${refProp}`;

            continue;
          }
        }
      }

      node[property] = `Color(${resolved.hex})`;
    }
  }

  /* =============================
     BUILD OUTPUT
  ============================= */

  let out = "";

  /* ColorRamp */

  out += `class ColorRamp {\n\n`;

  for (const group in ramp) {

    out += `  // ${pascal(group)}\n`;

    const colors = ramp[group];

    Object.keys(colors)
      .sort((a,b)=>{
        const na = parseInt(a.replace(/[a-z]/gi,''));
        const nb = parseInt(b.replace(/[a-z]/gi,''));
        return na - nb;
      })
      .forEach(key=>{
        out += `  static const Color ${key} = ${colors[key]};\n`;
      });

    out += `\n`;
  }

  out += `}\n\n`;

  /* =============================
     SEMANTIC EXPORT
  ============================= */

  for (const group in semantic) {

    out += `class ${group} {\n`;
    out += emitSemanticTree(semantic[group]);

    out += `}\n\n`;
  }

  return out;
}

/* =============================
   CSS EXPORT
============================= */

function resolveCSSAlias(variable, modeId, depth = 0) {

  if (depth > 10) return null;

  const raw = variable.valuesByMode[modeId];
  if (!raw) return null;

  if (raw.type === "VARIABLE_ALIAS") {

    const ref = figma.variables.getVariableById(raw.id);
    if (!ref) return null;

    const refPath = ref.name.split("/").map(p => p.trim());

    /* Alias → ColorRamp */

    if (refPath[0] === GROUP_COLOR_RAMP && refPath.length >= 3) {

      return `var(--${toKebab(refPath[1])}-${toKebab(refPath[2])})`;

    }

    /* Alias → Semantic */

    if (refPath[0] === GROUP_SEMANTIC) {

      return `var(--${refPath.slice(1).map(p => toKebab(p)).join("-")})`;

    }

    return resolveCSSAlias(ref, modeId, depth + 1);
  }

  return null;
}


function buildCSSMode(collection, mode, indent = 2) {

  const rampVars = {};
  const semanticVars = {};

  for (const id of collection.variableIds) {

    const v = figma.variables.getVariableById(id);
    if (!v) continue;

    const path = v.name.split("/").map(p => p.trim());
    const resolved = resolveColor(v, mode.modeId);
    if (!resolved) continue;

    /* COLOR RAMP */

    if (path[0] === GROUP_COLOR_RAMP && path.length >= 3) {

      const name = `--${toKebab(path[1])}-${toKebab(path[2])}`;
      rampVars[name] = resolved.css;

      continue;
    }

    /* SEMANTIC */

    if (path[0] === GROUP_SEMANTIC && path.length >= 3) {

      const name =
        `--${path.slice(1).map(p => toKebab(p)).join("-")}`;

      const alias = resolveCSSAlias(v, mode.modeId);

      if (alias) {
        semanticVars[name] = alias;
      } else {
        semanticVars[name] = resolved.css;
      }
    }
  }

  const pad = " ".repeat(indent);
  let output = "";

  /* COLOR RAMP */

  output += `${pad}/* Color Ramp */\n`;

  Object.keys(rampVars)
    .sort()
    .forEach(k => {
      output += `${pad}${k}: ${rampVars[k]};\n`;
    });

  /* SEMANTIC */

  output += `\n${pad}/* Semantic */\n`;

  Object.keys(semanticVars)
    .sort()
    .forEach(k => {
      output += `${pad}${k}: ${semanticVars[k]};\n`;
    });

  return output;
}


function buildCSSLight(collection, mode) {

  let output = `:root {\n\n`;

  output += buildCSSMode(collection, mode, 2);

  output += `}\n`;

  return output;
}


function buildCSSDark(collection, mode) {

  let output = `@media (prefers-color-scheme: dark) {\n`;
  output += `  :root {\n\n`;

  output += buildCSSMode(collection, mode, 4);

  output += `  }\n`;
  output += `}\n`;

  return output;
}

/* =============================
   MESSAGE HANDLER
============================= */

figma.ui.onmessage = msg => {

  const colors = collections.find(c => c.name === COLLECTION_NAME);
  if (!colors) return;

  const light = colors.modes.find(m =>
    m.name.toLowerCase().includes("light")
  );

  const dark = colors.modes.find(m =>
    m.name.toLowerCase().includes("dark")
  );

  let result = {
    light: "",
    dark: ""
  };

  switch (msg.type) {

    case "mobile":

      if (light) {
        result.light =
          `import 'package:flutter/material.dart';\n\n` +
          buildDart(colors, light);
      }

      if (dark) {
        result.dark =
          `import 'package:flutter/material.dart';\n\n` +
          buildDart(colors, dark);
      }

      break;

    case "web":

      if (light) {
        result.light = buildCSSLight(colors, light);
      }

      if (dark) {
        result.dark = buildCSSDark(colors, dark);
      }

    break;
  }

  figma.ui.postMessage(result);

};