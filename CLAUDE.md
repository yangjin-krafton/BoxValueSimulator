# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This project is currently in the **design/specification phase**. The README.md is the authoritative design document (written in Korean). No source code exists yet.

## Planned Tech Stack

- **Renderer**: PixiJS (2D rendering; 3D models used as pre-rendered sprites, not real-time 3D)
- **Language**: TypeScript
- **Bundler**: Vite
- **State**: Simple game state manager or Zustand-style structure
- **Asset pipeline**: Blender → sprite sheets → PixiJS
- **Shaders**: PixiJS Filter / custom GLSL for condition-state variations
- **Audio**: Howler.js or WebAudio
- **Data**: JSON-based product/box tables
- **Deployment**: Static page (GitHub Pages) — no server, ships the Vite build output directly

## Expected Commands (once scaffolded)

```bash
npm install            # Install dependencies
npm run dev            # Dev server (Vite)
npx vite build         # Production build
python tools/trim_resize_sprites.py   # Sprite preprocessing
```

## Game Architecture Overview

### Core Loop
Buy box → open → get random product → grade determined → sell → reinvest (or work minigame if bankrupt)

### Key Systems

**Box System**: Boxes come in sets of 10. The total value of all 10 is pre-seeded first, then distributed asymmetrically across individual boxes. This creates the risk/reward tension — expensive boxes can be duds, cheap boxes can be jackpots.

**Product + Condition System**: Products have a base value and a condition grade (C / B / A / S / SS / SSS). Grade is not pure random — each product category has its own probability distribution. Grade multipliers: C×0.4, B×0.7, A×1.0, S×1.4, SS×2.0, SSS×3.5. Visual state is expressed via PixiJS shader filters (scratches, dust, discoloration, gloss).

**Pricing Formula**:
```
Sale price = Base Value × Condition Multiplier × Rarity Multiplier × Market Adjustment
```

**Economy Balance**: Target return rate per box is 0.82–0.95 (slight long-term loss). If player goes bankrupt, work minigames (packing, labeling, sorting) provide recovery funds.

### Intended Architecture Layers

```
UI (PixiJS)       — BoxSelectionScreen, UnboxingAnimation, GradeDisplay, SaleUI, MinigameUI
Game Logic        — BoxGenerator (set value distribution), ProductRNG, PricingCalculator, GameStateManager
Asset Layer       — Sprite sheets from Blender renders, shader-based condition variants
Data Layer        — JSON tables for products and boxes
```

### Math Model Notes
- 10-box set total value range: 180,000–320,000 KRW, asymmetrically distributed
- Low-value products weight toward B/A grades; premium products span C–SSS; rare items skew toward upper grades
- Bankruptcy is recoverable via minigame income; no permanent game over
