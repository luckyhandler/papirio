# Papierfisch Architecture

Papierfisch is a no-build browser Canvas game.

## Dependency Flow

`Presentation / Infrastructure` → `Application / Game Coordinator` → `Domain`

- **Domain**: Pure logic. Zero imports from browser APIs or persistence layers.
- **Application**: Orchestrates domain logic and manages session state.
- **Infrastructure/Presentation**: Handles side effects such as DOM, local storage, and Canvas.
- **Configuration**: Immutable data only; may be imported by any layer.

## Current Project Structure

- `index.html` / `style.css`: Composition and global styles.
- `game.js`: Temporary application coordinator; contains the legacy renderer and gameplay loop.
- `bot.js`: Bot policy in its legacy location.
- `src/config/game-config.js`: Immutable tuning and constants.
- `src/domain/entity.js`: Shared entity state and behavior.
- `src/domain/player.js`: Player specialization.
- `src/domain/geometry.js`: Pure arena and spatial rules.
- `src/domain/grid-search.js`: Pure nearest-cell search used by bot policy.
- `src/infrastructure/progress-store.js`: Injected persistence adapter.
- `src/presentation/leaderboard.js`: Safe DOM construction and rendering.
- `src/presentation/escape-html.js`: Escaping at the remaining trusted-markup boundary.

## State Ownership

- **GameEngine** owns the active game session, grid, and entity collection.
- **Entities** own only their internal state.
- **ProgressStore** owns serialization logic; it does not influence gameplay.
- **UI** reads state snapshots and emits intents; it does not mutate game state directly.
- There is no module-level mutable state.

## Development Rules

- Implement pure domain rules before integrating them with the browser.
- Inject browser APIs into services instead of importing them globally.
- Keep DOM logic in `presentation/` and persistence in `infrastructure/`.
- Keep orchestration in the application coordinator, but move reusable rules into the domain.
- Give each module one responsibility and use named exports.
- Do not use query-string cache versions on internal imports.
- Render user-generated data with `textContent`.
- Validate external and persisted input.
- Add no dependency or build tool unless its value is justified.

## Migration Roadmap

1. Extract `Particle` and the Canvas renderer from `game.js`.
2. Extract `InputController` and `LobbyView`.
3. Extract `Grid`, `TerritoryService`, and session-update rules.
4. Move `Bot` under `src/domain` or `src/application`, depending on whether its AI remains pure, and reduce `game.js` to bootstrap only.

## Definition of Done

- [ ] Behavior is preserved across all game modes.
- [ ] Module boundaries are respected and there are no circular dependencies.
- [ ] Node syntax checks and pure-domain tests pass.
- [ ] Lobby, Classic, World, input, HUD, and game-over flows pass a browser smoke test.
- [ ] There is no unsanitized dynamic `innerHTML`.
- [ ] Architecture documentation is updated.

## Current Limitations

- `LEVELS`, `Particle`, and the renderer/input/game loop remain in `game.js`; the level extraction was rejected during local-worker review.
- `bot.js` duplicates some entity initialization. Reconcile this during the roadmap migration rather than through a broad rewrite.
