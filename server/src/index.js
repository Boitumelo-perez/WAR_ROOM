
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

  return Array.from(
    values,
    value => chars[value % chars.length]
  ).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/health") {
      return json({
        service: "WAR ROOM",
        status: "online"
      });
    }

    // Create a room
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const code = createRoomCode();
      const id = env.ROOMS.idFromName(code);
      const room = env.ROOMS.get(id);

      const response = await room.fetch(
        "https://room.internal/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        }
      );

      if (!response.ok) {
        return json({ error: "Could not create room." }, 500);
      }

      return json({
        code,
        message: "Room created successfully."
      }, 201);
    }

    // Connect to a room
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

    // Initialise room
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
    const state = await this.ctx.storage.get("state");

    if (!state) {
      return new Response("Room does not exist", { status: 404 });
    }

    const name = (
      url.searchParams.get("name") || "Guest"
    ).trim().slice(0, 30) || "Guest";

    const requestedRole = url.searchParams.get("role") || "player";
    const suppliedToken = url.searchParams.get("token");

    let side = "spectator";
    let token = null;

    if (requestedRole !== "spectator") {
      // Reconnect using an existing player token
      if (suppliedToken) {
        if (state.players.white?.token === suppliedToken) {
          side = "white";
          token = suppliedToken;
        } else if (state.players.black?.token === suppliedToken) {
          side = "black";
          token = suppliedToken;
        }
      } else {
        // Assign an available player seat
        if (!state.players.white) {
          side = "white";
        } else if (!state.players.black) {
          side = "black";
        }

        if (side !== "spectator") {
          token = crypto.randomUUID();
        }
      }
    }

    const connectionId = crypto.randomUUID();

    if (side === "white" || side === "black") {
      state.players[side] = {
        name,
        token,
        connectionId,
        connected: true
      };

      if (state.players.white && state.players.black) {
        state.status = "playing";
      }

      await this.ctx.storage.put("state", state);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      side,
      token,
      connectionId
    });

    // Send the current game state immediately to this connection
    server.send(JSON.stringify({
      type: "welcome",
      side,
      token,
      state: this.publicState(state)
    }));

    // Notify everyone when a player joins or reconnects
    if (side !== "spectator") {
      this.broadcast({
        type: "state",
        state: this.publicState(state)
      });
    }

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
      this.sendError(socket, "Invalid message format.");
      return;
    }

    const attachment = socket.deserializeAttachment() || {};
    const { side, token, connectionId } = attachment;

    // Spectators cannot change the game
    if (side !== "white" && side !== "black") {
      this.sendError(socket, "Spectators cannot perform game actions.");
      return;
    }

    const state = await this.ctx.storage.get("state");

    if (!state) {
      this.sendError(socket, "Room no longer exists.");
      return;
    }

    // Reject messages from replaced or disconnected connections
    const player = state.players[side];

    if (
      !player ||
      player.token !== token ||
      player.connectionId !== connectionId
    ) {
      this.sendError(socket, "This connection is no longer active.");
      return;
    }

    if (state.status !== "playing") {
      this.sendError(socket, "The game is not currently active.");
      return;
    }

    const chess = new Chess(state.fen);

    // Handle legal chess moves
    if (data.type === "move") {
      if (chess.turn() !== (side === "white" ? "w" : "b")) {
        this.sendError(socket, "It is not your turn.");
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
        this.sendError(socket, "Illegal chess move.");
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

    // Resignation
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

      return;
    }

    this.sendError(socket, "Unknown game action.");
  }

  async webSocketClose(socket) {
    await this.disconnect(socket);
  }

  async webSocketError(socket) {
    await this.disconnect(socket);
  }

  async disconnect(socket) {
    const attachment = socket.deserializeAttachment() || {};
    const { side, token, connectionId } = attachment;

    if (side !== "white" && side !== "black") return;

    const state = await this.ctx.storage.get("state");

    if (!state?.players[side]) return;

    const player = state.players[side];

    // An old connection must never disconnect a newer connection
    if (
      player.token !== token ||
      player.connectionId !== connectionId
    ) {
      return;
    }

    player.connected = false;
    player.connectionId = null;

    await this.ctx.storage.put("state", state);

    this.broadcast({
      type: "state",
      state: this.publicState(state)
    });
  }

  sendError(socket, message) {
    try {
      socket.send(JSON.stringify({
        type: "error",
        message
      }));
    } catch {
      // Connection may already be closed
    }
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

  broadcast(message) {
    const payload = JSON.stringify(message);

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Ignore disconnected sockets
      }
    }
  }
}
