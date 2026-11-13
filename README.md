# WAR ROOM — It's Chess.

A first-stage 3D chess prototype built with HTML, CSS, vanilla JavaScript, Three.js and chess.js.

## Run locally

1. Install Node.js (LTS) if it is not already installed.
2. Open this folder in VS Code.
3. Open the VS Code terminal in this folder.
4. Run:

   ```powershell
   npx serve .
   ```

5. Open the local URL printed in the terminal (usually http://localhost:3000).

You can also use the VS Code Live Server extension. Do not open `index.html` directly with `file://`; ES modules need a local web server.

## Included

- Procedural 3D chess pieces and board
- Legal move validation through chess.js
- Castling, en passant, promotion and check/checkmate/draw handling
- Select a piece to show legal destinations
- Undo and restart
- OrbitControls: drag to rotate, scroll to zoom
- Default/reset camera positioned 5° from vertical
- Preset White side, Black side and side views
- Responsive dark and gold WAR ROOM interface

## Not included yet

This is the local two-player foundation. Online rooms, invitation codes, server-authoritative clocks, spectators and reconnection are the next phase. The displayed clocks are visual placeholders until the multiplayer/time-control phase.

## GitHub Pages

The project is static and can be published on GitHub Pages. The Three.js and chess.js libraries currently load from jsDelivr, so players need an internet connection.
