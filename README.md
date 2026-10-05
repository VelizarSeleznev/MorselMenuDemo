# Morsel — interactive restaurant menu

Tablet-first restaurant menu with rotatable 3D food models, portion selection, an order basket, and an optional voice companion. English, Danish and Russian interface. Built with React, TypeScript, Tailwind, Vinext/Vite and a Cloudflare Workers server.

## Run locally

Use Node.js 22.13 or newer (Node.js 24+ recommended).

```sh
git clone https://github.com/VelizarSeleznev/MorselMenuDemo.git
cd MorselMenuDemo
npm ci
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 3000
```

Open http://localhost:3000. Browsing, 3D models, portions and the basket work without API keys.

For the voice companion, put your own `GEMINI_API_KEY` and/or `OPENAI_API_KEY` in `.env`, then restart the server. Choose the provider in the companion settings. Keys stay on the server; no owner's credentials are included. Voice availability depends on the selected model and your provider account. Microphone access requires localhost or HTTPS.

## Project map

- `app/page.tsx` — menu, dish details and basket.
- `components/voice-assistant.tsx` — companion UI.
- `components/food-model.tsx` — interactive 3D viewer.
- `lib/menu.ts` — dishes, portions and prices.
- `lib/translations.json` — interface translations.
- `app/api/voice/session/route.ts` — short-lived provider session credentials.
- `scripts/create-food-models.mjs` — original procedural food models.

## Validate and build

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.ts
npm run build
npm run start
```

`npm run start` previews the production Cloudflare Worker locally. The voice endpoint currently permits localhost development or the original private Sites authenticated-user header. If you host this yourself, add appropriate authentication and spending limits before exposing the voice endpoint. The visual menu does not require that authentication.

This is a demo with fictional recipes, allergens and DKK prices; orders are not sent to a kitchen and no payments are processed. Voice edits can misunderstand speech. Physical iPad microphone and noisy-room performance have not been verified.

## Assets

Current portion-specific food models under `public/models/morsel/` are original procedural geometry. Older retained models are from the Kenney Food Kit (CC0); see `public/models/LICENSE.txt` and https://kenney.nl/assets/food-kit.

This repository is a clean source snapshot of the local Morsel demo (source revision `45f4338`). Personal deployment metadata and internal working notes are excluded.
