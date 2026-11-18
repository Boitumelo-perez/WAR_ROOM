# WAR ROOM — It's Chess.

A 3D chess game built with HTML, CSS, vanilla JavaScript, Three.js and chess.js. Play a local two-player match, or run the development server for room-based multiplayer.

## Run locally

### Local practice (frontend only)

**Requirements:** Node.js (LTS) and npm, plus an internet connection to load Three.js and chess.js from jsDelivr.

1. From the repository root, start a static web server:

   ```bash
   npx serve .
   ```

2. Open the local URL printed by the command (usually <http://localhost:3000>).
3. Play local two-player chess in the browser. Do not open `index.html` directly with `file://`; the app uses JavaScript modules and needs to be served over HTTP.

No frontend `npm install` is needed.

### Room multiplayer (development)

The multiplayer backend is a separate Cloudflare Workers app. Run the frontend and backend in separate terminals:

1. In the first terminal, from the repository root, start the frontend as described above.
2. In the second terminal, install and start the backend:

   ```bash
   cd server
   npm install
   npm run dev
   ```

3. Wait for Wrangler to report that the local backend is listening (normally at <http://localhost:8787>), then use **Create Room**, **Join Room**, or **Watch as Spectator** in the frontend.

The current frontend connects to the backend at `localhost:8787`, so room multiplayer works locally with this setup. To use a deployed backend, update the API and WebSocket URLs in `js/main.js` to its address and deploy the `server` app separately. GitHub Pages can host the static frontend, but it does not run the multiplayer backend.

## Included

- Procedural 3D chess pieces and board
- Legal move validation through chess.js
- Castling, en passant, promotion and check/checkmate/draw handling
- Select a piece to show legal destinations
- Undo and restart
- OrbitControls: drag to rotate, scroll to zoom
- Preset camera views and responsive dark-and-gold interface
- Development multiplayer server for rooms, players and spectators
