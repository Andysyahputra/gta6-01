# Neon Harbor — Make GTA 6 (gta6-01)

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Andysyahputra/gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Andysyahputra/gta6-01/reward.svg)](https://make.fun/c/gta6-01)

A complete, original top-down 2D open-world crime game that runs from
static files in a desktop browser — no build step, no network, no
Rockstar content. Built for the [make.fun GTA 6 competition](https://make.fun/c/gta6-01).

## The game

**Neon Harbor** is a fictional sun-soaked coastal city at golden hour.
You are **Rex Marlowe**, a newcomer with nothing but a duffel bag.
Fixer **Vera Kline** gives you work — and the Harbor PD gives you heat.

- **Open city** — a seeded 2400×1800 grid city: downtown towers, market
  square, Palm Park, harbor docks and a beach hotel, all drawn top-down.
- **On foot and by car** — walk, run, punch, shoot; steal any parked or
  traffic car (occupied steals raise your wanted level) and drive with
  momentum, steering and collisions.
- **Traffic and pedestrians** — traffic drives the grid and stops at
  intersections; pedestrians stroll the sidewalks and flee from fast
  cars, gunfire and wanted heat.
- **Wanted level and police** — 0–5 stars. Patrol cars chase and ram,
  officers bail out on foot (touch = busted), roadblocks at 3+ stars,
  and the **AIR-1 police helicopter** circles overhead with a spotlight.
  Lay low, hide at the safehouse or pay the Cleaner to cool off.
- **7 story missions from Vera** — steal a first car, run a package
  through a police chase, lift a Sunset Coupe, lose a 3-star tail, beat
  a taxi clock, stop a getaway driver, and pull The Big Score at Harbor
  Bank. Finish the chain to become Neon Harbor King, then keep earning
  $150 per car delivered to the garage in free roam.
- **Combat and progression** — pistol (from Mission 2, 12 rounds,
  refill at Harbor Arms), health that regenerates out of combat, cash,
  and automatic localStorage saves.
- **HUD and minimap** — cash, health, ammo, wanted stars, clock, mission
  objective, and a live minimap with the mission marker, police dots and
  the helicopter.
- **Sound** — everything synthesized with the Web Audio API: engine hum,
  siren wail, gunshots, payout chime and an original bass-and-hat groove.
  Mute with the `0` key or the on-screen button.

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

Controls: **WASD / arrows** walk or drive (Shift to run), **E** steal /
enter / exit a car, **F** punch, **Space / click** fire the pistol,
**Esc** pause, **0** mute.

## Layout

```
game/index.html        entry point (loads the scripts below)
game/src/config.js     tuning, palette, car models, missions, landmarks
game/src/rng.js        seeded RNG (deterministic city and traffic)
game/src/world.js      city layout, roads, buildings, harbor, collision
game/src/input.js      keyboard + mouse, ?shot= states
game/src/player.js     Rex on foot: move, punch, shoot, steal
game/src/cars.js       car physics, collisions, parked cars
game/src/traffic.js    traffic cars and pedestrians
game/src/police.js     wanted system, patrol cars, officers, helicopter
game/src/missions.js   Vera's 7-mission chain + free-roam deliveries
game/src/hud.js        HUD, minimap, start/pause/wasted/busted screens
game/src/audio.js      synthesized Web Audio sound and music
game/src/main.js       game loop, camera, save/load, screenshot states
main.ts                entrypoint: copies game/ + screenshots/ to /output
screenshots/           4 real renders of the game (cover: police chase)
```

## Screenshots

1. `1-chase.jpg` — 3-star police chase with the helicopter, wanted stars,
   minimap and mission objective on screen.
2. `2-drive.jpg` — driving a stolen Comet GT through downtown.
3. `3-mission.jpg` — The Big Score: the bank holdout.
4. `4-start.jpg` — the start screen over the city.

## License

MIT — see [LICENSE](LICENSE).
