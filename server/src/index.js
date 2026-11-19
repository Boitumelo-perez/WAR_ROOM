
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

const ONLINE_CLOCK_MS = 5 * 60 * 1000;

function createOnlineClock() {
  return {
    whiteMs: ONLINE_CLOCK_MS,
    blackMs: ONLINE_CLOCK_MS,
    activeSide: null,
    startedAt: null
  };
}

function ensureRoomFeatures(state) {
  if (!state.clock) state.clock = createOnlineClock();
  if (typeof state.paused !== "boolean") state.paused = false;
  if (!state.resumeVotes) state.resumeVotes = { white: false, black: false };
  if (!("pausedBy" in state)) state.pausedBy = null;
  if (!("undoAvailableTo" in state)) state.undoAvailableTo = null;
  if (!("undoClockSnapshot" in state)) state.undoClockSnapshot = null;
  if (!("resetRequest" in state)) state.resetRequest = null;
}

function settleOnlineClock(state, now = Date.now()) {
  const clock = state.clock;
  const activeSide = clock.activeSide;

  if (state.paused || !activeSide || clock.startedAt === null) return false;

  const remainingKey = activeSide === "white" ? "whiteMs" : "blackMs";
  clock[remainingKey] = Math.max(
    0,
    clock[remainingKey] - Math.max(0, now - clock.startedAt)
  );
  clock.startedAt = now;

  if (clock[remainingKey] > 0) return false;

  state.status = "finished";
  state.result = activeSide === "white"
    ? "Black wins on time"
    : "White wins on time";
  clock.activeSide = null;
  clock.startedAt = null;
  state.undoAvailableTo = null;
  return true;
}

function onlineClockSnapshot(state, now = Date.now()) {
  const clock = state.clock;
  let whiteMs = clock.whiteMs;
  let blackMs = clock.blackMs;

  if (!state.paused && clock.activeSide && clock.startedAt !== null) {
    const elapsed = Math.max(0, now - clock.startedAt);
    if (clock.activeSide === "white") {
      whiteMs = Math.max(0, whiteMs - elapsed);
    } else {
      blackMs = Math.max(0, blackMs - elapsed);
    }
  }

  return {
    whiteMs,
    blackMs,
    activeSide: clock.activeSide,
    paused: state.paused
  };
}

function resetRoomMatch(state) {
  state.fen = new Chess().fen();
  state.history = [];
  state.status = state.players.white && state.players.black
    ? "playing"
    : "waiting";
  state.result = null;
  state.clock = createOnlineClock();
  state.paused = false;
  state.pausedBy = null;
  state.resumeVotes = { white: false, black: false };
  state.undoAvailableTo = null;
  state.undoClockSnapshot = null;
  state.resetRequest = null;
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
          result: null,
          clock: createOnlineClock(),
          paused: false,
          pausedBy: null,
          resumeVotes: { white: false, black: false },
          undoAvailableTo: null,
          undoClockSnapshot: null,
          resetRequest: null
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
    ensureRoomFeatures(state);

    const name = (
      url.searchParams.get("name") || "Guest"
    ).trim().slice(0, 30) || "Guest";

    const requestedRole = url.searchParams.get("role") || "player";
    const requestedSide =
      requestedRole === "white" || requestedRole === "black"
        ? requestedRole
        : null;
    const requestedRejoin = requestedRole === "rejoin";
    const suppliedToken = url.searchParams.get("token");

    let side = "spectator";
    let token = null;
    let joinError = null;

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
      }

      if (side === "spectator") {
        if (requestedSide) {
          if (!state.players[requestedSide]) {
            side = requestedSide;
          } else {
            const label = requestedSide === "white" ? "White" : "Black";
            joinError =
              `${label} is already occupied. Rejoin with the saved player session or choose the other side.`;
          }
        } else if (requestedRejoin) {
          joinError = suppliedToken
            ? "The saved player seat could not be restored. Choose an available side or watch the match."
            : "No saved player seat was found for this room. Choose a side or watch the match.";
        } else if (!suppliedToken) {
          // Legacy clients without a side selection use the first open seat.
          if (!state.players.white) {
            side = "white";
          } else if (!state.players.black) {
            side = "black";
          }
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

      if (
        state.players.white &&
        state.players.black &&
        state.status === "waiting"
      ) {
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

    if (joinError) {
      server.send(JSON.stringify({
        type: "join-error",
        message: joinError
      }));
      server.close(1000, "Player seat unavailable");

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

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

  async persistAndBroadcast(state) {
    await this.ctx.storage.put("state", state);
    await this.updateClockAlarm(state);
    this.broadcast({
      type: "state",
      state: this.publicState(state)
    });
  }

  async updateClockAlarm(state) {
    const clock = state.clock;
    if (
      state.status === "playing" &&
      !state.paused &&
      clock.activeSide &&
      clock.startedAt !== null
    ) {
      const remaining = clock[clock.activeSide === "white" ? "whiteMs" : "blackMs"];
      await this.ctx.storage.setAlarm(Date.now() + Math.max(1, remaining));
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  async webSocketMessage(socket, message) {
    let data;

    try {
      data = JSON.parse(message);
    } catch {
      this.sendError(socket, "Invalid message format.");
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      this.sendError(socket, "Invalid message format.");
      return;
    }

    const attachment = socket.deserializeAttachment() || {};
    const { side, token, connectionId } = attachment;

    if (side !== "white" && side !== "black") {
      this.sendError(socket, "Spectators cannot perform game actions.");
      return;
    }

    const state = await this.ctx.storage.get("state");
    if (!state) {
      this.sendError(socket, "Room no longer exists.");
      return;
    }
    ensureRoomFeatures(state);

    const player = state.players[side];
    if (
      !player ||
      player.token !== token ||
      player.connectionId !== connectionId
    ) {
      this.sendError(socket, "This connection is no longer active.");
      return;
    }

    const now = Date.now();
    if (settleOnlineClock(state, now)) {
      await this.persistAndBroadcast(state);
      return;
    }

    if (
      state.resetRequest &&
      !["reset-response", "reset-cancel"].includes(data.type)
    ) {
      this.sendError(socket, "Resolve the reset request before continuing.");
      return;
    }

    if (data.type === "pause") {
      if (state.status !== "playing" || state.paused) {
        this.sendError(socket, "The match cannot be paused right now.");
        return;
      }

      state.paused = true;
      state.pausedBy = side;
      state.resumeVotes = { white: false, black: false };
      state.clock.startedAt = null;
      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "resume-vote") {
      if (!state.paused) {
        this.sendError(socket, "The match is not paused.");
        return;
      }

      state.resumeVotes[side] = !state.resumeVotes[side];
      if (state.resumeVotes.white && state.resumeVotes.black) {
        state.paused = false;
        state.pausedBy = null;
        state.resumeVotes = { white: false, black: false };
        if (state.clock.activeSide && state.status === "playing") {
          state.clock.startedAt = now;
        }
      }

      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "reset-request") {
      if (
        state.paused ||
        !["playing", "finished"].includes(state.status) ||
        state.resetRequest
      ) {
        this.sendError(socket, "A match reset cannot be requested right now.");
        return;
      }

      state.resetRequest = {
        requestedBy: side,
        approvedBy: {
          white: side === "white",
          black: side === "black"
        }
      };
      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "reset-response") {
      const request = state.resetRequest;
      if (!request || request.requestedBy === side) {
        this.sendError(socket, "There is no reset request for you to answer.");
        return;
      }

      if (data.approve !== true) {
        state.resetRequest = null;
      } else {
        request.approvedBy[side] = true;
        if (request.approvedBy.white && request.approvedBy.black) {
          resetRoomMatch(state);
        }
      }

      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "reset-cancel") {
      if (!state.resetRequest || state.resetRequest.requestedBy !== side) {
        this.sendError(socket, "You cannot cancel this reset request.");
        return;
      }

      state.resetRequest = null;
      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "undo") {
      if (state.paused || state.undoAvailableTo !== side || !state.history.length) {
        this.sendError(socket, "Undo is no longer available for that move.");
        return;
      }

      const previousHistory = state.history.slice(0, -1);
      const restoredGame = new Chess();
      try {
        for (const move of previousHistory) {
          restoredGame.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined
          });
        }
      } catch {
        this.sendError(socket, "The previous position could not be restored.");
        return;
      }

      state.fen = restoredGame.fen();
      state.history = previousHistory;
      state.status = "playing";
      state.result = null;
      if (state.undoClockSnapshot) {
        state.clock.whiteMs = state.undoClockSnapshot.whiteMs;
        state.clock.blackMs = state.undoClockSnapshot.blackMs;
      }
      state.clock.activeSide = side;
      state.clock.startedAt = now;
      state.undoAvailableTo = null;
      state.undoClockSnapshot = null;
      await this.persistAndBroadcast(state);
      return;
    }

    if (state.paused || state.status !== "playing") {
      this.sendError(socket, "The game is not currently active.");
      return;
    }

    const chess = new Chess(state.fen);

    if (data.type === "select") {
      if (chess.turn() !== (side === "white" ? "w" : "b")) {
        this.sendError(socket, "It is not your turn.");
        return;
      }

      if (typeof data.square !== "string" || !/^[a-h][1-8]$/.test(data.square)) {
        this.sendError(socket, "Select a valid board square.");
        return;
      }

      const piece = chess.get(data.square);
      if (!piece || piece.color !== (side === "white" ? "w" : "b")) {
        this.sendError(socket, "Select one of your own pieces.");
        return;
      }

      if (state.undoAvailableTo) {
        state.undoAvailableTo = null;
        state.undoClockSnapshot = null;
      }
      await this.persistAndBroadcast(state);
      return;
    }

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

      state.undoAvailableTo = side;
      state.undoClockSnapshot = {
        whiteMs: state.clock.whiteMs,
        blackMs: state.clock.blackMs
      };

      if (chess.isGameOver()) {
        state.status = "finished";
        state.clock.activeSide = null;
        state.clock.startedAt = null;

        if (chess.isCheckmate()) {
          state.result = side === "white"
            ? "White wins by checkmate"
            : "Black wins by checkmate";
        } else if (chess.isDraw()) {
          state.result = "Draw";
        } else {
          state.result = "Game over";
        }
      } else {
        state.clock.activeSide = chess.turn() === "w" ? "white" : "black";
        state.clock.startedAt = now;
      }

      await this.persistAndBroadcast(state);
      return;
    }

    if (data.type === "resign") {
      state.status = "finished";
      state.result = side === "white"
        ? "Black wins — White resigned"
        : "White wins — Black resigned";
      state.clock.activeSide = null;
      state.clock.startedAt = null;
      state.undoAvailableTo = null;
      await this.persistAndBroadcast(state);
      return;
    }

    this.sendError(socket, "Unknown game action.");
  }

  async alarm() {
    const state = await this.ctx.storage.get("state");
    if (!state) return;
    ensureRoomFeatures(state);

    if (settleOnlineClock(state)) {
      await this.persistAndBroadcast(state);
      return;
    }

    await this.ctx.storage.put("state", state);
    await this.updateClockAlarm(state);
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
  ensureRoomFeatures(state);
  const sockets = this.ctx.getWebSockets();

  const spectatorCount = sockets.filter(socket => {
    const attachment = socket.deserializeAttachment() || {};
    return attachment.side === "spectator";
  }).length;

  return {
    code: state.code,
    fen: state.fen,
    history: state.history,
    status: state.status,
    result: state.result,
    clock: onlineClockSnapshot(state),
    paused: state.paused,
    pausedBy: state.pausedBy,
    resumeVotes: state.resumeVotes,
    undoAvailableTo: state.undoAvailableTo,
    resetRequest: state.resetRequest,

    spectatorCount,

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
