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
const DEFAULT_CAMERA = new THREE.Vector3(0, 18, 6.823); // 5 degrees from vertical
const TARGET = new THREE.Vector3(0, 0, 0);

function resetCamera(position = DEFAULT_CAMERA) {
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

const landingScreen = document.querySelector('#landingScreen');
const setupScreen = document.querySelector('#multiplayerSetupScreen');
const arenaScreen = document.querySelector('#arenaScreen');

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(element => {
    element.classList.remove('active');
  });

  screen.classList.add('active');

  const inArena = screen === arenaScreen;

  document.querySelector('#newGameBtn').hidden = !inArena;
  document.querySelector('#headerRoomTag').hidden = !inArena;

  // Recalculate the Three.js canvas dimensions after it becomes visible.
  if (inArena) {
    requestAnimationFrame(() => {
      resize();
      renderer.render(scene, camera);
    });
  }
}

document.querySelector('#offlineBtn').addEventListener('click', () => {
  leaveOnlineRoom();
  showScreen(arenaScreen);

  document.querySelector('#arenaNetworkStatus').textContent =
    'Offline practice';

  document.querySelector('#roomDetailCode').textContent = 'Offline';
  document.querySelector('#roomDetailPlayers').textContent = '2';
  document.querySelector('#roomDetailSpectators').textContent = '0';
});

document.querySelector('#multiplayerBtn').addEventListener('click', () => {
  showScreen(setupScreen);
});

document.querySelector('#backToLandingBtn').addEventListener('click', () => {
  showScreen(landingScreen);
});

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
let currentRoomCode = null;

const networkStatus = document.querySelector('#networkStatus');
const connectionInfo = document.querySelector('#connectionInfo');

function setNetworkStatus(message) {
  networkStatus.textContent = message;
}

function setOnlineControls() {
  const localOnlyButtons = [
    '#undoBtn',
    '#resetBtn',
    '#newGameBtn'
  ];

  localOnlyButtons.forEach(selector => {
    const button = document.querySelector(selector);
    if (button) button.disabled = onlineMode;
  });
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
  const savedToken = role === 'player'
    ? localStorage.getItem(`warroom-token-${code}`)
    : null;

  if (savedToken) {
    params.set('token', savedToken);
  }

  const socketUrl =
    `ws://localhost:8787/api/rooms/${encodeURIComponent(code)}/connect?${params}`;

  roomSocket = new WebSocket(socketUrl);

  roomSocket.addEventListener('open', () => {
    setNetworkStatus('Connected. Waiting for room information...');
  });

  roomSocket.addEventListener('message', event => {
    try {
      const message = JSON.parse(event.data);
      handleRoomMessage(message);
    } catch (error) {
      console.error('Invalid server message:', error);
    }
  });

  roomSocket.addEventListener('close', () => {
    setNetworkStatus('Disconnected from room.');
  });

  roomSocket.addEventListener('error', () => {
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

  selectedSquare = null;
  legalTargets = [];
  pendingPromotion = null;

  game.reset();

  document.querySelector('#promotionDialog').classList.add('hidden');

  document.querySelector('#whitePlayer').textContent = 'White Player';
  document.querySelector('#blackPlayer strong').textContent = 'Black Player';

  setOnlineControls();
  setNetworkStatus('Offline practice mode');

  connectionInfo.textContent = '';

  resetClocks();
  refresh();

  document.querySelector('#leaveRoomBtn').disabled = true;
}

function handleRoomMessage(message) {
  if (message.type === 'welcome') {
    mySide = message.side;
    myToken = message.token || null;

    if (myToken && mySide !== 'spectator') {
      localStorage.setItem(
        `warroom-token-${currentRoomCode}`,
        myToken
      );
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
    game.load(state.fen);

    remoteHistory = Array.isArray(state.history)
      ? state.history
      : [];

    const white = state.players?.white;
    const black = state.players?.black;

    document.querySelector('#whitePlayer').textContent =
      white?.name || 'White Player';

    document.querySelector('#blackPlayer').textContent =
      black?.name || 'Black Player';

    document.querySelector('#whiteState').textContent =
      white?.connected ? 'Connected' : 'Disconnected';

    document.querySelector('#blackState').textContent =
      black?.connected ? 'Connected' : 'Disconnected';

    refresh();

    const playerCount =
  Number(Boolean(state.players?.white)) +
  Number(Boolean(state.players?.black));

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
  if (!clockTimer) {
    clockTimer = setInterval(clockTick, 100);
  }

  renderClocks();
}

function resetClocks() {
  stopClock();

  remainingTime.w = INITIAL_TIME;
  remainingTime.b = INITIAL_TIME;

  // Both clocks remain stopped until White makes the first move.
  activeClock = null;

  gameFlagged = false;
  lastClockUpdate = Date.now();

  renderClocks();
}


function updateStatus(){
  let text='';
  if(game.isCheckmate())text=`Checkmate — ${game.turn()==='w'?'Black':'White'} wins.`;
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
  document.querySelector('#turnText').textContent=game.isGameOver()?'Game finished':`${game.turn()==='w'?'White':'Black'} to move`;
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
  document.querySelector('#whiteState').textContent =
    mySide === 'white' && game.turn() === 'w'
      ? 'Your turn'
      : 'Connected';

  document.querySelector('#blackState').textContent =
    mySide === 'black' && game.turn() === 'b'
      ? 'Your turn'
      : 'Connected';
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

  // Spectators and the opposing player cannot move.
  if (onlineMode) {
    if (spectatorMode) return;

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
    return;
  }

  if (piece && piece.color === game.turn()) {
    selectedSquare = square;
    legalTargets = game.moves({
      square,
      verbose: true
    });

    drawHighlights();
  } else {
    selectedSquare = null;
    legalTargets = [];
    drawHighlights();
  }
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
  });
});

// function restart(){game.reset();selectedSquare=null;legalTargets=[];pendingPromotion=null;document.querySelector('#promotionDialog').classList.add('hidden');refresh();}
function restart(){
  game.reset();
  selectedSquare=null;
  legalTargets=[];
  pendingPromotion=null;

  document.querySelector('#promotionDialog').classList.add('hidden');

  resetClocks();
  refresh();
}
document.querySelector('#newGameBtn').addEventListener('click',restart);
document.querySelector('#resetBtn').addEventListener('click',restart);
// document.querySelector('#undoBtn').addEventListener('click',()=>{if(game.undo()){selectedSquare=null;legalTargets=[];refresh();}});
document.querySelector('#undoBtn').addEventListener('click',()=>{if(gameFlagged)return;if(game.undo()){selectedSquare=null;legalTargets=[];activeClock=game.turn();lastClockUpdate=Date.now();refresh();}});
document.querySelector('#flipBtn').addEventListener('click',()=>{camera.position.x*=-1;camera.position.z*=-1;controls.update();});
document.querySelector('#resetViewBtn').addEventListener('click',()=>{resetCamera();});
document.querySelector('#topViewBtn').addEventListener('click',()=>{resetCamera();});
document.querySelector('#topViewBtn2').addEventListener('click',()=>{resetCamera();});
document.querySelector('#whiteSideBtn').addEventListener('click',()=>resetCamera(new THREE.Vector3(0,11,10)));
document.querySelector('#blackSideBtn').addEventListener('click',()=>resetCamera(new THREE.Vector3(0,11,-10)));
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

showScreen(landingScreen);