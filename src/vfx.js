import * as THREE from 'three';
import { stepBody } from './physics.js';

const VERTEX_SHADER = [
  'attribute float aSize;',
  'attribute float aAlpha;',
  'attribute vec3 aColor;',
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  vAlpha = aAlpha;',
  '  vColor = aColor;',
  '  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = clamp(aSize * (200.0 / max(3.0, -viewPos.z)), 1.0, 58.0);',
  '  gl_Position = projectionMatrix * viewPos;',
  '}'
].join('\n');

const FRAGMENT_SHADER = [
  'varying float vAlpha;',
  'varying vec3 vColor;',
  'void main() {',
  '  float d = length(gl_PointCoord - vec2(0.5));',
  '  float softDisc = 1.0 - smoothstep(0.05, 0.5, d);',
  '  gl_FragColor = vec4(vColor, softDisc * vAlpha);',
  '}'
].join('\n');

const FLASH_GEO=new THREE.SphereGeometry(1,12,10);
const RING_GEO=new THREE.TorusGeometry(1,.045,6,60);
const SHARD_GEO=new THREE.BoxGeometry(.17,.2,.14);
const _tempColor=new THREE.Color();
const _tempObject=new THREE.Object3D();

class ParticlePool {
  constructor(scene,capacity,smoke=false) {
    this.capacity=capacity;this.smoke=smoke;this.cursor=0;this.live=0;
    this.positions=new Float32Array(capacity*3);
    this.colors=new Float32Array(capacity*3);
    this.sizes=new Float32Array(capacity);
    this.baseSizes=new Float32Array(capacity);
    this.alphas=new Float32Array(capacity);
    this.life=new Float32Array(capacity);
    this.lifeMax=new Float32Array(capacity);
    this.vx=new Float32Array(capacity);
    this.vy=new Float32Array(capacity);
    this.vz=new Float32Array(capacity);
    this.gravity=new Float32Array(capacity);
    for(let i=0;i<capacity;i++)this.positions[i*3+1]=-1000;
    const geometry=new THREE.BufferGeometry();
    this.positionAttr=new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr=new THREE.BufferAttribute(this.alphas,1).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr=new THREE.BufferAttribute(this.sizes,1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr=new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',this.positionAttr);
    geometry.setAttribute('aColor',this.colorAttr);
    geometry.setAttribute('aSize',this.sizeAttr);
    geometry.setAttribute('aAlpha',this.alphaAttr);
    const material=new THREE.ShaderMaterial({
      vertexShader:VERTEX_SHADER,fragmentShader:FRAGMENT_SHADER,
      transparent:true,depthWrite:false,depthTest:true,
      blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending
    });
    this.points=new THREE.Points(geometry,material);
    this.points.frustumCulled=false;
    this.points.renderOrder=smoke?2:3;
    scene.add(this.points);
  }

  spawn(position,velocity,color,life,size,gravity=0) {
    const i=this.cursor++%this.capacity;
    const j=i*3;
    this.positions[j]=position.x;this.positions[j+1]=position.y;this.positions[j+2]=position.z;
    this.vx[i]=velocity.x;this.vy[i]=velocity.y;this.vz[i]=velocity.z;
    this.life[i]=life;this.lifeMax[i]=life;this.gravity[i]=gravity;
    this.baseSizes[i]=size;this.sizes[i]=size;
    this.alphas[i]=this.smoke?.38:.95;
    _tempColor.setHex(color);
    this.colors[j]=_tempColor.r;this.colors[j+1]=_tempColor.g;this.colors[j+2]=_tempColor.b;
    this.colorAttr.needsUpdate=true;
  }

  update(dt) {
    let live=0;
    const drag=Math.exp(-(this.smoke?.8:.56)*dt);
    for(let i=0;i<this.capacity;i++){
      if(this.life[i]<=0)continue;
      this.life[i]-=dt;
      if(this.life[i]<=0){this.life[i]=0;this.alphas[i]=0;continue;}
      live++;
      const j=i*3;
      this.vx[i]*=drag;this.vy[i]=this.vy[i]*drag+this.gravity[i]*dt;this.vz[i]*=drag;
      this.positions[j]+=this.vx[i]*dt;
      this.positions[j+1]+=this.vy[i]*dt;
      this.positions[j+2]+=this.vz[i]*dt;
      const ratio=this.life[i]/this.lifeMax[i];
      this.alphas[i]=(this.smoke?.34:.95)*Math.pow(ratio,this.smoke?.86:1.6);
      this.sizes[i]=this.baseSizes[i]*(this.smoke?1+(1-ratio)*1.65:.65+ratio*.35);
    }
    this.live=live;
    this.positionAttr.needsUpdate=true;
    this.alphaAttr.needsUpdate=true;
    this.sizeAttr.needsUpdate=true;
  }

  clear(){
    this.life.fill(0);this.alphas.fill(0);this.live=0;this.cursor=0;
    this.alphaAttr.needsUpdate=true;
  }
}

class ShardPool {
  constructor(scene,capacity=120) {
    this.capacity=capacity;this.cursor=0;this.live=0;this.bodies=new Array(capacity).fill(null);
    this.mesh=new THREE.InstancedMesh(
      SHARD_GEO,
      new THREE.MeshStandardMaterial({color:0xb6d4d3,metalness:.75,roughness:.37,side:THREE.DoubleSide}),
      capacity
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled=false;
    scene.add(this.mesh);
    this.clear();
  }

  spawn(origin,velocity,color) {
    const i=this.cursor++%this.capacity;
    this.bodies[i]={
      x:origin.x,y:origin.y,z:origin.z,
      vx:velocity.x,vy:velocity.y,vz:velocity.z,
      gravity:-24,drag:.1,restitution:.26,friction:.62,
      ttl:4.5+Math.random()*1.4,
      rx:Math.random()*Math.PI*2,ry:Math.random()*Math.PI*2,rz:Math.random()*Math.PI*2,
      spin:1+Math.random()*7,scale:.55+Math.random()*.95
    };
    this.mesh.setColorAt(i,_tempColor.setHex(color));
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }

  update(dt) {
    let live=0;
    for(let i=0;i<this.capacity;i++){
      const b=this.bodies[i];
      if(!b)continue;
      b.ttl-=dt;
      if(b.ttl<=0){
        this.bodies[i]=null;
        _tempObject.position.set(0,-1000,0);
        _tempObject.scale.setScalar(0);
      }else{
        live++;
        stepBody(b,dt,.05);
        b.rx+=b.spin*.7*dt;b.ry+=b.spin*dt;b.rz+=b.spin*.4*dt;
        _tempObject.position.set(b.x,b.y,b.z);
        _tempObject.rotation.set(b.rx,b.ry,b.rz);
        _tempObject.scale.setScalar(b.scale*Math.min(1,b.ttl));
      }
      _tempObject.updateMatrix();
      this.mesh.setMatrixAt(i,_tempObject.matrix);
    }
    this.live=live;
    this.mesh.instanceMatrix.needsUpdate=true;
  }

  clear() {
    for(let i=0;i<this.capacity;i++){
      this.bodies[i]=null;
      _tempObject.position.set(0,-1000,0);
      _tempObject.rotation.set(0,0,0);
      _tempObject.scale.setScalar(0);
      _tempObject.updateMatrix();
      this.mesh.setMatrixAt(i,_tempObject.matrix);
    }
    this.live=0;this.cursor=0;
    this.mesh.instanceMatrix.needsUpdate=true;
  }
}

function randomDirection(){
  const x=Math.random()*2-1;
  const y=Math.random()*2-1;
  const z=Math.random()*2-1;
  const length=Math.hypot(x,y,z)||1;
  return {x:x/length,y:y/length,z:z/length};
}

export class VFX {
  constructor(scene) {
    this.scene=scene;
    this.spark=new ParticlePool(scene,1600,false);
    this.smoke=new ParticlePool(scene,750,true);
    this.shards=new ShardPool(scene,110);
    this.explosions=[];
  }

  trail(position,color,density=1) {
    const count=Math.max(1,Math.round(density*3));
    for(let i=0;i<count;i++){
      const vel={x:(Math.random()-.5)*2,y:-3-Math.random()*4,z:(Math.random()-.5)*2};
      this.spark.spawn(position,vel,Math.random()>.35?0xffca75:color,.30+Math.random()*.36,.95+Math.random()*1.15,-1);
    }
    if(Math.random()<density*1.2){
      this.smoke.spawn(position,
        {x:(Math.random()-.5)*1.6,y:-.3+Math.random()*1.7,z:(Math.random()-.5)*1.6},
        0x8295a2,1.15+Math.random()*.8,3.8+Math.random()*3.3,1);
    }
  }

  explode(position,color,density=1) {
    // Pure VFX: spark bloom, smoke bloom, springy debris and fading rings.
    // Values are artistic scene units, not a physical blast simulation.
    const count=Math.round(180*density);
    for(let i=0;i<count;i++){
      const dir=randomDirection();
      const speed=5+Math.random()*18;
      const tint=i%4===0?0xfff1c5:i%4===1?0xffad62:i%4===2?color:0xff7846;
      this.spark.spawn(position,
        {x:dir.x*speed,y:dir.y*speed,z:dir.z*speed},
        tint,.5+Math.random()*1.65,1.2+Math.random()*2.0,-5);
    }
    const smokeCount=Math.round(55*density);
    for(let i=0;i<smokeCount;i++){
      const dir=randomDirection();const speed=2+Math.random()*6;
      this.smoke.spawn(position,
        {x:dir.x*speed,y:dir.y*speed+1.5,z:dir.z*speed},
        i%3===0?0x948b87:0x697b86,1.5+Math.random()*2.1,5+Math.random()*5,1);
    }
    const shardCount=Math.round(35*density);
    for(let i=0;i<shardCount;i++){
      const dir=randomDirection();const speed=4+Math.random()*12;
      this.shards.spawn(position,{x:dir.x*speed,y:dir.y*speed,z:dir.z*speed},i%3===0?color:0x718d96);
    }

    const ringMaterial=new THREE.MeshBasicMaterial({
      color:0x86e9e4,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending
    });
    const ring=new THREE.Mesh(RING_GEO,ringMaterial);
    ring.position.copy(position);ring.rotation.x=.4;this.scene.add(ring);
    const glowMaterial=new THREE.MeshBasicMaterial({
      color:0xffae68,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending
    });
    const glow=new THREE.Mesh(FLASH_GEO,glowMaterial);
    glow.position.copy(position);this.scene.add(glow);
    const light=new THREE.PointLight(0xffb978,26,26,2);
    light.position.copy(position);this.scene.add(light);
    this.explosions.push({ring,glow,light,life:0,maxLife:1.15});
    if(this.explosions.length>12)this.removeExplosion(this.explosions.shift());
  }

  removeExplosion(effect){
    this.scene.remove(effect.ring,effect.glow,effect.light);
    effect.ring.material.dispose();
    effect.glow.material.dispose();
    effect.light.dispose();
  }

  update(dt) {
    this.spark.update(dt);this.smoke.update(dt);this.shards.update(dt);
    for(let i=this.explosions.length-1;i>=0;i--){
      const e=this.explosions[i];
      e.life+=dt;
      const t=Math.min(1,e.life/e.maxLife);
      e.ring.scale.setScalar(.3+t*10);
      e.ring.material.opacity=(1-t)*.82;
      e.glow.scale.setScalar(.5+t*4.4);
      e.glow.material.opacity=Math.max(0,.85-t*2.4);
      e.light.intensity=Math.max(0,24*(1-t*2));
      if(e.life>=e.maxLife){
        this.removeExplosion(e);
        this.explosions.splice(i,1);
      }
    }
  }

  get activeCount(){return this.spark.live+this.smoke.live+this.shards.live;}

  clear(){
    this.spark.clear();this.smoke.clear();this.shards.clear();
    this.explosions.forEach(e=>this.removeExplosion(e));
    this.explosions.length=0;
  }
}
