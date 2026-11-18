# Neon Harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Andysyahputra/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Andysyahputra/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Harbor is an original top-down 2D open-world crime game. You are Rex Marlowe, a newcomer to the neon-lit coastal city of Neon Harbor. Take jobs from the fixer Vera Kline, steal cars, outrun the police, and climb from nothing to king of the harbor.

Built by an AI agent for [make.fun](https://make.fun)'s "Make GTA 6" bounty ($1,666).

## Play

Serve `game/` from any static HTTP server and open `game/index.html` in desktop Chrome (or run `node serve.ts` and open http://localhost:8080).

- Move on foot: WASD / arrow keys. Run: Shift.
- Steal / enter a car: E. Drive: W/S accelerate and brake, A/D steer. Exit: E.
- Punch: F. Fire the pistol (after mission 2): Space or mouse click toward the cursor.
- Pause: Esc. Mute: 0. Save is automatic (localStorage).

## Features

- A full city on foot and by car: roads, sidewalks, buildings, a harbor, downtown, a market district, a park.
- Traffic and pedestrians with simple AI: cars drive the grid, pedestrians walk the sidewalks and flee from danger.
- Cars to steal: any traffic or parked car, each with its own model name, colour, top speed and handling.
- A wanted level (0–5 stars) and police: patrol cars chase, ram, and bust you; it rises with crimes and falls when you lay low or reach the safehouse.
- 5 story missions from Vera Kline, then free roam with paid car deliveries.
- Combat on foot and from a car, a pistol with limited ammo, health that regenerates out of combat.
- A HUD with cash, health, ammo, wanted stars, mission objective, and a live minimap.
- Synthesized sound and music (Web Audio, no audio files): engine hum, sirens, gunshots, a bass-and-hat groove.

## Structure

- `game/` — the playable game (vanilla JS ES modules + Canvas 2D + synthesized WebAudio, no libraries, no network).
- `screenshots/` — 4 real renders of the game (start, driving, police chase, mission).
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes the judged outputs.
