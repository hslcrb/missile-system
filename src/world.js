import * as THREE from 'three';

/**
 * Concept silhouettes only. No authentic dimensions, blueprints or performance data.
 * Profile values below are arbitrary visual proportions in fictional scene units.
 */
export const MODELS = [
  { name:'현무', en:'HYUNMOO', tone:0x9ab7b6, accent:0x72ddda, length:3.65, width:0.31, tip:0.78, fin:0.72 },
  { name:'스커드', en:'SCUD', tone:0xb3ada2, accent:0xf3ae75, length:3.24, width:0.37, tip:1.03, fin:0.90 },
  { name:'이스칸데르', en:'ISKANDER', tone:0x879ba4, accent:0x7aabe2, length:2.87, width:0.42, tip:0.66, fin:0.82 },
  { name:'화성포', en:'HWASONG', tone:0xaebec1, accent:0xc8e4e7, length:4.25, width:0.34, tip:0.90, fin:0.86 },
  { name:'불화살', en:'BULHWASAL', tone:0x9b9183, accent:0xe4a765, length:3.02, width:0.28, tip:0.57, fin:1.20 },
  { name:'바다수리', en:'BADASURI', tone:0x77afb6, accent:0x80d6db, length:3.20, width:0.32, tip:0.66, fin:1.04 }
];

export const PAD_POSITIONS = [
  {x:-12,z:6},{x:0,z:6},{x:12,z:6},
  {x:-12,z:-7},{x:0,z:-7},{x:12,z:-7}
];

const baseCylinder = new THREE.CylinderGeometry(1,1,1,16);
const baseCone = new THREE.ConeGeometry(1,1,16);
const baseBox = new THREE.BoxGeometry(1,1,1);
const materials = MODELS.map(m => ({
  body: new THREE.MeshStandardMaterial({ color:m.tone, metalness:.72, roughness:.38, flatShading:false }),
  edge: new THREE.MeshStandardMaterial({ color:m.accent, emissive:m.accent, emissiveIntensity:.28, metalness:.6, roughness:.28 }),
  fin: new THREE.MeshStandardMaterial({ color:0x344d5a, metalness:.55, roughness:.44 }),
  nozzle: new THREE.MeshStandardMaterial({ color:0x17252d, metalness:.82, roughness:.26 })
}));

function addScaled(parent, geo, mat, x,y,z, sx,sy,sz) {
  const part = new THREE.Mesh(geo,mat);
  part.position.set(x,y,z);
  part.scale.set(sx,sy,sz);
  parent.add(part);
  return part;
}

export function makeVehicle(index) {
  const m = MODELS[index];
  const mat = materials[index];
  const group = new THREE.Group();
  const bottom = 0.37;
  const middle = bottom + m.length / 2;
  addScaled(group,baseCylinder,mat.body,0,middle,0,m.width,m.length,m.width);
  addScaled(group,baseCone,mat.body,0,bottom+m.length+m.tip/2,0,m.width*1.015,m.tip,m.width*1.015);
  addScaled(group,baseCylinder,mat.nozzle,0,bottom-.09,0,m.width*.74,.28,m.width*.74);
  addScaled(group,baseCylinder,mat.edge,0,bottom+m.length*.21,0,m.width*1.06,.075,m.width*1.06);
  addScaled(group,baseCylinder,mat.fin,0,bottom+m.length*.74,0,m.width*1.03,.075,m.width*1.03);
  if(index===3) addScaled(group,baseCylinder,mat.edge,0,bottom+m.length*.82,0,m.width*1.04,.055,m.width*1.04);
  for(let n=0;n<4;n++){
    const angle=n*Math.PI/2;
    const fin = addScaled(group,baseBox,mat.fin,
      Math.cos(angle)*m.width*.94,bottom+.44,Math.sin(angle)*m.width*.94,
      .11,.8,m.fin);
    fin.rotation.y=angle;
  }
  if(index===4||index===5) {
    for(const side of [-1,1]){
      const wing=addScaled(group,baseBox,mat.fin,side*(m.fin*.48),bottom+m.length*.42,0,m.fin,.07,.55);
      wing.rotation.z=side*.07;
    }
  }
  return group;
}

function makeGroundLabel(name, index) {
  const canvas=document.createElement('canvas');
  canvas.width=384;canvas.height=88;
  const context=canvas.getContext('2d');
  context.clearRect(0,0,384,88);
  context.textAlign='center';
  context.fillStyle='#8be3de';
  context.font='bold 27px system-ui, sans-serif';
  context.fillText(String(index+1).padStart(2,'0')+' / '+name,192,48);
  context.fillStyle='#6e9aaa';
  context.fillRect(70,64,244,1);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,opacity:.90}));
  sprite.scale.set(5.6,1.3,1);
  return sprite;
}

export function buildWorld(scene) {
  scene.background=new THREE.Color(0x091723);
  scene.fog=new THREE.FogExp2(0x091723,.012);
  scene.add(new THREE.HemisphereLight(0x92c9e6,0x19303b,2.5));
  const key=new THREE.DirectionalLight(0xd8eafa,2.5);
  key.position.set(16,36,20);
  scene.add(key);
  const fill=new THREE.PointLight(0x44d3d3,42,46,2);
  fill.position.set(-15,9,-8);
  scene.add(fill);

  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(170,170),
    new THREE.MeshStandardMaterial({color:0x0d1e2c,metalness:.25,roughness:.86})
  );
  ground.rotation.x=-Math.PI/2;ground.position.y=-.14;
  scene.add(ground);
  const grid=new THREE.GridHelper(110,44,0x28556b,0x193549);
  grid.position.y=-.115;
  scene.add(grid);

  const perimeter=new THREE.Mesh(
    new THREE.TorusGeometry(28.9,.055,5,128),
    new THREE.MeshBasicMaterial({color:0x2d7181,transparent:true,opacity:.55})
  );
  perimeter.rotation.x=Math.PI/2;perimeter.position.y=-.07;scene.add(perimeter);

  const plinthGeo=new THREE.CylinderGeometry(2.6,2.9,.48,40);
  const insideGeo=new THREE.CylinderGeometry(2.17,2.19,.035,40);
  const ringGeo=new THREE.TorusGeometry(2.46,.062,6,72);
  const plinthMat=new THREE.MeshStandardMaterial({color:0x1c3543,metalness:.7,roughness:.55});
  const centerMat=new THREE.MeshStandardMaterial({color:0x12303a,metalness:.6,roughness:.58});
  const pads=[];

  PAD_POSITIONS.forEach((pos,i)=>{
    const base=new THREE.Mesh(plinthGeo,plinthMat);
    base.position.set(pos.x,.09,pos.z);scene.add(base);
    const center=new THREE.Mesh(insideGeo,centerMat);
    center.position.set(pos.x,.354,pos.z);scene.add(center);
    const ringMat=new THREE.MeshBasicMaterial({color:0x3c7a84,transparent:true,opacity:.78});
    const ring=new THREE.Mesh(ringGeo,ringMat);
    ring.rotation.x=Math.PI/2;ring.position.set(pos.x,.4,pos.z);scene.add(ring);
    const vehicle=makeVehicle(i);
    vehicle.position.set(pos.x,.38,pos.z);
    vehicle.scale.setScalar(.91);
    scene.add(vehicle);
    const label=makeGroundLabel(MODELS[i].name,i);
    label.position.set(pos.x,.68,pos.z+3.55);
    scene.add(label);
    const accent=new THREE.PointLight(MODELS[i].accent,7,7,2);
    accent.position.set(pos.x,1.1,pos.z);
    scene.add(accent);
    pads.push({ring,ringMat,vehicle});
  });

  const lineMat=new THREE.LineBasicMaterial({color:0x306172,transparent:true,opacity:.38});
  const lines=[];
  for(let i=-2;i<=2;i++){
    const z=i*13;
    lines.push(-29,.04,z,29,.04,z);
  }
  const lineGeometry=new THREE.BufferGeometry();
  lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
  scene.add(new THREE.LineSegments(lineGeometry,lineMat));

  // Non-interactive stylized distant structures and sky specks.
  const blockMat=new THREE.MeshStandardMaterial({color:0x172b3a,metalness:.4,roughness:.85});
  for(let i=0;i<22;i++){
    const angle=(i/22)*Math.PI*2;
    const radius=46+(i%4)*4;
    const height=3+(i*13%11);
    const block=addScaled(scene,baseBox,blockMat,Math.sin(angle)*radius,height*.5-.13,Math.cos(angle)*radius,2.6,height,2.9);
    block.rotation.y=angle;
  }
  const starPoints=[];
  for(let i=0;i<160;i++){
    const angle=i*2.3999632;
    const radius=38+((i*127)%82);
    starPoints.push(Math.cos(angle)*radius,29+((i*19)%70),Math.sin(angle)*radius);
  }
  const stars=new THREE.BufferGeometry();
  stars.setAttribute('position',new THREE.Float32BufferAttribute(starPoints,3));
  scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0x6a9ba8,size:.27,transparent:true,opacity:.65,depthWrite:false,fog:false})));

  return {
    highlight(index){
      pads.forEach((pad,i)=>{
        pad.ringMat.color.setHex(i===index?0x9cf3e7:0x3c7a84);
        pad.ringMat.opacity=i===index?1:.63;
      });
    },
    setTheme(isLight){
      scene.background.setHex(isLight?0xc3dfeb:0x091723);
      if(scene.fog)scene.fog.color.setHex(isLight?0xc3dfeb:0x091723);
      ground.material.color.setHex(isLight?0x93bcc9:0x0d1e2c);
      blockMat.color.setHex(isLight?0x9ab8c5:0x172b3a);
      plinthMat.color.setHex(isLight?0x537e8e:0x1c3543);
      centerMat.color.setHex(isLight?0x477b8b:0x12303a);
      perimeter.material.color.setHex(isLight?0x2e8799:0x2d7181);
      lineMat.color.setHex(isLight?0x427b90:0x306172);
      pads.forEach(pad=>{
        pad.ringMat.opacity=isLight?.82:.78;
      });
    }
  };
}
