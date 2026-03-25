# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**Active development.** Core gameplay loop (box selection → unboxing → grade → sell) is implemented. No build step — pure ES modules served directly from `src/`.

## Tech Stack

- **Renderer**: Three.js (CDN via importmap, real-time 3D, GLB via GLTFLoader)
- **Language**: Vanilla JavaScript (ES modules, no TypeScript, no bundler)
- **Deployment**: GitHub Pages — serves `src/` directory directly, zero build step
- **State**: EventBus + GameStateManager (custom)
- **3D Models**: GLB format, loaded at runtime; fallback procedural shapes when unavailable

## No Build Step

This project runs without npm, Node.js, or any bundler. Three.js is loaded from CDN via `<script type="importmap">` in `index.html`. All `.js` files use native ES module imports with explicit `.js` extensions.

To run locally: serve `src/` with any static server (e.g. `npx serve src`, `python -m http.server -d src`, or VS Code Live Server).

## Architecture

```
src/
├── index.html                   # Entry point (importmap for Three.js CDN)
├── main.js                      # Wires all modules, game loop, event handlers
├── core/
│   ├── EventBus.js              # Typed pub/sub for module communication
│   ├── GameStateManager.js      # Central state (money, phase, boxes)
│   └── AssetLoader.js           # GLB loader with caching + fallback shapes
├── systems/
│   ├── BoxGenerator.js          # 10-box set generation (Dirichlet-like distribution)
│   ├── GradeSystem.js           # Grade definitions (C~SSS), weighted random
│   └── PricingCalculator.js     # Sale price formula
├── rendering/
│   ├── SceneManager.js          # Three.js scene, camera, lights, floor, render loop
│   ├── BoxMesh.js               # Box geometry factory (cardboard texture, flaps)
│   └── ProductRenderer.js       # GLB product display with glow + reveal animation
├── scenes/
│   ├── BoxSelectionScene.js     # 10-box shelf (3+4+3 towers), hover, click
│   └── UnboxingScene.js         # Flying, physics, drag, open animation, product reveal
├── ui/
│   └── HUD.js                   # DOM-based UI (money, hints, grade popup, buttons)
├── data/
│   └── products.js              # Product definition table
└── assets/
    └── models/                  # GLB model files go here
```

### Adding GLB Models

1. Place `.glb` files in `src/assets/models/`
2. Add entries to `src/data/products.js` with `modelPath: 'assets/models/filename.glb'`
3. AssetLoader loads, caches, and auto-scales models to fit inside boxes
4. Empty modelPath → random fallback shape

### Key Design Decisions
- One file = one responsibility (LLM-friendly maintenance)
- Modules communicate via EventBus (loose coupling)
- Rendering separated from game logic
- DOM UI separated from Three.js canvas
- All imports use relative paths with `.js` extensions (native ES modules)
