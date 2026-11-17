
import { Chess } from "chess.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);

  return Array.from(values, value => chars[value % chars.length]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/api/health") {
      return json({
        service: "WAR ROOM",
        status: "online"
      });
    }

    // Create a new room
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = createRoomCode();
      const id = env.ROOMS.idFromName(code);
      const room = env.ROOMS.get(id);

      const initResponse = await room.fetch(
        "https://room.internal/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        }
      );

      if (!initResponse.ok) {
        return json({ error: "Could not create room." }, 500);
      }

      return json({
        code,
        message: "Room created. Connect to join as the first player."
      }, 201);
    }

    // Connect to an existing room
    const match = url.pathname.match(
      /^\/api\/rooms\/([A-Z0-9]{6})\/connect$/
    );

    if (match) {
      const code = match[1];
      const id = env.ROOMS.idFromName(code);
      const room = env.ROOMS.get(id);

      return room.fetch(request);
    }

    return json({ error: "Endpoint not found." }, 404);
  }
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Initialise room storage
    if (url.pathname === "/init" && request.method === "POST") {
      const existing = await this.ctx.storage.get("state");

      if (!existing) {
        const { code } = await request.json();

        const state = {
          code,
          fen: new Chess().fen(),
          history: [],
          players: {
            white: null,
            black: null
          },
          status: "waiting",
          result: null
        };

        await this.ctx.storage.put("state", state);
      }

      return new Response("Room ready");
    }

    // WebSocket connection
    if (url.pathname.endsWith("/connect")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket upgrade required", {
          status: 426
        });
      }

      return this.connect(request, url);
    }

    return new Response("Not found", { status: 404 });
  }

  async connect(request, url) {
    let state = await this.ctx.storage.get("state");

    if (!state) {
      return new Response("Room does not exist", { status: 404 });
    }

    const name = (url.searchParams.get("name") || "Guest").slice(0, 30);
    const requestedRole = url.searchParams.get("role") || "player";
    const suppliedToken = url.searchParams.get("token");

    let side = "spectator";
    let token = suppliedToken || null;

    if (requestedRole !== "spectator") {
      // Restore a previous player's seat
      if (token) {
        if (state.players.white?.token === token) {
          side = "white";
        } else if (state.players.black?.token === token) {
          side = "black";
        }
      }

      // Assign an available seat to a new player
      if (side === "spectator" && !token) {
        if (!state.players.white) {
          side = "white";
          token = crypto.randomUUID();
        } else if (!state.players.black) {
          side = "black";
          token = crypto.randomUUID();
        }
      }

      if (side !== "spectator") {
        state.players[side] = {
          name,
          token,
          connected: true
        };

        if (state.players.white && state.players.black) {
          state.status = "playing";
        }

        await this.ctx.storage.put("state", state);
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      side,
      token
    });

    server.send(JSON.stringify({
      type: "welcome",
      side,
      token,
      state: this.publicState(state)
    }));

    this.broadcast({
      type: "state",
      state: this.publicState(state)
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(socket, message) {
    let data;

    try {
      data = JSON.parse(message);
    } catch {
      socket.send(JSON.stringify({
        type: "error",
        message: "Invalid message format."
      }));
      return;
    }

    const attachment = socket.deserializeAttachment() || {};
    const side = attachment.side;

    if (side !== "white" && side !== "black") {
      socket.send(JSON.stringify({
        type: "error",
        message: "Spectators cannot make moves."
      }));
      return;
    }

    const state = await this.ctx.storage.get("state");

    if (!state || state.status !== "playing") {
      socket.send(JSON.stringify({
        type: "error",
        message: "The game is not currently active."
      }));
      return;
    }

    const chess = new Chess(state.fen);

    if (data.type === "move") {
      if (chess.turn() !== (side === "white" ? "w" : "b")) {
        socket.send(JSON.stringify({
          type: "error",
          message: "It is not your turn."
        }));
        return;
      }

      let move;

      try {
        move = chess.move({
          from: data.from,
          to: data.to,
          promotion: data.promotion || "q"
        });
      } catch {
        move = null;
      }

      if (!move) {
        socket.send(JSON.stringify({
          type: "error",
          message: "Illegal chess move."
        }));
        return;
      }

      state.fen = chess.fen();
      state.history.push({
        color: move.color,
        from: move.from,
        to: move.to,
        san: move.san,
        piece: move.piece,
        captured: move.captured || null,
        promotion: move.promotion || null
      });

      if (chess.isGameOver()) {
        state.status = "finished";

        if (chess.isCheckmate()) {
          state.result = side === "white"
            ? "White wins by checkmate"
            : "Black wins by checkmate";
        } else if (chess.isDraw()) {
          state.result = "Draw";
        } else {
          state.result = "Game over";
        }
      }

      await this.ctx.storage.put("state", state);

      this.broadcast({
        type: "state",
        state: this.publicState(state)
      });

      return;
    }

    if (data.type === "resign") {
      state.status = "finished";
      state.result = side === "white"
        ? "Black wins — White resigned"
        : "White wins — Black resigned";

      await this.ctx.storage.put("state", state);

      this.broadcast({
        type: "state",
        state: this.publicState(state)
      });
    }
  }

  async webSocketClose(socket) {
    await this.disconnect(socket);
  }

  async webSocketError(socket) {
    await this.disconnect(socket);
  }

  async disconnect(socket) {
    const attachment = socket.deserializeAttachment() || {};
    const side = attachment.side;

    if (side !== "white" && side !== "black") return;

    const state = await this.ctx.storage.get("state");
    if (!state?.players[side]) return;

    // Only mark disconnected if this is still the active connection
    state.players[side].connected = false;

    await this.ctx.storage.put("state", state);

    this.broadcast({
      type: "state",
      state: this.publicState(state)
    });
  }

  publicState(state) {
    return {
      code: state.code,
      fen: state.fen,
      history: state.history,
      status: state.status,
      result: state.result,
      players: {
        white: state.players.white
          ? {
              name: state.players.white.name,
              connected: state.players.white.connected
            }
          : null,
        black: state.players.black
          ? {
              name: state.players.black.name,
              connected: state.players.black.connected
            }
          : null
      }
    };
  }

  async broadcast(message) {
    const payload = JSON.stringify(message);

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A disconnected socket will be cleaned up by its close event.
      }
    }
  }
}
