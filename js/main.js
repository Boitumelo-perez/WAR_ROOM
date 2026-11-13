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
function updateStatus(){
  let text='';
  if(game.isCheckmate())text=`Checkmate — ${game.turn()==='w'?'Black':'White'} wins.`;
  else if(game.isStalemate())text='Draw — stalemate.';
  else if(game.isThreefoldRepetition())text='Draw — threefold repetition.';
  else if(game.isInsufficientMaterial())text='Draw — insufficient material.';
  else if(game.isDraw())text='Draw.';
  else text=`${game.turn()==='w'?'White':'Black'} to move${game.isCheck()?' · Check':''}.`;
  document.querySelector('#statusText').textContent=text;
  document.querySelector('#turnText').textContent=game.isGameOver()?'Game finished':`${game.turn()==='w'?'White':'Black'} to move`;
  document.querySelector('#whitePlayer').classList.toggle('active-player',game.turn()==='w'&&!game.isGameOver());
  document.querySelector('#blackPlayer').classList.toggle('active-player',game.turn()==='b'&&!game.isGameOver());
  document.querySelector('#whiteState').textContent=game.turn()==='w'&&!game.isGameOver()?'To move':'Ready';
  document.querySelector('#blackState').textContent=game.turn()==='b'&&!game.isGameOver()?'To move':'Ready';
  const history=game.history();
  document.querySelector('#moveHistory').innerHTML=history.length?history.reduce((html,m,i)=>html+(i%2===0?`<div class="move-entry"><b>${Math.floor(i/2)+1}.</b>${m}`:`<div class="move-entry">${m}</div>`),''):'<span class="muted">No moves yet</span>';
}
function refresh(){renderPieces(game);drawHighlights();updateStatus();}
function selectSquare(square){
  if(game.isGameOver())return;
  const piece=game.get(square);
  if(selectedSquare && legalTargets.some(m=>m.to===square)){
    const matching=legalTargets.filter(m=>m.to===square);
    const promotion=matching.find(m=>m.promotion);
    if(promotion){pendingPromotion={from:selectedSquare,to:square};document.querySelector('#promotionDialog').classList.remove('hidden');return;}
    game.move({from:selectedSquare,to:square});selectedSquare=null;legalTargets=[];refresh();return;
  }
  if(piece&&piece.color===game.turn()){
    selectedSquare=square;legalTargets=game.moves({square,verbose:true});drawHighlights();
  }else{selectedSquare=null;legalTargets=[];drawHighlights();}
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
document.querySelectorAll('.promotion-options button').forEach(button=>button.addEventListener('click',()=>{
  if(!pendingPromotion)return;
  game.move({...pendingPromotion,promotion:button.dataset.piece});
  pendingPromotion=null;document.querySelector('#promotionDialog').classList.add('hidden');
  selectedSquare=null;legalTargets=[];refresh();
}));
function restart(){game.reset();selectedSquare=null;legalTargets=[];pendingPromotion=null;document.querySelector('#promotionDialog').classList.add('hidden');refresh();}
document.querySelector('#newGameBtn').addEventListener('click',restart);
document.querySelector('#resetBtn').addEventListener('click',restart);
document.querySelector('#undoBtn').addEventListener('click',()=>{if(game.undo()){selectedSquare=null;legalTargets=[];refresh();}});
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
refresh();animate();
