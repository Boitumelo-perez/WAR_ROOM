import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Chess } from 'chess.js';

const mount = document.querySelector('#boardCanvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#11100e');

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 23;
controls.minPolarAngle = 0.02;
controls.maxPolarAngle = Math.PI * 0.48;
controls.rotateSpeed = 0.65;
const DEFAULT_CAMERA = new THREE.Vector3(0, 18, 6.823);
const BLACK_DEFAULT_CAMERA = new THREE.Vector3(0, 18, -6.823);
let defaultCamera = DEFAULT_CAMERA;
const TARGET = new THREE.Vector3(0, 0, 0);

function resetCamera(position = defaultCamera) {
  camera.position.copy(position);
  controls.target.copy(TARGET);
  controls.update();
}
resetCamera();

scene.add(new THREE.HemisphereLight(0xe9d8b7, 0x292019, 2.0));
const keyLight = new THREE.DirectionalLight(0xffe0ad, 3.0);
keyLight.position.set(-5, 12, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8; keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8; keyLight.shadow.camera.bottom = -8;
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xd28a36, 85, 24);
rimLight.position.set(5, 6, -5); scene.add(rimLight);
const fillLight = new THREE.PointLight(0xffffff, 35, 20);
fillLight.position.set(-6, 4, 4); scene.add(fillLight);

const wood = new THREE.MeshStandardMaterial({ color: '#55321e', roughness: 0.34, metalness: 0.12 });
const darkSquare = new THREE.MeshStandardMaterial({ color: '#56351f', roughness: 0.32 });
const lightSquare = new THREE.MeshStandardMaterial({ color: '#d9b47c', roughness: 0.42 });
const gold = new THREE.MeshStandardMaterial({ color: '#c18a3b', metalness: 0.72, roughness: 0.24 });
const whiteMat = new THREE.MeshStandardMaterial({ color: '#ead9b8', metalness: 0.18, roughness: 0.22 });
const blackMat = new THREE.MeshStandardMaterial({ color: '#17191d', metalness: 0.58, roughness: 0.19 });
const highlightMat = new THREE.MeshBasicMaterial({ color: '#49d17d', transparent: true, opacity: 0.42, side: THREE.DoubleSide });
const selectedMat = new THREE.MeshBasicMaterial({ color: '#e5b64d', transparent: true, opacity: 0.42, side: THREE.DoubleSide });

const boardGroup = new THREE.Group(); scene.add(boardGroup);
const base = new THREE.Mesh(new THREE.BoxGeometry(8.65, 0.38, 8.65), wood);
base.position.y = -0.24; base.castShadow = true; base.receiveShadow = true; boardGroup.add(base);
const trim = new THREE.Mesh(new THREE.BoxGeometry(8.72, 0.08, 8.72), gold);
trim.position.y = -0.02; boardGroup.add(trim);
const squares = new Map();
const squareMeshes = [];
for (let rank = 8; rank >= 1; rank--) {
  for (let file = 0; file < 8; file++) {
    const name = 'abcdefgh'[file] + rank;
    const x = file - 3.5, z = 4.5 - rank;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), (file + rank) % 2 === 0 ? lightSquare : darkSquare);
    mesh.position.set(x, 0.04, z); mesh.receiveShadow = true; mesh.userData.square = name;
    boardGroup.add(mesh); squares.set(name, mesh); squareMeshes.push(mesh);
  }
}
const border = new THREE.Mesh(new THREE.BoxGeometry(8.25, 0.12, 8.25), wood);
border.position.y = -0.02; boardGroup.add(border);
for (const mesh of squareMeshes) boardGroup.add(mesh);

const pieceGroup = new THREE.Group(); scene.add(pieceGroup);
const pieceMeshes = new Map();
const selectableOverlays = new THREE.Group(); scene.add(selectableOverlays);
let selectedSquare = null;
let legalTargets = [];
let pendingPromotion = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function lathe(profile, material, segments = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)), segments), material);
}
function addCylinder(group, radiusTop, radiusBottom, height, y, material, radial = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), material);
  mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function makePiece(type, color) {
  const group = new THREE.Group();
  const mat = color === 'w' ? whiteMat : blackMat;
  const accent = color === 'w' ? gold : new THREE.MeshStandardMaterial({ color: '#6c6d72', metalness: .8, roughness: .22 });
  const baseProfile = [[0,.06],[.29,.06],[.34,.12],[.32,.18],[.24,.23],[.22,.31],[.15,.38],[.14,.48]];
  const foot = lathe(baseProfile, mat); foot.castShadow = true; group.add(foot);
  addCylinder(group,.25,.29,.045,.16,accent);
  if (type === 'p') {
    const stem = lathe([[.13,.35],[.12,.46],[.09,.55],[.13,.61],[.16,.68],[.15,.73],[.1,.77],[0,.79]],mat);
    stem.castShadow = true; group.add(stem);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.19,24,20),mat); ball.position.y=.88; ball.castShadow=true; group.add(ball);
  } else if (type === 'r') {
    const tower = lathe([[.14,.34],[.16,.48],[.22,.55],[.22,1.05],[.27,1.1],[.29,1.18],[.23,1.22],[.22,1.3]],mat);
    tower.castShadow=true;group.add(tower);
    addCylinder(group,.29,.29,.12,1.28,accent);
    for(let i=0;i<8;i++){const b=addCylinder(group,.075,.075,.18,1.42,mat,12);const a=i*Math.PI/4;b.position.x=Math.cos(a)*.22;b.position.z=Math.sin(a)*.22;}
  } else if (type === 'n') {
    const neck=lathe([[.13,.34],[.16,.5],[.23,.62],[.24,.72],[.19,.83]],mat);neck.castShadow=true;group.add(neck);
    const shape=new THREE.Shape();shape.moveTo(-.2,0);shape.lineTo(-.19,.55);shape.lineTo(-.38,.9);shape.lineTo(-.12,.82);shape.lineTo(.02,1.03);shape.lineTo(.22,.9);shape.lineTo(.28,.65);shape.lineTo(.18,.4);shape.lineTo(.24,.12);shape.lineTo(-.2,0);
    const head=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.055,bevelThickness:.05}),mat);
    head.position.set(-.08,.63,-.11);head.rotation.y=color==='w'?0:Math.PI;head.castShadow=true;group.add(head);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,12,12),accent);eye.position.set(.05,1.42,.13);group.add(eye);
  } else if (type === 'b') {
    const stem=lathe([[.13,.34],[.16,.5],[.21,.64],[.18,.85],[.14,1.05],[.1,1.18],[0,1.34]],mat);stem.castShadow=true;group.add(stem);
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.12,24,20),mat);orb.position.y=1.22;orb.castShadow=true;group.add(orb);
    const slash=new THREE.Mesh(new THREE.BoxGeometry(.045,.34,.045),accent);slash.position.set(0,1.23,0);slash.rotation.z=.42;group.add(slash);
  } else if (type === 'q' || type === 'k') {
    const stem=lathe([[.13,.34],[.16,.5],[.22,.62],[.23,.82],[.18,1.02],[.13,1.16],[.18,1.23]],mat);stem.castShadow=true;group.add(stem);
    addCylinder(group,.2,.2,.07,1.19,accent);
    if(type==='q'){
      const crown=new THREE.Mesh(new THREE.SphereGeometry(.25,24,16),mat);crown.scale.y=.65;crown.position.y=1.48;crown.castShadow=true;group.add(crown);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const bead=new THREE.Mesh(new THREE.SphereGeometry(.065,16,12),accent);bead.position.set(Math.cos(a)*.2,1.68,Math.sin(a)*.2);group.add(bead);}
    }else{
      addCylinder(group,.12,.12,.42,1.48,mat);
      addCylinder(group,.28,.28,.1,1.68,accent);
      addCylinder(group,.055,.055,.42,1.85,accent);
      const cross=new THREE.Mesh(new THREE.BoxGeometry(.34,.065,.065),accent);cross.position.y=1.83;group.add(cross);
    }
  }
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return group;
}

function squarePosition(square){return {x:'abcdefgh'.indexOf(square[0])-3.5,z:4.5-Number(square[1])};}
function renderPieces(game){
  for(const p of pieceMeshes.values())pieceGroup.remove(p);
  pieceMeshes.clear();
  const board=game.board();
  board.forEach((row,r)=>row.forEach((piece,f)=>{
    if(!piece)return;
    const square='abcdefgh'[f]+(8-r), obj=makePiece(piece.type,piece.color);
    const pos=squarePosition(square);obj.position.set(pos.x,.11,pos.z);
    obj.userData.square=square;pieceGroup.add(obj);pieceMeshes.set(square,obj);
  }));
}
function clearHighlights(){while(selectableOverlays.children.length){const c=selectableOverlays.children[0];selectableOverlays.remove(c);c.geometry?.dispose();}}
function drawHighlights(){
  clearHighlights();
  if(selectedSquare){
    const p=squarePosition(selectedSquare);
    const tile=new THREE.Mesh(new THREE.PlaneGeometry(.92,.92),selectedMat);tile.rotation.x=-Math.PI/2;tile.position.set(p.x,.112,p.z);selectableOverlays.add(tile);
  }
  for(const move of legalTargets){
    const p=squarePosition(move.to);
    const marker=new THREE.Mesh(new THREE.CircleGeometry(.16,24),highlightMat);marker.rotation.x=-Math.PI/2;marker.position.set(p.x,.116,p.z);selectableOverlays.add(marker);
  }
}
const game=new Chess();

// ==========================================
// WAR ROOM SCREEN NAVIGATION
// ==========================================

const setupScreen = document.querySelector('#multiplayerSetupScreen');
const arenaScreen = document.querySelector('#arenaScreen');
const gameMode = document.body.dataset.mode;
const isOffline = gameMode === 'offline';
const isSingleplayer = gameMode === 'singleplayer';
const isLocalGame = isOffline || isSingleplayer;
let computerMoveTimer = null;

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(element => {
    element.classList.remove('active');
  });

  screen.classList.add('active');

  const inArena = screen === arenaScreen;

  const newGameButton = document.querySelector('#newGameBtn');
  const roomTag = document.querySelector('#headerRoomTag');
  if (newGameButton) newGameButton.hidden = !inArena;
  if (roomTag) roomTag.hidden = !inArena;

  // Recalculate the Three.js canvas dimensions after it becomes visible.
  if (inArena) {
    requestAnimationFrame(() => {
      resize();
      renderer.render(scene, camera);
    });
  }
}

document.querySelector('#lastMoveButton').addEventListener('click', () => {
  document.querySelector('#moveHistoryPanel').hidden = false;
});

document.querySelector('#closeMoveHistoryBtn').addEventListener('click', () => {
  document.querySelector('#moveHistoryPanel').hidden = true;
});

// ==========================================
// WAR ROOM MULTIPLAYER CONNECTION
// ==========================================

const API_BASE = 'http://localhost:8787';

let roomSocket = null;
let onlineMode = false;
let spectatorMode = false;
let mySide = null;
let myToken = null;
let remoteHistory = null;
let remotePlayers = { white: null, black: null };
let remoteRoomState = null;
let currentRoomCode = null;

const networkStatus = document.querySelector('#networkStatus');
const connectionInfo = document.querySelector('#connectionInfo');

function setNetworkStatus(message) {
  networkStatus.textContent = message;
}

let copyNoticeTimeout = null;
const copyRoomCodeButton = document.querySelector('#headerRoomTag');

async function copyRoomCode() {
  const code = currentRoomCode;
  const notice = document.querySelector('#copyRoomNotice');

  if (!code || !notice) return;

  if (copyNoticeTimeout) clearTimeout(copyNoticeTimeout);

  try {
    await navigator.clipboard.writeText(code);
    notice.textContent = 'Room code copied to clipboard.';
  } catch (error) {
    console.error('Could not copy room code:', error);
    notice.textContent = 'Could not copy room code.';
  }

  notice.hidden = false;
  copyNoticeTimeout = setTimeout(() => {
    notice.hidden = true;
  }, 2200);
}

if (copyRoomCodeButton) {
  copyRoomCodeButton.addEventListener('click', copyRoomCode);
}

function setOnlineControls() {
  const newGameButton = document.querySelector('#newGameBtn');
  if (newGameButton) newGameButton.disabled = onlineMode;

  const undoButton = document.querySelector('#undoBtn');
  const resetButton = document.querySelector('#resetBtn');
  const pauseButton = document.querySelector('#pauseBtn');

  if (!onlineMode) {
    if (undoButton) undoButton.disabled = false;
    if (resetButton) resetButton.disabled = false;
    if (pauseButton) {
      pauseButton.hidden = !isLocalGame;
      pauseButton.textContent = localClockPaused ? 'Resume' : 'Pause';
      pauseButton.disabled =
        !isLocalGame ||
        (localClockPaused
          ? (!activeClock || gameFlagged)
          : (!clockTimer || !activeClock || gameFlagged));
    }
    return;
  }

  const state = remoteRoomState;
  if (undoButton) {
    undoButton.disabled =
      spectatorMode ||
      !state ||
      state.paused ||
      state.resetRequest ||
      state.undoAvailableTo !== mySide;
  }

  if (resetButton) {
    resetButton.disabled =
      spectatorMode ||
      !state ||
      state.paused ||
      !['playing', 'finished'].includes(state.status) ||
      Boolean(state.resetRequest);
  }

  if (pauseButton) {
    pauseButton.hidden = false;
    pauseButton.disabled =
      spectatorMode ||
      !state ||
      state.paused ||
      state.status !== 'playing' ||
      Boolean(state.resetRequest);
  }
}

// function getPlayerName() {
//   const joining = document.querySelector('#joinPlayerNameInput');
//   const creating = document.querySelector('#playerNameInput');

//   const name = currentRoomCode && joining?.value.trim()
//     ? joining.value.trim()
//     : creating?.value.trim();

//   return name || 'WAR ROOM Player';
// }

function getPlayerName() {
  const joiningName = localStorage.getItem('warroom-joining-name');
  const creatingName = document.querySelector('#playerNameInput')?.value.trim();

  if (joiningName) {
    localStorage.removeItem('warroom-joining-name');
    return joiningName;
  }

  return creatingName || 'WAR ROOM Player';
}

function getRoomCode() {
  return document.querySelector('#roomCodeInput').value
    .trim()
    .toUpperCase();
}

async function createOnlineRoom() {
  try {
    setNetworkStatus('Creating your room...');

    const response = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Could not create room.');
    }

    const data = await response.json();
    const code = data.code || data.roomCode || data.room?.code;

    if (!code) {
      throw new Error('The server did not return a room code.');
    }

    document.querySelector('#roomCodeInput').value = code;

    connectToRoom(code, 'player');

  } catch (error) {
    setNetworkStatus(error.message);
  }
}

function joinOnlineRoom() {
  const code = getRoomCode();

  if (!code) {
    setNetworkStatus('Enter a room code first.');
    return;
  }

  const role = document.querySelector('#roleSelect').value;

  // Use the joining player's name.
  const joiningName = document.querySelector('#joinPlayerNameInput').value.trim();

  if (joiningName) {
    localStorage.setItem('warroom-joining-name', joiningName);
  }

  connectToRoom(code, role);
}

function getSavedPlayerToken(code, role) {
  const roomTokenKey = `warroom-token-${code}`;

  if (role === 'white' || role === 'black') {
    const sideToken = localStorage.getItem(`${roomTokenKey}-${role}`);
    if (sideToken) return sideToken;

    return localStorage.getItem(`warroom-side-${code}`) === role
      ? localStorage.getItem(roomTokenKey)
      : null;
  }

  if (role === 'rejoin') {
    const savedSide = localStorage.getItem(`warroom-side-${code}`);
    const sideToken = savedSide
      ? localStorage.getItem(`${roomTokenKey}-${savedSide}`)
      : null;
    return sideToken || localStorage.getItem(roomTokenKey);
  }

  return role === 'player' ? localStorage.getItem(roomTokenKey) : null;
}

function watchOnlineRoom() {
  const code = getRoomCode();

  if (!code) {
    setNetworkStatus('Enter a room code first.');
    return;
  }

  connectToRoom(code, 'spectator');
}

function connectToRoom(code, role) {
  if (roomSocket) {
    roomSocket.close();
    roomSocket = null;
  }

  currentRoomCode = code;
  onlineMode = true;
  document.querySelector('#leaveRoomBtn').disabled = false;
  spectatorMode = role === 'spectator';
  mySide = null;
  remoteHistory = null;
  remotePlayers = { white: null, black: null };
  remoteRoomState = null;

  // document.querySelector('#leaveRoomBtn').disabled = false;
  // document.querySelector('#leaveRoomBtn')
  // .addEventListener('click', leaveOnlineRoom);

  // Online clocks must not run as independent local clocks.
  stopClock();

  setOnlineControls();
  setNetworkStatus('Connecting to room ' + code + '...');

  const params = new URLSearchParams({
    name: getPlayerName(),
    role
  });

  // Only attempt player-seat recovery for a previous player session.
  const savedToken = getSavedPlayerToken(code, role);

  if (savedToken) {
    params.set('token', savedToken);
  }

  const socketUrl =
    `ws://localhost:8787/api/rooms/${encodeURIComponent(code)}/connect?${params}`;

  const socket = new WebSocket(socketUrl);
  roomSocket = socket;
  let joinErrorMessage = null;

  socket.addEventListener('open', () => {
    setNetworkStatus('Connected. Waiting for room information...');
  });

  socket.addEventListener('message', event => {
    try {
      const message = JSON.parse(event.data);

      if (message.type === 'join-error') {
        joinErrorMessage = message.message;
        onlineMode = false;
        spectatorMode = false;
        mySide = null;
        currentRoomCode = null;
        connectionInfo.textContent = '';
        document.querySelector('#leaveRoomBtn').disabled = true;
        setOnlineControls();
        setNetworkStatus(joinErrorMessage);
        socket.close();
        return;
      }

      handleRoomMessage(message);
    } catch (error) {
      console.error('Invalid server message:', error);
    }
  });

  socket.addEventListener('close', () => {
    if (roomSocket !== socket) return;
    roomSocket = null;

    if (!joinErrorMessage) {
      setNetworkStatus('Disconnected from room.');
    }
  });

  socket.addEventListener('error', () => {
    if (joinErrorMessage) return;
    setNetworkStatus('Connection error. Check that your server is running.');
  });
}

function leaveOnlineRoom() {
  if (roomSocket) {
    roomSocket.close();
    roomSocket = null;
  }

  onlineMode = false;
  spectatorMode = false;
  mySide = null;
  myToken = null;
  currentRoomCode = null;
  remoteHistory = null;
  remotePlayers = { white: null, black: null };
  remoteRoomState = null;

  selectedSquare = null;
  legalTargets = [];
  pendingPromotion = null;

  game.reset();
  defaultCamera = DEFAULT_CAMERA;
  resetCamera();

  document.querySelector('#promotionDialog').classList.add('hidden');

  document.querySelector('#whitePlayer strong').textContent = 'White Player';
  document.querySelector('#blackPlayer strong').textContent = 'Black Player';

  setOnlineControls();
  setNetworkStatus('Offline practice mode');

  connectionInfo.textContent = '';

  resetClocks();
  renderRemoteOverlays(null);
  document.querySelector('#resetConfirmOverlay').hidden = true;
  refresh();

  document.querySelector('#leaveRoomBtn').disabled = true;
}

function handleRoomMessage(message) {
  if (message.type === 'welcome') {
    mySide = message.side;
    myToken = message.token || null;

    defaultCamera =
      mySide === 'black' ? BLACK_DEFAULT_CAMERA : DEFAULT_CAMERA;
    resetCamera();

    if (myToken && mySide !== 'spectator') {
      const roomTokenKey = `warroom-token-${currentRoomCode}`;
      localStorage.setItem(roomTokenKey, myToken);
      localStorage.setItem(`${roomTokenKey}-${mySide}`, myToken);
      localStorage.setItem(`warroom-side-${currentRoomCode}`, mySide);
    }

    spectatorMode = mySide === 'spectator';

    const roleLabel = spectatorMode
      ? 'Spectating'
      : `Playing as ${mySide}`;

    setNetworkStatus(`${roleLabel} · Room ${currentRoomCode}`);

    showScreen(arenaScreen);

document.querySelector('#headerRoomCode').textContent = currentRoomCode;
document.querySelector('#roomDetailCode').textContent = currentRoomCode;

document.querySelector('#arenaNetworkStatus').textContent = roleLabel;

    connectionInfo.textContent =
      spectatorMode
        ? 'You are watching this match.'
        : 'Your player seat is connected.';

    if (message.state) {
      applyRemoteState(message.state);
    }

    setOnlineControls();
    return;
  }

  if (message.type === 'state') {
    applyRemoteState(message.state || message);
    return;
  }

  if (message.type === 'error') {
    setNetworkStatus(message.message || 'The server rejected that action.');
  }
}

function applyRemoteState(state) {
  if (!state || !state.fen) return;

  try {
    const history = Array.isArray(state.history) ? state.history : [];
    const matchChanged =
      game.fen() !== state.fen ||
      (remoteHistory !== null && remoteHistory.length !== history.length);
    if (matchChanged) {
      selectedSquare = null;
      legalTargets = [];
      pendingPromotion = null;
      document.querySelector('#promotionDialog').classList.add('hidden');
    }

    remoteRoomState = state;
    game.load(state.fen);

    remoteHistory = history;

    const white = state.players?.white;
    const black = state.players?.black;
    remotePlayers = { white, black };
    syncOnlineClock(state.clock, state);
    renderRemoteOverlays(state);
    setOnlineControls();

    document.querySelector('#whitePlayer strong').textContent =
      white?.name || 'White Player';

    document.querySelector('#blackPlayer strong').textContent =
      black?.name || 'Black Player';

    document.querySelector('#whiteState').textContent =
      white?.connected ? 'Connected' : 'Disconnected';

    document.querySelector('#blackState').textContent =
      black?.connected ? 'Connected' : 'Disconnected';

    refresh();

    const playerCount =
      Number(state.players?.white?.connected === true) +
      Number(state.players?.black?.connected === true);

    document.querySelector('#roomDetailPlayers').textContent = playerCount;

    document.querySelector('#roomDetailSpectators').textContent =
      state.spectatorCount ?? state.spectators?.length ?? '—';

    const matchStatus =
      state.status === 'waiting'
        ? 'Waiting for opponent'
        : state.status === 'playing'
          ? 'Match in progress'
          : 'Match finished';

    document.querySelector('#arenaNetworkStatus').textContent =
      spectatorMode
        ? `Spectating · ${matchStatus}`
        : `Playing as ${mySide} · ${matchStatus}`;

    if (state.status === 'waiting') {
      setNetworkStatus('Waiting for another player...');
    } else if (state.status === 'playing') {
      setNetworkStatus(
        spectatorMode
          ? 'Watching live match'
          : 'Live match in progress'
      );
    } else {
      setNetworkStatus(state.result || 'Match finished');
    }

    connectionInfo.textContent =
      `Room ${currentRoomCode} · ${remoteHistory.length} moves`;

  } catch (error) {
    console.error('Could not apply server game state:', error);
  }
}

function sendOnlineMove(from, to, promotion) {
  if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
    setNetworkStatus('Not connected to the game server.');
    return;
  }

  if (spectatorMode) {
    setNetworkStatus('Spectators cannot move pieces.');
    return;
  }

  const message = {
    type: 'move',
    from,
    to
  };

  if (promotion) {
    message.promotion = promotion;
  }

  roomSocket.send(JSON.stringify(message));
}

function sendOnlineAction(type, details = {}) {
  if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) {
    setNetworkStatus('Not connected to the game server.');
    return;
  }

  if (spectatorMode) return;
  roomSocket.send(JSON.stringify({ type, ...details }));
}

function renderRemoteOverlays(state) {
  const pauseOverlay = document.querySelector('#pauseOverlay');
  const resumeVoteButton = document.querySelector('#resumeVoteBtn');
  const resetOverlay = document.querySelector('#resetOverlay');
  const resetConfirmationOverlay =
    document.querySelector('#resetConfirmOverlay');

  if (
    !pauseOverlay ||
    !resumeVoteButton ||
    !resetOverlay ||
    !resetConfirmationOverlay
  ) return;

  const isOnlinePaused = onlineMode && Boolean(state?.paused);
  const isLocalPaused = isLocalGame && localClockPaused;
  const isPaused = isOnlinePaused || isLocalPaused;
  pauseOverlay.hidden = !isPaused;
  if (isPaused) {
    resetConfirmationOverlay.hidden = true;
    if (isLocalPaused) {
      document.querySelector('#pauseOverlayTitle').textContent =
        'The match is paused.';
      document.querySelector('#pauseOverlayMessage').textContent =
        'The board and clock are paused. Resume when you are ready.';
      document.querySelector('#resumeVotesText').hidden = true;
      resumeVoteButton.hidden = false;
      resumeVoteButton.disabled = false;
      resumeVoteButton.textContent = 'RESUME GAME';
    } else {
      const pausedBy = state.pausedBy === 'white'
        ? 'White'
        : state.pausedBy === 'black'
          ? 'Black'
          : 'A player';
      document.querySelector('#pauseOverlayTitle').textContent =
        'The match is paused.';
      document.querySelector('#pauseOverlayMessage').textContent =
        `${pausedBy} paused the match. Both players must confirm before play resumes.`;

      const votes = state.resumeVotes || {};
      const confirmedCount = Number(Boolean(votes.white)) +
        Number(Boolean(votes.black));
      const voteCount = document.querySelector('#resumeVotesText');
      voteCount.hidden = false;
      voteCount.textContent = `${confirmedCount} of 2 players confirmed.`;

      resumeVoteButton.hidden = spectatorMode;
      resumeVoteButton.disabled =
        !roomSocket ||
        roomSocket.readyState !== WebSocket.OPEN ||
        spectatorMode;
      resumeVoteButton.textContent = votes[mySide]
        ? 'WITHDRAW RESUME VOTE'
        : 'CONFIRM RESUME';
    }
  }

  const request = onlineMode ? state?.resetRequest : null;
  resetOverlay.hidden = !request;
  if (request) {
    resetConfirmationOverlay.hidden = true;
    const isRequester = request.requestedBy === mySide;
    document.querySelector('#resetOverlayMessage').textContent =
      isRequester
        ? 'The other player must approve before the match can restart.'
        : spectatorMode
          ? 'The players are deciding whether to restart this match.'
          : `${request.requestedBy === 'white' ? 'White' : 'Black'} wants to restart the match.`;

    document.querySelector('#resetRequestStatus').textContent =
      isRequester
        ? 'Waiting for the other player...'
        : spectatorMode
          ? 'Waiting for the players to decide.'
          : 'Choose whether to reset or continue the current match.';

    document.querySelector('#approveResetBtn').hidden =
      isRequester || spectatorMode;
    document.querySelector('#declineResetBtn').hidden =
      isRequester || spectatorMode;
    document.querySelector('#cancelResetBtn').hidden =
      !isRequester || spectatorMode;

    ['#approveResetBtn', '#declineResetBtn', '#cancelResetBtn']
      .forEach(selector => {
        const button = document.querySelector(selector);
        button.disabled =
          !roomSocket || roomSocket.readyState !== WebSocket.OPEN;
      });
  }
}


// ==========================================
// WAR ROOM CHESS CLOCK
// ==========================================

const INITIAL_TIME = 5 * 60 * 1000; // 5 minutes

let remainingTime = {
  w: INITIAL_TIME,
  b: INITIAL_TIME
};

let activeClock = 'w';
let lastClockUpdate = Date.now();
let clockTimer = null;
let gameFlagged = false;
let localClockPaused = false;

function formatClock(milliseconds) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderClocks() {
  document.querySelector('#whiteClock').textContent =
    formatClock(remainingTime.w);

  document.querySelector('#blackClock').textContent =
    formatClock(remainingTime.b);

  document.querySelector('#whiteClock').classList.toggle(
    'clock-low',
    remainingTime.w <= 30000
  );

  document.querySelector('#blackClock').classList.toggle(
    'clock-low',
    remainingTime.b <= 30000
  );
}

function stopClock() {
  activeClock = null;

  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}


function clockTick() {
  if (!activeClock || gameFlagged || game.isGameOver()) return;

  const now = Date.now();
  const elapsed = now - lastClockUpdate;

  remainingTime[activeClock] -= elapsed;
  lastClockUpdate = now;

  if (remainingTime[activeClock] <= 0) {
    remainingTime[activeClock] = 0;
    gameFlagged = true;

    // Preserve the expired side before stopping the clock
    const expiredSide = activeClock;
    const winner = expiredSide === 'w' ? 'Black' : 'White';

    stopClock();
    renderClocks();
    setOnlineControls();

    document.querySelector('#statusText').textContent =
      `Time expired. ${winner} wins on time.`;

    document.querySelector('#turnText').textContent =
      'Game finished';

    document.querySelector('#whiteState').textContent =
      expiredSide === 'w' ? 'Time expired' : 'Winner';

    document.querySelector('#blackState').textContent =
      expiredSide === 'b' ? 'Time expired' : 'Winner';

    document.querySelector('#whitePlayer').classList.remove('active-player');
    document.querySelector('#blackPlayer').classList.remove('active-player');

    return;
  }

  renderClocks();
}


function switchClock() {
  if (game.isGameOver()) {
    stopClock();
    return;
  }

  activeClock = game.turn();
  lastClockUpdate = Date.now();

  // Start the clock only after the first move.
  if (!clockTimer && !localClockPaused) {
    clockTimer = setInterval(clockTick, 100);
  }

  renderClocks();
  setOnlineControls();
  renderRemoteOverlays(remoteRoomState);
}

function toggleLocalClockPause() {
  if (localClockPaused) {
    localClockPaused = false;
    if (activeClock && !gameFlagged && !game.isGameOver()) {
      lastClockUpdate = Date.now();
      clockTimer = setInterval(clockTick, 100);
    }

    if (isSingleplayer && game.turn() === 'b' && !computerMoveTimer) {
      scheduleComputerMove();
    }
  } else if (clockTimer && activeClock) {
    if (computerMoveTimer) {
      clearTimeout(computerMoveTimer);
      computerMoveTimer = null;
    }

    clockTick();
    if (clockTimer && activeClock) {
      clearInterval(clockTimer);
      clockTimer = null;
      localClockPaused = true;
    }
  }

  setOnlineControls();
  renderRemoteOverlays(remoteRoomState);
}

function resetClocks() {
  stopClock();

  remainingTime.w = INITIAL_TIME;
  remainingTime.b = INITIAL_TIME;

  // Both clocks remain stopped until White makes the first move.
  activeClock = null;

  gameFlagged = false;
  localClockPaused = false;
  lastClockUpdate = Date.now();

  renderClocks();
  setOnlineControls();
  renderRemoteOverlays(remoteRoomState);
}

function syncOnlineClock(clock, state) {
  if (!clock) return;

  stopClock();
  remainingTime.w = clock.whiteMs;
  remainingTime.b = clock.blackMs;
  activeClock = clock.activeSide === 'white'
    ? 'w'
    : clock.activeSide === 'black'
      ? 'b'
      : null;
  gameFlagged = Boolean(state?.result?.includes('wins on time'));
  lastClockUpdate = Date.now();

  if (
    activeClock &&
    !clock.paused &&
    state?.status === 'playing'
  ) {
    clockTimer = setInterval(clockTick, 100);
  }

  renderClocks();
}


function updateStatus(){
  let text='';
  if(onlineMode && remoteRoomState?.status==='finished' && remoteRoomState.result)text=remoteRoomState.result;
  else if(game.isCheckmate())text=`Checkmate — ${game.turn()==='w'?'Black':'White'} wins.`;
  else if(game.isStalemate())text='Draw — stalemate.';
  else if(game.isThreefoldRepetition())text='Draw — threefold repetition.';
  else if(game.isInsufficientMaterial())text='Draw — insufficient material.';
  else if(game.isDraw())text='Draw.';
  else text=`${game.turn()==='w'?'White':'Black'} to move${game.isCheck()?' · Check':''}.`;
  document.querySelector('#statusText').textContent=text;
  const historyForBanner = remoteHistory !== null
  ? remoteHistory
  : game.history();

const lastMove = historyForBanner.length
  ? historyForBanner[historyForBanner.length - 1]
  : null;

document.querySelector('#lastMoveText').textContent =
  lastMove || 'No moves played yet';
  document.querySelector('#turnText').textContent=(game.isGameOver() || (onlineMode && remoteRoomState?.status==='finished'))?'Game finished':`${game.turn()==='w'?'White':'Black'} to move`;
  document.querySelector('#whitePlayer').classList.toggle('active-player',game.turn()==='w'&&!game.isGameOver());
  document.querySelector('#blackPlayer').classList.toggle('active-player',game.turn()==='b'&&!game.isGameOver());
  // document.querySelector('#whiteState').textContent=game.turn()==='w'&&!game.isGameOver()?'To move':'Ready';
  // document.querySelector('#blackState').textContent=game.turn()==='b'&&!game.isGameOver()?'To move':'Ready';
  if (!onlineMode) {
  document.querySelector('#whiteState').textContent =
    game.turn() === 'w' && !game.isGameOver() ? 'To move' : 'Ready';

  document.querySelector('#blackState').textContent =
    game.turn() === 'b' && !game.isGameOver() ? 'To move' : 'Ready';
} else {
  const getOnlinePlayerState = (player, isYourTurn) => {
    if (!player) return 'Waiting';
    if (!player.connected) return 'Disconnected';
    return isYourTurn ? 'Your turn' : 'Connected';
  };

  document.querySelector('#whiteState').textContent =
    getOnlinePlayerState(
      remotePlayers.white,
      mySide === 'white' && game.turn() === 'w' && !game.isGameOver()
    );

  document.querySelector('#blackState').textContent =
    getOnlinePlayerState(
      remotePlayers.black,
      mySide === 'black' && game.turn() === 'b' && !game.isGameOver()
    );
}
  // const history=game.history();
  const history = remoteHistory !== null
  ? remoteHistory
  : game.history();
  document.querySelector('#moveHistory').innerHTML=history.length?history.reduce((html,m,i)=>html+(i%2===0?`<div class="move-entry"><b>${Math.floor(i/2)+1}.</b>${m}`:`<div class="move-entry">${m}</div>`),''):'<span class="muted">No moves yet</span>';
}
function refresh(){renderPieces(game);drawHighlights();updateStatus();}
// function selectSquare(square){
//   if(game.isGameOver() || gameFlagged)return;
//   const piece=game.get(square);
//   if(selectedSquare && legalTargets.some(m=>m.to===square)){
//     const matching=legalTargets.filter(m=>m.to===square);
//     const promotion=matching.find(m=>m.promotion);
//     if(promotion){pendingPromotion={from:selectedSquare,to:square};document.querySelector('#promotionDialog').classList.remove('hidden');return;}
//     game.move({from:selectedSquare,to:square});
// selectedSquare=null;
// legalTargets=[];
// switchClock();
// refresh();
// return;
//   }
//   if(piece&&piece.color===game.turn()){
//     selectedSquare=square;legalTargets=game.moves({square,verbose:true});drawHighlights();
//   }else{selectedSquare=null;legalTargets=[];drawHighlights();}
// }

function selectSquare(square) {
  if (game.isGameOver() || gameFlagged) return;
  if (isLocalGame && localClockPaused) return;

  if (isSingleplayer && game.turn() !== 'w') return;

  // Spectators and the opposing player cannot move.
  if (onlineMode) {
    if (
      spectatorMode ||
      remoteRoomState?.status !== 'playing' ||
      remoteRoomState?.paused ||
      remoteRoomState?.resetRequest
    ) return;

    const requiredColor = mySide === 'white' ? 'w' : 'b';

    if (game.turn() !== requiredColor) return;
  }

  const piece = game.get(square);

  if (selectedSquare && legalTargets.some(m => m.to === square)) {
    const matching = legalTargets.filter(m => m.to === square);
    const promotion = matching.find(m => m.promotion);

    if (promotion) {
      pendingPromotion = {
        from: selectedSquare,
        to: square
      };

      document.querySelector('#promotionDialog')
        .classList.remove('hidden');

      return;
    }

    if (onlineMode) {
      sendOnlineMove(selectedSquare, square);
    } else {
      game.move({
        from: selectedSquare,
        to: square
      });

      switchClock();
    }

    selectedSquare = null;
    legalTargets = [];
    refresh();
    scheduleComputerMove();
    return;
  }

  if (piece && piece.color === game.turn()) {
    selectedSquare = square;
    legalTargets = game.moves({
      square,
      verbose: true
    });

    if (onlineMode) sendOnlineAction('select', { square });
    drawHighlights();
  } else {
    selectedSquare = null;
    legalTargets = [];
    drawHighlights();
  }
}

function evaluatePosition() {
  if (game.isCheckmate()) return game.turn() === 'w' ? -100000 : 100000;
  if (game.isDraw()) return 0;

  const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  return game.board().flat().reduce((score, piece) => {
    if (!piece) return score;
    return score + (piece.color === 'w' ? values[piece.type] : -values[piece.type]);
  }, 0);
}

function chooseComputerMove() {
  let bestScore = Infinity;
  let bestMoves = [];

  for (const move of game.moves({ verbose: true })) {
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
    let score;

    if (game.isGameOver()) {
      score = evaluatePosition();
    } else {
      score = -Infinity;
      for (const reply of game.moves({ verbose: true })) {
        game.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
        score = Math.max(score, evaluatePosition());
        game.undo();
      }
    }

    game.undo();
    if (score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function scheduleComputerMove() {
  if (
    !isSingleplayer ||
    localClockPaused ||
    game.isGameOver() ||
    game.turn() !== 'b'
  ) return;

  document.querySelector('#statusText').textContent = 'Opponent is thinking…';
  computerMoveTimer = setTimeout(() => {
    computerMoveTimer = null;
    if (
      game.isGameOver() ||
      gameFlagged ||
      localClockPaused ||
      game.turn() !== 'b'
    ) return;

    const move = chooseComputerMove();
    if (!move) return;

    game.move({ from: move.from, to: move.to, promotion: move.promotion });
    switchClock();
    refresh();
  }, 350);
}

function onPointerDown(event){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(squareMeshes,false);
  if(hits.length)selectSquare(hits[0].object.userData.square);
}
renderer.domElement.addEventListener('pointerdown',onPointerDown);
// document.querySelectorAll('.promotion-options button').forEach(button=>button.addEventListener('click',()=>{
//   if(!pendingPromotion)return;
//   game.move({...pendingPromotion,promotion:button.dataset.piece});
//   switchClock();
//   pendingPromotion=null;document.querySelector('#promotionDialog').classList.add('hidden');
//   selectedSquare=null;legalTargets=[];refresh();
// }));

document.querySelectorAll('.promotion-options button').forEach(button => {
  button.addEventListener('click', () => {
    if (!pendingPromotion) return;

    if (onlineMode) {
      sendOnlineMove(
        pendingPromotion.from,
        pendingPromotion.to,
        button.dataset.piece
      );
    } else {
      game.move({
        ...pendingPromotion,
        promotion: button.dataset.piece
      });

      switchClock();
    }

    pendingPromotion = null;

    document.querySelector('#promotionDialog')
      .classList.add('hidden');

    selectedSquare = null;
    legalTargets = [];

    refresh();
    scheduleComputerMove();
  });
});

// function restart(){game.reset();selectedSquare=null;legalTargets=[];pendingPromotion=null;document.querySelector('#promotionDialog').classList.add('hidden');refresh();}
function restart(){
  if (onlineMode) {
    document.querySelector('#resetConfirmOverlay').hidden = false;
    return;
  }

  if (computerMoveTimer) {
    clearTimeout(computerMoveTimer);
    computerMoveTimer = null;
  }

  game.reset();
  selectedSquare=null;
  legalTargets=[];
  pendingPromotion=null;

  document.querySelector('#promotionDialog').classList.add('hidden');

  resetClocks();
  document.querySelector('#whitePlayer strong').textContent = 'White';
  document.querySelector('#blackPlayer strong').textContent =
    isSingleplayer ? 'Computer' : 'Black';
  document.querySelector('#arenaNetworkStatus').textContent =
    isSingleplayer ? 'Playing against the computer' : 'Offline practice';
  refresh();
}
const newGameButton = document.querySelector('#newGameBtn');
if (newGameButton) newGameButton.addEventListener('click',restart);
document.querySelector('#resetBtn').addEventListener('click',restart);
// document.querySelector('#undoBtn').addEventListener('click',()=>{if(game.undo()){selectedSquare=null;legalTargets=[];refresh();}});
document.querySelector('#undoBtn').addEventListener('click',()=>{
  if (onlineMode) {
    sendOnlineAction('undo');
    return;
  }

  if (gameFlagged) return;
  if (computerMoveTimer) {
    clearTimeout(computerMoveTimer);
    computerMoveTimer = null;
  }

  const undoComputerReply =
    isSingleplayer && game.turn() === 'w' && game.history().length > 0;
  let undone = game.undo();
  if (undoComputerReply) {
    undone = game.undo() || undone;
  }

  if (undone) {
    selectedSquare = null;
    legalTargets = [];
    activeClock = game.turn();
    lastClockUpdate = Date.now();
    refresh();
  }
});
document.querySelector('#pauseBtn').addEventListener('click',()=>{
  if (!isLocalGame) {
    sendOnlineAction('pause');
    return;
  }

  toggleLocalClockPause();
});
document.querySelector('#resumeVoteBtn').addEventListener('click',()=>{
  if (isLocalGame) {
    toggleLocalClockPause();
  } else {
    sendOnlineAction('resume-vote');
  }
});
document.querySelector('#approveResetBtn').addEventListener('click',()=>{
  sendOnlineAction('reset-response', { approve: true });
});
document.querySelector('#declineResetBtn').addEventListener('click',()=>{
  sendOnlineAction('reset-response', { approve: false });
});
document.querySelector('#cancelResetBtn').addEventListener('click',()=>{
  sendOnlineAction('reset-cancel');
});
document.querySelector('#confirmResetRequestBtn').addEventListener('click',()=>{
  document.querySelector('#resetConfirmOverlay').hidden = true;
  sendOnlineAction('reset-request');
});
document.querySelector('#cancelResetRequestBtn').addEventListener('click',()=>{
  document.querySelector('#resetConfirmOverlay').hidden = true;
});
document.querySelector('#resetViewBtn').addEventListener('click',()=>{resetCamera();});
document.querySelector('#topViewBtn').addEventListener('click',()=>{resetCamera();});
document.querySelector('#topViewBtn2').addEventListener('click',()=>{resetCamera();});
document.querySelector('#whiteSideBtn').addEventListener('click',()=>resetCamera(DEFAULT_CAMERA));
document.querySelector('#blackSideBtn').addEventListener('click',()=>resetCamera(BLACK_DEFAULT_CAMERA));
document.querySelector('#sideViewBtn').addEventListener('click',()=>resetCamera(new THREE.Vector3(12,7,0)));

function resize(){
  const w=mount.clientWidth,h=mount.clientHeight;
  if(!w||!h)return;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
new ResizeObserver(resize).observe(mount);resize();
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}

// ==========================================
// WAR ROOM REACTIONS
// ==========================================

document.querySelectorAll('.reaction-button').forEach(button => {
  button.addEventListener('click', () => {
    const reaction = button.dataset.reaction;

    const messageArea = document.querySelector('#roomMessages');
    const message = document.createElement('div');

    message.className = 'reaction-message';
    message.textContent = reaction;

    messageArea.appendChild(message);
  });
});

// ==========================================
// LOBBY EVENT LISTENERS
// ==========================================

// document.querySelector('#createRoomBtn')
//   .addEventListener('click', createOnlineRoom);

// document.querySelector('#joinRoomBtn')
//   .addEventListener('click', joinOnlineRoom);

// document.querySelector('#watchRoomBtn')
//   .addEventListener('click', watchOnlineRoom);

//   document.querySelector('#leaveRoomBtn')
//   .addEventListener('click', leaveOnlineRoom);

// document.querySelector('#roomCodeInput')
//   .addEventListener('input', event => {
//     event.target.value = event.target.value
//       .toUpperCase()
//       .replace(/[^A-Z0-9]/g, '');
//   });

// resetClocks();
// refresh();
// animate();

// ==========================================
// WAR ROOM EVENT LISTENERS
// ==========================================

document.querySelector('#createRoomBtn')
  .addEventListener('click', createOnlineRoom);

document.querySelector('#joinRoomBtn')
  .addEventListener('click', joinOnlineRoom);

document.querySelector('#leaveRoomBtn')
  .addEventListener('click', () => {
    leaveOnlineRoom();
    showScreen(setupScreen);
  });

document.querySelector('#roomCodeInput')
  .addEventListener('input', event => {
    event.target.value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  });

// Initial screen and chess state.
resetClocks();
refresh();
animate();

if (gameMode === 'multiplayer') {
  showScreen(setupScreen);
} else {
  document.querySelector('#arenaNetworkStatus').textContent =
    isSingleplayer ? 'Playing against the computer' : 'Offline practice';
  document.querySelector('#blackPlayer strong').textContent =
    isSingleplayer ? 'Computer' : 'Black';
  showScreen(arenaScreen);
  setOnlineControls();
}