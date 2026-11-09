import * as THREE from 'three';
import { stepBody } from './physics.js';

/**
 * A wholly fictional 3D set for observing visual effects.
 * Buildings are abstract props; the motion is an art-directed spline,
 * not a firing solution, targeting algorithm, realistic ballistics or
 * a representation of real military terrain or hardware.
 */
const BUILDING_SPECS=[
  {letter:'A',name:'가상 건물 A',x:-15,z:-24,w:5.2,d:4.5,h:9.8,shade:0x7c9cac},
  {letter:'B',name:'가상 건물 B',x:0,z:-25,w:6.2,d:5.0,h:13.2,shade:0x92aeba},
  {letter:'C',name:'가상 건물 C',x:15,z:-24,w:5.8,d:4.8,h:10.8,shade:0x9ba6ac}
];

const MODES={
  long:{ label:'장사정포', accent:0xebbd7c, x:-27,z:-43, height:2.1 },
  self:{ label:'자주포', accent:0x87d5ad, x:0,z:-44, height:2.3 },
  coast:{ label:'해안포', accent:0x7eceee, x:27,z:-43, height:2.0 }
};

const unitBox=new THREE.BoxGeometry(1,1,1);
const pulseGeo=new THREE.SphereGeometry(.4,10,9);
const _object=new THREE.Object3D();
const _color=new THREE.Color();

function mesh(parent,geo,mat,x,y,z,sx=1,sy=1,sz=1){
  const part=new THREE.Mesh(geo,mat);
  part.position.set(x,y,z);
  part.scale.set(sx,sy,sz);
  parent.add(part);
  return part;
}

function constructBuilding(spec,index){
  const root=new THREE.Group();
  root.position.set(spec.x,0,spec.z);
  const bodyMat=new THREE.MeshStandardMaterial({
    color:spec.shade,roughness:.74,metalness:.18
  });
  const roofMat=new THREE.MeshStandardMaterial({color:0x2d566b,metalness:.4,roughness:.52});
  const windowMat=new THREE.MeshStandardMaterial({
    color:0x172e42,emissive:0x133548,emissiveIntensity:.25,roughness:.25,metalness:.15
  });
  const body=mesh(root,unitBox,bodyMat,0,spec.h/2,0,spec.w,spec.h,spec.d);
  body.userData.structureIndex=index;
  mesh(root,unitBox,roofMat,0,spec.h+.17,0,spec.w+.3,.34,spec.d+.3);
  const countX=Math.max(2,Math.floor(spec.w/.92));
  const rows=Math.max(3,Math.floor(spec.h/1.8));
  const windowCount=countX*rows*2;
  const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(.54,.82,.06),windowMat,windowCount);
  windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  let cursor=0;
  for(let side of [-1,1]){
    for(let r=0;r<rows;r++){
      for(let c=0;c<countX;c++){
        _object.position.set((c-(countX-1)/2)*.88,1.2+r*1.7,side*(spec.d/2+.036));
        _object.rotation.set(0,0,0);
        _object.scale.setScalar(1);
        _object.updateMatrix();
        windows.setMatrixAt(cursor++,_object.matrix);
      }
    }
  }
  windows.instanceMatrix.needsUpdate=true;
  root.add(windows);

  const outlineGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(spec.w+.28,spec.h+.48,spec.d+.28));
  const outline=new THREE.LineSegments(outlineGeo,new THREE.LineBasicMaterial({
    color:0x7ce8e5,transparent:true,opacity:.90,depthTest:false
  }));
  outline.position.set(spec.x,spec.h/2,spec.z);
  outline.visible=false;
  const baseMat=new THREE.MeshStandardMaterial({color:0x36505c,roughness:.9});
  const base=mesh(root,unitBox,baseMat,0,.05,0,spec.w+1,.22,spec.d+1);

  return {spec,root,body,outline,mat:{bodyMat,roofMat,windowMat,baseMat},broken:false,restoreTime:0};
}

function ridgeGeometry(startX,span,heights,baseZ){
  const vertices=[];
  const segment=span/(heights.length-1);
  for(let i=0;i<heights.length-1;i++){
    const xa=startX+i*segment, xb=xa+segment;
    vertices.push(xa,-.07,baseZ, xa,heights[i],baseZ, xb,heights[i+1],baseZ);
    vertices.push(xa,-.07,baseZ, xb,heights[i+1],baseZ, xb,-.07,baseZ);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return geometry;
}

export class StructureLab {
  constructor(scene){
    this.scene=scene;
    this.group=new THREE.Group();
    scene.add(this.group);
    this.buildings=BUILDING_SPECS.map((spec,index)=>{
      const building=constructBuilding(spec,index);
      this.group.add(building.root);
      scene.add(building.outline);
      return building;
    });
    this.selected=0;
    this.pulses=[];
    this.maxDebris=360;
    this.debrisCursor=0;
    this.debrisBodies=Array(this.maxDebris).fill(null);
    this.debris=new THREE.InstancedMesh(
      new THREE.BoxGeometry(.55,.5,.55),
      new THREE.MeshStandardMaterial({color:0xbcd4df,metalness:.12,roughness:.83}),
      this.maxDebris
    );
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled=false;
    scene.add(this.debris);
    this.clearDebris();

    const ridgeMat=new THREE.MeshStandardMaterial({
      color:0x1a3948,roughness:1,side:THREE.DoubleSide,flatShading:true
    });
    const heights=[4,6,9,7,11,8,6,13,9,6,10,12,7,5,8,4,3];
    this.ridge=mesh(this.group,
      ridgeGeometry(-53,106,heights,-52),
      ridgeMat,0,0,0
    );
    this.ridge.material.transparent=true;
    this.ridge.material.opacity=.9;

    this.emitters={};
    Object.entries(MODES).forEach(([key,info])=>{
      const mat=new THREE.MeshStandardMaterial({
        color:key==='coast'?0x517d8f:0x536e73,metalness:.45,roughness:.6
      });
      const lit=new THREE.MeshStandardMaterial({
        color:info.accent,emissive:info.accent,emissiveIntensity:.35
      });
      const base=new THREE.Group();
      base.position.set(info.x,.20,info.z);
      const platform=mesh(base,unitBox,mat,0,.40,0,4.7,.7,3);
      // Deliberately abstract display sculptures, without functioning mechanism.
      if(key==='self'){
        mesh(base,unitBox,mat,0,1.2,0,3.4,1.2,2.3);
        mesh(base,unitBox,lit,0,2.0,0,1.6,.18,.88);
      }else if(key==='long'){
        mesh(base,unitBox,mat,0,1.28,0,2.4,1.02,1.8);
        mesh(base,unitBox,lit,0,2.0,0,3.1,.16,.45);
      }else{
        mesh(base,new THREE.CylinderGeometry(1.3,1.65,1.2,9),mat,0,1.35,0);
        mesh(base,unitBox,lit,0,2.13,0,2.1,.16,.6);
      }
      const light=new THREE.PointLight(info.accent,2.5,10,2);
      light.position.set(0,2.9,0);
      base.add(light);
      this.group.add(base);
      this.emitters[key]={base,light,lit,platform,mat};
    });
    this.select(0);
  }

  get pickables(){return this.buildings.map(b=>b.body).filter(b=>b.visible&&b.parent?.visible);}

  select(index){
    const clamped=Math.min(this.buildings.length-1,Math.max(0,Math.trunc(index)));
    this.selected=clamped;
    for(let i=0;i<this.buildings.length;i++){
      this.buildings[i].outline.visible=i===clamped;
      this.buildings[i].outline.material.color.setHex(0x7ce8e5);
    }
    return this.buildings[clamped].spec.name;
  }

  get selectedName(){return this.buildings[this.selected].spec.name;}

  clearDebris(){
    for(let i=0;i<this.maxDebris;i++){
      this.debrisBodies[i]=null;
      _object.position.set(0,-1000,0);
      _object.rotation.set(0,0,0);
      _object.scale.setScalar(0);
      _object.updateMatrix();
      this.debris.setMatrixAt(i,_object.matrix);
    }
    this.debris.instanceMatrix.needsUpdate=true;
  }

  restore(index){
    const b=this.buildings[index];
    if(!b)return;
    b.root.visible=true;
    b.broken=false;
    b.restoreTime=0;
  }

  restoreAll(){
    this.buildings.forEach((_,i)=>this.restore(i));
    this.clearDebris();
    for(const effect of this.pulses)this.disposePulse(effect);
    this.pulses.length=0;
  }

  disposePulse(effect){
    this.scene.remove(effect.mesh,effect.light);
    effect.mesh.material.dispose();
    effect.light.dispose();
  }

  play(mode,index,vfx,density=1){
    if(!MODES[mode])return false;
    index=Math.min(this.buildings.length-1,Math.max(0,Math.trunc(index)));
    const b=this.buildings[index];
    if(b.broken)this.restore(index);
    if(this.pulses.length>=5)return false;
    const info=MODES[mode];
    const start=new THREE.Vector3(info.x,info.height,info.z);
    const destination=new THREE.Vector3(b.spec.x,b.spec.h*.56,b.spec.z);
    const material=new THREE.MeshBasicMaterial({
      color:info.accent,transparent:true,opacity:.95,
      blending:THREE.AdditiveBlending,depthWrite:false
    });
    const orb=new THREE.Mesh(pulseGeo,material);
    orb.position.copy(start);
    this.scene.add(orb);
    const light=new THREE.PointLight(info.accent,10,13,2);
    light.position.copy(start);
    this.scene.add(light);
    this.pulses.push({
      mode,index,start,destination,mesh:orb,light,
      elapsed:0,duration:1.0, density:Math.max(.2,Math.min(1,density)),trailClock:0
    });
    return true;
  }

  shatter(index,vfx,density){
    const b=this.buildings[index];
    if(!b||b.broken)return;
    b.root.visible=false;
    b.broken=true;
    b.restoreTime=0;
    const {w,h,d,x,z}=b.spec;
    const maxChunks=Math.max(50,Math.round(115*density));
    const cols=5,rows=Math.max(5,Math.round(h/1.65)),depths=3;
    let counter=0;
    for(let row=0;row<rows&&counter<maxChunks;row++){
      for(let col=0;col<cols&&counter<maxChunks;col++){
        for(let depth=0;depth<depths&&counter<maxChunks;depth++){
          const slot=this.debrisCursor++%this.maxDebris;
          const rx=((col+.5)/cols-.5)*w;
          const ry=((row+.5)/rows)*h;
          const rz=((depth+.5)/depths-.5)*d;
          const randomness=()=>Math.random()-.5;
          const scale=.72+Math.random()*.7;
          const body={
            x:x+rx,y:ry,z:z+rz,
            vx:randomness()*10,vy:Math.random()*9+1,vz:randomness()*10,
            drag:.14,gravity:-23,restitution:.20,friction:.70,
            ttl:5.8+Math.random()*1.8,scale,
            rx:Math.random()*Math.PI,ry:Math.random()*Math.PI,rz:Math.random()*Math.PI,
            spin:2+Math.random()*5
          };
          this.debrisBodies[slot]=body;
          this.debris.setColorAt(slot,_color.setHex(b.spec.shade));
          counter++;
        }
      }
    }
    if(this.debris.instanceColor)this.debris.instanceColor.needsUpdate=true;
    vfx.explode(new THREE.Vector3(x,h*.56,z),0xaee4ed,Math.max(.28,density*.68));
  }

  update(dt,vfx){
    for(let i=this.pulses.length-1;i>=0;i--){
      const fx=this.pulses[i];
      fx.elapsed+=dt;
      const t=Math.min(1,fx.elapsed/fx.duration);
      // Decorative cubic ease and arbitrary arc only; no impact prediction.
      const eased=t*t*(3-2*t);
      const point=new THREE.Vector3().lerpVectors(fx.start,fx.destination,eased);
      point.y+=Math.sin(Math.PI*t)*5.5;
      fx.mesh.position.copy(point);
      fx.light.position.copy(point);
      fx.mesh.scale.setScalar(.95+.28*Math.sin(t*12));
      fx.trailClock+=dt;
      if(fx.trailClock>.055){
        fx.trailClock=0;
        vfx.trail(point,MODES[fx.mode].accent,fx.density*.65);
      }
      if(t>=1){
        this.shatter(fx.index,vfx,fx.density);
        this.disposePulse(fx);
        this.pulses.splice(i,1);
      }
    }

    for(const b of this.buildings){
      if(b.broken){
        b.restoreTime+=dt;
        if(b.restoreTime>12)this.restore(this.buildings.indexOf(b));
      }
    }

    for(let i=0;i<this.maxDebris;i++){
      const body=this.debrisBodies[i];
      if(!body)continue;
      body.ttl-=dt;
      if(body.ttl<=0){
        this.debrisBodies[i]=null;
        _object.position.set(0,-1000,0);
        _object.scale.setScalar(0);
      }else{
        stepBody(body,dt,.1);
        body.rx+=body.spin*.45*dt;
        body.ry+=body.spin*.65*dt;
        body.rz+=body.spin*.25*dt;
        _object.position.set(body.x,body.y,body.z);
        _object.rotation.set(body.rx,body.ry,body.rz);
        _object.scale.setScalar(body.scale*Math.min(1,body.ttl));
      }
      _object.updateMatrix();
      this.debris.setMatrixAt(i,_object.matrix);
    }
    this.debris.instanceMatrix.needsUpdate=true;

    Object.entries(this.emitters).forEach(([mode,e])=>{
      e.light.intensity=this.pulses.some(p=>p.mode===mode)?6:2.5;
    });
  }

  get activeCount(){
    return this.pulses.length+this.debrisBodies.reduce((count,b)=>count+(b?1:0),0);
  }

  setTheme(isLight){
    this.ridge.material.color.setHex(isLight?0x8fb1bb:0x1a3948);
    for(const b of this.buildings){
      b.mat.bodyMat.color.setHex(isLight?0x8ba8b7:b.spec.shade);
      b.mat.roofMat.color.setHex(isLight?0x527989:0x2d566b);
      b.mat.windowMat.color.setHex(isLight?0x315268:0x172e42);
      b.mat.baseMat.color.setHex(isLight?0x7596a5:0x36505c);
      b.outline.material.color.setHex(isLight?0x006d85:0x7ce8e5);
    }
  }
}
