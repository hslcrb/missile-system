import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FIXED_STEP, flightPoint } from './physics.js';
import { MODELS, PAD_POSITIONS, makeVehicle, buildWorld } from './world.js';
import { VFX } from './vfx.js';

const byId=id=>document.getElementById(id);
const stage=byId('stage');
const canvas=byId('sceneCanvas');
const errorBox=byId('webglError');
let renderer;

try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
} catch(error) {
  errorBox.hidden=false;
  console.error('WebGL renderer unavailable:',error);
}

if(renderer)initialize();

function initialize(){
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(49,1,.1,290);
  const cameraHome=new THREE.Vector3(37,26,41);
  const targetHome=new THREE.Vector3(0,8,0);
  camera.position.copy(cameraHome);
  const orbit=new OrbitControls(camera,canvas);
  orbit.target.copy(targetHome);
  orbit.enableDamping=true;
  orbit.dampingFactor=.075;
  orbit.minDistance=10;
  orbit.maxDistance=100;
  orbit.maxPolarAngle=Math.PI*.49;
  orbit.update();

  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const world=buildWorld(scene);
  const vfx=new VFX(scene);
  const UP=new THREE.Vector3(0,1,0);
  const tempHeading=new THREE.Vector3();
  const cameraGoal=new THREE.Vector3().copy(cameraHome);
  const targetGoal=new THREE.Vector3().copy(targetHome);

  const modelButtons=[...document.querySelectorAll('[data-model]')];
  const viewButtons=[...document.querySelectorAll('[data-view]')];
  const intervalRange=byId('intervalRange');
  const densityRange=byId('densityRange');
  const speedRange=byId('speedRange');
  const qualitySelect=byId('qualitySelect');
  const sequenceBtn=byId('sequenceBtn');
  const pauseBtn=byId('pauseBtn');
  const eventLog=byId('eventLog');
  const cycleSwitch=byId('cycleSwitch');

  let selected=0;
  let cycleCursor=0;
  let sequencePlaying=false;
  let paused=false;
  let count=0;
  let autoClock=0;
  let accumulator=0;
  let lastTimestamp=performance.now();
  let fpsFrames=0;
  let fpsSeconds=0;
  let currentFps=0;
  let cameraTransition=false;
  const flights=[];

  if(window.matchMedia('(max-width: 620px)').matches){
    qualitySelect.value='low';
    densityRange.value='50';
  }
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    densityRange.value='30';
    speedRange.value='0.5';
  }

  function applyQuality(){
    const cap=qualitySelect.value==='high'?2:qualitySelect.value==='low'?1:1.5;
    const scale=Math.min(window.devicePixelRatio||1,cap);
    renderer.setPixelRatio(scale);
    byId('renderScale').textContent=scale.toFixed(1)+'×';
    resize();
  }
  function resize(){
    const width=Math.max(1,stage.clientWidth);
    const height=Math.max(1,stage.clientHeight);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe(stage);
  qualitySelect.addEventListener('change',()=>{applyQuality();logEvent('렌더링 품질 변경: '+qualitySelect.value);});
  applyQuality();

  function currentDensity(){
    const qualityFactor=qualitySelect.value==='low'?.72:1;
    return Number(densityRange.value)/100*qualityFactor;
  }
  function updateRanges(){
    byId('intervalValue').textContent=(Number(intervalRange.value)/1000).toFixed(1)+'s';
    byId('densityValue').textContent=densityRange.value+'%';
    byId('speedValue').textContent=Number(speedRange.value).toFixed(2).replace(/0$/,'').replace(/\.0$/,'')+'×';
  }
  [intervalRange,densityRange,speedRange].forEach(input=>input.addEventListener('input',updateRanges));
  updateRanges();

  function logEvent(message){
    const item=document.createElement('li');
    const time=document.createElement('time');
    const detail=document.createElement('span');
    time.textContent=new Date().toLocaleTimeString('ko-KR',{hour12:false});
    detail.textContent=message;
    item.append(time,detail);
    eventLog.prepend(item);
    while(eventLog.children.length>7)eventLog.lastElementChild.remove();
  }
  eventLog.replaceChildren();
  logEvent('시각화 시스템 준비 완료');

  function selectModel(index){
    selected=index;
    modelButtons.forEach((button,i)=>{
      const isSelected=i===index;
      button.classList.toggle('active',isSelected);
      button.setAttribute('aria-pressed',String(isSelected));
    });
    byId('selectedName').textContent=MODELS[index].name+' / '+MODELS[index].en;
    world.highlight(index);
    logEvent(MODELS[index].name+' 스타일 선택');
  }
  modelButtons.forEach(button=>button.addEventListener('click',()=>selectModel(Number(button.dataset.model))));
  world.highlight(0);

  function setSequence(value){
    sequencePlaying=value;
    sequenceBtn.classList.toggle('playing',value);
    byId('sequenceBtnLabel').textContent=value?'연속 재생 중지':'연속 재생 시작';
    byId('sequenceState').textContent=value?'RUNNING':'READY';
    byId('sequenceState').classList.toggle('running',value);
    if(value){
      if(paused)setPaused(false);
      autoClock=0;
      cycleCursor=selected;
      launch(cycleCursor);
      cycleCursor=(cycleCursor+1)%MODELS.length;
      logEvent('연속 재생 활성화');
    }else{
      logEvent('연속 재생 중지');
    }
  }
  sequenceBtn.addEventListener('click',()=>setSequence(!sequencePlaying));
  byId('launchBtn').addEventListener('click',()=>{
    if(paused)setPaused(false);
    launch(selected);
  });

  function setPaused(value){
    paused=value;
    pauseBtn.textContent=value?'계속 재생':'일시정지';
    byId('renderStatus').textContent=value?'SIMULATION PAUSED':'RENDER ACTIVE';
    logEvent(value?'시뮬레이션 일시정지':'시뮬레이션 계속 재생');
  }
  pauseBtn.addEventListener('click',()=>setPaused(!paused));

  function clearScene(){
    if(sequencePlaying)setSequence(false);
    for(const item of flights)scene.remove(item.group);
    flights.length=0;
    vfx.clear();
    count=0;autoClock=0;accumulator=0;
    updateTelemetry();
    logEvent('장면 및 계측값 초기화');
  }
  byId('clearBtn').addEventListener('click',clearScene);
  byId('clearLogBtn').addEventListener('click',()=>{
    eventLog.replaceChildren();
    logEvent('이벤트 로그 초기화');
  });

  function launch(index){
    if(flights.length>=14){
      logEvent('동시 재생 상한 도달 — 다음 연출 대기');
      return;
    }
    const location=PAD_POSITIONS[index];
    const origin={x:location.x,y:.76,z:location.z};
    const group=makeVehicle(index);
    group.position.set(origin.x,origin.y,origin.z);
    scene.add(group);
    flights.push({
      group,index,origin,elapsed:0,
      duration:2.6+(index%3)*.21,
      trailClock:0
    });
    count++;
    updateTelemetry();
    logEvent(MODELS[index].name+' 발사 애니메이션 시작');
  }

  function tickFlights(dt){
    for(let i=flights.length-1;i>=0;i--){
      const item=flights[i];
      item.elapsed+=dt;
      const t=Math.min(1,item.elapsed/item.duration);
      const position=flightPoint(t,item.origin,item.index);
      item.group.position.set(position.x,position.y,position.z);
      if(t>=1){
        scene.remove(item.group);
        flights.splice(i,1);
        vfx.explode(item.group.position,MODELS[item.index].accent,currentDensity());
        logEvent(MODELS[item.index].name+' 공중 파티클 연출');
        continue;
      }
      const next=flightPoint(Math.min(1,t+.008),item.origin,item.index);
      tempHeading.set(next.x-position.x,next.y-position.y,next.z-position.z);
      if(tempHeading.lengthSq()>.000001){
        item.group.quaternion.setFromUnitVectors(UP,tempHeading.normalize());
      }
      item.trailClock+=dt;
      if(item.trailClock>=.065){
        item.trailClock=0;
        vfx.trail(item.group.position,MODELS[item.index].accent,currentDensity());
      }
    }
  }

  function tick(dt){
    if(sequencePlaying){
      autoClock+=dt*1000;
      if(autoClock>=Number(intervalRange.value)){
        autoClock-=Number(intervalRange.value);
        const index=cycleSwitch.checked?cycleCursor:selected;
        launch(index);
        if(cycleSwitch.checked)cycleCursor=(cycleCursor+1)%MODELS.length;
      }
    }
    tickFlights(dt);
    vfx.update(dt);
  }

  function setView(name){
    cameraTransition=true;
    if(name==='wide'){
      cameraGoal.set(48,39,53);
      targetGoal.set(0,10,0);
    }else if(name==='low'){
      cameraGoal.set(16,9,30);
      targetGoal.set(0,7,0);
    }else{
      cameraGoal.copy(cameraHome);
      targetGoal.copy(targetHome);
    }
    viewButtons.forEach(button=>{
      const active=button.dataset.view===name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  viewButtons.forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  byId('resetViewBtn').addEventListener('click',()=>setView('orbit'));
  orbit.addEventListener('start',()=>{cameraTransition=false;});

  function updateTelemetry(){
    byId('launchCount').textContent=String(count).padStart(3,'0');
    byId('activeCount').textContent=String(flights.length).padStart(2,'0');
    byId('particleCount').textContent=String(vfx.activeCount).padStart(4,'0');
    byId('fpsCount').textContent=String(currentFps||'--');
    byId('fpsBadge').textContent=(currentFps||'--')+' FPS';
  }

  window.addEventListener('keydown',event=>{
    const tag=document.activeElement?.tagName;
    if(tag==='INPUT'||tag==='BUTTON'||tag==='SELECT'||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.key.toLowerCase()==='l')launch(selected);
    if(event.key.toLowerCase()==='p')setPaused(!paused);
    if(event.key==='Escape'&&sequencePlaying)setSequence(false);
  });

  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    errorBox.hidden=false;
    errorBox.textContent='그래픽 컨텍스트가 중단되었습니다. 페이지를 새로고침해 복구해 주세요.';
    if(sequencePlaying)setSequence(false);
    paused=true;
  });
  window.addEventListener('visibilitychange',()=>{lastTimestamp=performance.now();});
  let degraded=false;
  function frame(timestamp){
    const realDt=Math.min(.06,Math.max(0,(timestamp-lastTimestamp)/1000));
    lastTimestamp=timestamp;
    fpsFrames++;
    fpsSeconds+=realDt;

    if(!paused){
      accumulator+=realDt*Number(speedRange.value);
      let steps=0;
      while(accumulator>=FIXED_STEP&&steps<5){
        tick(FIXED_STEP);
        accumulator-=FIXED_STEP;
        steps++;
      }
      if(steps===5)accumulator=0;
    }

    if(cameraTransition){
      camera.position.lerp(cameraGoal,.11);
      orbit.target.lerp(targetGoal,.11);
      if(camera.position.distanceToSquared(cameraGoal)<.01&&orbit.target.distanceToSquared(targetGoal)<.01){
        cameraTransition=false;
      }
    }
    orbit.update();
    renderer.render(scene,camera);

    if(fpsSeconds>=.65){
      currentFps=Math.round(fpsFrames/fpsSeconds);
      // A one-time adaptive downgrade protects low-power devices during FX storms.
      if(!degraded&&qualitySelect.value==='high'&&currentFps<24&&count>2){
        degraded=true;qualitySelect.value='medium';applyQuality();
        logEvent('GPU 부하 감지 — 균형 품질로 자동 전환');
      }
      fpsFrames=0;fpsSeconds=0;
      updateTelemetry();
    }
    requestAnimationFrame(frame);
  }
  updateTelemetry();
  requestAnimationFrame(frame);
}
