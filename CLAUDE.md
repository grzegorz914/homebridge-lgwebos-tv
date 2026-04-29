# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
```

There is no build step (pure ESM JavaScript), no linter configured, and no test suite. The `npm test` script just exits with an error.

## Architecture

This is a Homebridge platform plugin (`"type": "module"`, ESM throughout) that controls LG webOS TVs via the LG SSAP WebSocket protocol.

### Module roles

| File | Role |
|---|---|
| `index.js` | Registers `LgWebOsPlatform` with Homebridge; launches one `ImpulseGenerator` per device that retries `startDevice` every 120 s until it succeeds |
| `src/lgwebosdevice.js` | `LgWebOsDevice` — creates and owns all HomeKit services, wires socket events to HAP characteristic updates, and handles all `onGet`/`onSet` callbacks |
| `src/lgwebossocket.js` | `LgWebOsSocket` — WebSocket client for the SSAP protocol; handles pairing, subscriptions, polling, and emitting typed TV-state events |
| `src/impulsegenerator.js` | `ImpulseGenerator` — thin `EventEmitter` wrapper around `setInterval`; used for the startup retry loop (120 s) and the per-device heartbeat loop |
| `src/restful.js` | Optional Express HTTP server; GET routes expose TV state, POST `/` accepts `{key: value}` to forward commands |
| `src/mqtt.js` | Optional MQTT v5 client; publishes TV state, subscribes to `<prefix>/Set` for incoming commands |
| `src/wol.js` | Sends UDP WoL magic packet (5 attempts, 100 ms apart) to wake the TV |
| `src/functions.js` | Shared utilities: async file read/write, string sanitization (diacritics → ASCII), TCP ping, value scaling |
| `src/constants.js` | All SSAP `ssap://` and `luna://` API URLs, pairing manifests (`PairingOld`/`PairingNew`), `SystemApps` blocklist, picture/sound mode maps, `DiacriticsMap` |

### Startup sequence

1. `LgWebOsPlatform` fires a 120 s `ImpulseGenerator` per device.
2. On each tick, `startDevice` constructs `LgWebOsDevice`, calls `lgDevice.start()`.
3. `start()` connects the WebSocket, waits for a pairing key, reads saved state files, then calls `prepareAccessory()` to build all HAP services.
4. On success, the startup generator stops and the device's own heartbeat generator (default 5 s) takes over, calling `lgWebOsSocket.connect()` on each tick to keep the connection alive.

### Persistent state

All per-device files live in `<homebridge-storage>/lgwebosTv/` with the TV's IP address (dots removed) as a suffix:

- `key_<ip>` — pairing key (plain text)
- `devInfo_<ip>` — TV hardware info (JSON)
- `inputs_<ip>` — installed apps list (JSON)
- `channels_<ip>` — channel list (JSON)
- `inputsNames_<ip>` — user-renamed input names (JSON)
- `inputsTargetVisibility_<ip>` — hidden/shown state per input (JSON)

### webOS version gating

Feature availability is determined by `this.webOS` (a float read from the saved devInfo file):

- Picture controls (brightness, backlight, contrast, color, picture mode): requires `>= 4.0`
- Screen on/off API URL variant: `>= 4.5` uses `TurnOffScreen45`/`TurnOnScreen45`, older uses `TurnOffScreen`/`TurnOnScreen`
- Sound modes: requires `>= 6.0`
- webOS 26+: `getCurrentSWInformation` returns 401; `applySoftwareInfoFallback()` handles this case

### HomeKit service limits

- Max 85 `InputSource` services per accessory (HAP limit)
- Total services per accessory capped at 99 (sensors and buttons fill remaining slots)
- Accessories are published as **external accessories** (`api.publishExternalAccessories`), not stored in Homebridge's built-in cache

### External integrations (RESTFul / MQTT)

Both integrations share the same command surface via `setOverExternalIntegration(integration, key, value)`. Valid keys: `Power`, `App`, `Channel`, `Input`, `Volume`, `Mute`, `Brightness`, `Backlight`, `Contrast`, `Color`, `PictureMode`, `SoundMode`, `SoundOutput`, `PlayState`, `RcControl`.

MQTT topic layout: `<prefix>/Set` (subscribe for commands), `<prefix>/<statePath>` (publish for state).

### SSAP protocol notes

- Uses `ws://host:3000` (plain) or `wss://host:3001` (SSL, `sslWebSocket: true`)
- Message types: `register`, `request`, `subscribe`, `alert`, `button`
- `button` messages go over a second "specialized" WebSocket obtained via `ApiUrls.SocketUrl`
- Correlation IDs (`cid`) are tracked per subscription type (power, audio, app, etc.) so responses route correctly
- `PairingOld` (signed manifest) is used for webOS < 3; `PairingNew` (unsigned) for webOS ≥ 3
