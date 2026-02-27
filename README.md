# Color System - Mevivu
# Figma Color Token Exporter

## Overview

**Figma Color Token Exporter** is a Figma plugin that converts local
Color Variables into structured design tokens for Web (CSS) and Flutter
(Mobile).

The plugin preserves:

-   Color opacity (alpha values)
-   Variable alias references
-   Semantic token hierarchy
-   Light and Dark mode separation

It enables teams to maintain a single source of truth in Figma and
export consistent, platform-ready tokens without manual rewriting.

------------------------------------------------------------------------

## Features

### 1. Local Variable Collection Support

The plugin scans a selected Figma Variable Collection (e.g., `Colors`)
and processes:

-   Primitive tokens (`ColorRamp`)
-   Semantic tokens (`Background`, `Text`, `Icon`, `Border`, etc.)
-   Variable aliases (references to other variables)
-   Multiple modes (Light / Dark)

------------------------------------------------------------------------

### 2. Alias Preservation

If a semantic token references another token, the plugin keeps that
reference instead of flattening it.

Example in Figma:

Semantic/Background/DialogAlert/Default\
→ references\
Semantic/Background/Default/Primary

Exported CSS:

``` css
--background-dialog-alert-default: var(--background-default-primary);
```

Exported Flutter:

``` dart
static const Color default = Background.Default.Primary;
```

------------------------------------------------------------------------

### 3. Correct Alpha Handling

Figma stores alpha separately from RGB. The plugin converts formats
correctly:

  Platform   Format
  ---------- ------------
  CSS        #RRGGBBAA
  Flutter    0xAARRGGBB

Example:

Black at 10% opacity

CSS:

``` css
#0000001A
```

Flutter:

``` dart
Color(0x1A000000)
```

------------------------------------------------------------------------

### 4. Light and Dark Mode Export

If your collection includes Light and Dark modes, the plugin generates:

CSS:

``` css
:root { ... }

@media (prefers-color-scheme: dark) {
  :root { ... }
}
```

Flutter:

``` dart
final lightTheme = ...
final darkTheme = ...
```

------------------------------------------------------------------------

## Expected Figma Structure

Variables should follow a structured naming pattern:

ColorRamp/Black/100\
ColorRamp/White/1000

Semantic/Background/Default/Primary\
Semantic/Text/Brand/Primary\
Semantic/Icon/Error/Primary

Required top-level groups:

-   ColorRamp
-   Semantic

This structure supports unlimited nesting depth under Semantic.

------------------------------------------------------------------------

## How to Use

### Step 1 --- Prepare Variables

1.  Open you Figma file
2.  Open **Assets → Variables**
3.  Create a collection (e.g., `Colors`)
4.  Add primitive colors under `ColorRamp`
5.  Add semantic tokens under `Semantic`
6.  Configure Light and Dark modes if needed

------------------------------------------------------------------------

### Step 2 --- Installation

#### Option 1 — Download ZIP from GitHub

1. Go to this repository on GitHub
2. Click the green **Code** button
3. Select **Download ZIP**
4. Extract the ZIP file to your local machine

---

### Option 2 — Clone via Git

If you use Git, run:

```bash
git clone git@github.com:phuc1903/Color-System---Mevivu.git
```

------------------------------------------------------------------------

### Step 3 --- Import and the run plugin

1.  Open you Figma file
2.  Go to Main menu -> Plugins -> Development -> Import plugin from manifest...
3.  Select manifest.js
4.  Select Plugin -> Select Plugin
5.  Select export type:
    -   Mobile (Flutter)
    -   Web (CSS)
6.  Copy the generated output

------------------------------------------------------------------------

### Step 4 --- Integrate Into Your Project

For Web:

Create `tokens.css` and paste the output.

For Flutter:

Create `app_theme.dart` and integrate into your `ThemeData`.

------------------------------------------------------------------------

## Limitations

-   Only processes local variables (not remote library variables)
-   Designed specifically for color tokens
-   Requires structured naming convention

------------------------------------------------------------------------

## Recommended Workflow

1.  Maintain all tokens in Figma Variables
2.  Use alias references instead of duplicating values
3.  Export tokens after design updates
4.  Keep generated files under version control

------------------------------------------------------------------------

## Future Improvements

-   JSON export support
-   Multi-brand support
-   Full Flutter ThemeExtension architecture export
-   Remote library variable support
