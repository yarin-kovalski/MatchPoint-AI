// Materials and scenery for the welcome experience only. Gameplay assets are untouched.
import * as THREE from 'three';

function rng(seed=761) { return () => { seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296; }; }
function canvasTexture(canvas, color=false) { const t=new THREE.CanvasTexture(canvas);if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t; }

export function createFeltBall(lowPower) {
  const random=rng(234),w=lowPower?1024:2048,h=w/2;
  const color=document.createElement('canvas');color.width=w;color.height=h;const c=color.getContext('2d');
  const height=document.createElement('canvas');height.width=w;height.height=h;const b=height.getContext('2d');
  c.fillStyle='#c9d84c';c.fillRect(0,0,w,h);b.fillStyle='#969696';b.fillRect(0,0,w,h);
  // One continuous, non-intersecting curved seam wraps the two felt panels.
  // The depressed channel and raised felt share the same UV coordinates.
  const seamY=x=>h*(.5+.235*Math.sin(2*Math.PI*x/w*2));
  function stroke(ctx,width,paint){ctx.strokeStyle=paint;ctx.lineWidth=width;ctx.beginPath();for(let x=0;x<=w;x+=2){x?ctx.lineTo(x,seamY(x)):ctx.moveTo(x,seamY(x));}ctx.stroke();}
  stroke(c,21,'#839638');stroke(c,14,'#e7e5ba');stroke(c,7,'#efedcb');
  stroke(b,21,'#494949');stroke(b,9,'#777777');
  for(let i=0;i<(lowPower?90000:280000);i++) {
    const x=random()*w,y=random()*h,seam=Math.abs(y-seamY(x))<10;
    c.strokeStyle=seam?(random()>.5?'#f9f4d841':'#b2b39939'):(random()>.45?'#f0f59b38':'#6c88332c');
    b.strokeStyle=random()>.5?'#dadada80':'#57575750';
    const dx=(random()-.5)*4,dy=(random()-.5)*3;
    c.beginPath();c.moveTo(x,y);c.lineTo(x+dx,y+dy);c.stroke();b.beginPath();b.moveTo(x,y);b.lineTo(x+dx,y+dy);b.stroke();
  }
  const material=new THREE.MeshPhysicalMaterial({map:canvasTexture(color,true),bumpMap:canvasTexture(height),bumpScale:.0018,roughness:.98,metalness:0,sheen:.85,sheenColor:new THREE.Color('#dce67a'),sheenRoughness:1});
  const group=new THREE.Group();
  const core=new THREE.Mesh(new THREE.SphereGeometry(.23,lowPower?48:96,lowPower?32:64),material);core.castShadow=true;core.receiveShadow=true;group.add(core);
  // Short, actual fiber geometry catches side lighting and softens the silhouette.
  // One draw call, no transparent shell sorting or heavy postprocessing.
  const count=lowPower?5500:24000,positions=new Float32Array(count*6),normals=new Float32Array(count*6);
  for(let i=0;i<count;i++) {
    const y=random()*2-1,theta=random()*Math.PI*2,r=Math.sqrt(1-y*y),x=r*Math.cos(theta),z=r*Math.sin(theta);
    const length=.0006+random()*.002;
    const base=i*6;positions.set([x*.2299,y*.2299,z*.2299,x*(.23+length)+(random()-.5)*.0008,y*(.23+length),z*(.23+length)],base);
    normals.set([x,y,z,x,y,z],base);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  const fuzz=new THREE.LineSegments(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:`varying float light; varying float rim; void main(){vec3 n=normalize(mat3(modelMatrix)*normal);vec3 w=(modelMatrix*vec4(position,1.)).xyz;light=.45+.55*max(dot(n,normalize(vec3(-1.,1.,.5))),0.);rim=1.-abs(dot(n,normalize(cameraPosition-w)));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float light; varying float rim; void main(){gl_FragColor=vec4(vec3(.72,.79,.24)*light,.2+.35*rim);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  }));group.add(fuzz);group.userData.fuzz=fuzz;
  return group;
}

export function createResortWorld(scene,renderer,lowPower) {
  scene.background=new THREE.Color('#86acc5');scene.fog=new THREE.Fog('#a8bdc0',52,190);
  scene.add(new THREE.HemisphereLight('#c8dfed','#313b32',1.28));
  const sun=new THREE.DirectionalLight('#ffd39b',3.45);sun.position.set(-24,18,11);sun.castShadow=!lowPower;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-22,right:22,top:26,bottom:-26,near:1,far:95});sun.shadow.normalBias=.025;sun.shadow.bias=-.00008;sun.shadow.radius=3;scene.add(sun);
  const fill=new THREE.DirectionalLight('#b6d6ea',.48);fill.position.set(16,10,-12);scene.add(fill);
  const landscape=new THREE.TextureLoader().load('/pc/media/resort-landscape.png');landscape.colorSpace=THREE.SRGBColorSpace;landscape.anisotropy=4;landscape.repeat.x=-1;landscape.offset.x=1;
  const backdrop=new THREE.Mesh(new THREE.CylinderGeometry(112,112,86,100,1,true,Math.PI*.39,Math.PI*1.22),new THREE.MeshBasicMaterial({map:landscape,side:THREE.BackSide,fog:false,color:'#d9d2c7'}));
  backdrop.position.y=29;scene.add(backdrop);
  // A softly lit sky used for environment reflections, independent of the backdrop.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;const ctx=skyCanvas.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#7daace');g.addColorStop(.46,'#c9e2e9');g.addColorStop(.52,'#ead4ab');g.addColorStop(1,'#59654a');ctx.fillStyle=g;ctx.fillRect(0,0,512,256);
  const glow=ctx.createRadialGradient(80,98,0,80,98,55);glow.addColorStop(0,'#fff6df');glow.addColorStop(.15,'#ffe9bd');glow.addColorStop(1,'#e8d6aa00');ctx.fillStyle=glow;ctx.fillRect(0,0,512,256);
  const envTexture=canvasTexture(skyCanvas,true);envTexture.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);const environment=pmrem.fromEquirectangular(envTexture);scene.environment=environment.texture;scene.environmentIntensity=.55;envTexture.dispose();pmrem.dispose();
  const random=rng(141);
  const terrainGeometry=new THREE.PlaneGeometry(64,72);terrainGeometry.rotateX(-Math.PI/2);
  const terrain=new THREE.Mesh(terrainGeometry,new THREE.MeshStandardMaterial({map:groundTexture(),color:'#53654f',roughness:.98}));terrain.position.y=-.12;terrain.receiveShadow=true;scene.add(terrain);
  const stone=new THREE.MeshStandardMaterial({color:'#b9aa8e',roughness:.9});
  const edging=new THREE.Mesh(new THREE.BoxGeometry(24,.16,39),stone);edging.position.y=-.13;edging.receiveShadow=true;scene.add(edging);
  const retaining=new THREE.Mesh(new THREE.BoxGeometry(29,1.05,.4),new THREE.MeshStandardMaterial({color:'#d0c5ae',roughness:.82}));retaining.position.set(0,.25,-21);retaining.castShadow=retaining.receiveShadow=true;scene.add(retaining);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(10,.18,3.4),stone);deck.position.set(-8.5,.03,-20);deck.receiveShadow=true;scene.add(deck);
  const timber=new THREE.MeshStandardMaterial({color:'#3f342c',roughness:.72});
  for(const x of [-12,-9,-6]){const post=new THREE.Mesh(new THREE.BoxGeometry(.16,3.2,.16),timber);post.position.set(x,1.6,-21);post.castShadow=true;scene.add(post);}
  const pergola=new THREE.Mesh(new THREE.BoxGeometry(7.2,.16,2.8),timber);pergola.position.set(-9,3.2,-21);pergola.castShadow=true;scene.add(pergola);
  for(let z=-22;z<=-20;z+=.42){const slat=new THREE.Mesh(new THREE.BoxGeometry(7.2,.07,.12),timber);slat.position.set(-9,3.3,z);slat.castShadow=true;scene.add(slat);}
  // A low, fine fence frames the court instead of hiding the mountain horizon.
  const fenceMaterial=new THREE.MeshStandardMaterial({color:'#60736a',roughness:.72,metalness:.15});
  const wires=[];
  for(let x=-11;x<=11;x+=2.2){const p=new THREE.Mesh(new THREE.CylinderGeometry(.026,.035,1.75,8),fenceMaterial);p.position.set(x,.875,-18.5);scene.add(p);}
  for(let x=-11;x<11;x+=.22)wires.push(x,.15,-18.5,Math.min(11,x+1.6),1.7,-18.5,x,1.7,-18.5,Math.min(11,x+1.6),.15,-18.5);
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));scene.add(new THREE.LineSegments(wg,new THREE.LineBasicMaterial({color:'#4a675a',transparent:true,opacity:.28})));
  const rail=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,22,8),fenceMaterial);rail.rotation.z=Math.PI/2;rail.position.set(0,1.73,-18.5);scene.add(rail);
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=256;cloudCanvas.height=128;const cc=cloudCanvas.getContext('2d');
  for(let i=0;i<40;i++){const x=45+random()*170,y=42+random()*35,r=15+random()*26;const cg=cc.createRadialGradient(x,y,0,x,y,r);cg.addColorStop(0,'#fff9e923');cg.addColorStop(1,'#fff9e900');cc.fillStyle=cg;cc.fillRect(0,0,256,128);}
  const clouds=new THREE.Group();const cloudMap=canvasTexture(cloudCanvas,true);
  for(let i=0;i<3;i++){const cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudMap,transparent:true,opacity:.23,depthWrite:false,fog:false}));cloud.scale.set(35,13,1);cloud.position.set(-50+i*47,50+i*4,-95);clouds.add(cloud);}scene.add(clouds);
  return { update(t){clouds.position.x=Math.sin(t*.015)*3;},dispose(){environment.dispose();} };
}

export function refineWelcomeRacket(model) {
  const weave=document.createElement('canvas');weave.width=128;weave.height=128;const c=weave.getContext('2d');c.fillStyle='#777';c.fillRect(0,0,128,128);
  for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){c.fillStyle=(x/4+y/4)%2?'#555':'#aaa';c.fillRect(x,y,3,3);}
  const t=canvasTexture(weave);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,8);
  model.traverse(n=>{if(!n.isMesh)return;const m=n.material;if(m.name==='premiumCompositeFrame'){m.color.set('#243b35');m.roughness=.29;m.metalness=.25;m.clearcoat=.8;m.bumpMap=t;m.bumpScale=.0008;}if(m.name==='premiumStrings'){m.color.set('#d9d1aa');m.roughness=.58;}if(m.name==='premiumGrip'){m.color.set('#d7d3bf');m.bumpScale=.006;}});
}

export function createPracticeCone() {
  const cone=new THREE.Group();const rubber=new THREE.MeshStandardMaterial({color:'#c76c36',roughness:.56});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.025,.14,.46,28,1,true),rubber);body.position.y=.26;body.castShadow=true;cone.add(body);
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.084,.105,.08,28),new THREE.MeshStandardMaterial({color:'#f1e8d0',roughness:.65}));collar.position.y=.24;cone.add(collar);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.2,.21,.045,8),new THREE.MeshStandardMaterial({color:'#774332',roughness:.8}));base.position.y=.023;base.castShadow=true;cone.add(base);
  const lip=new THREE.Mesh(new THREE.TorusGeometry(.025,.007,6,28),rubber);lip.rotation.x=Math.PI/2;lip.position.y=.49;cone.add(lip);return cone;
}

function groundTexture(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d'),random=rng(197);
 ctx.fillStyle='#7c875b';ctx.fillRect(0,0,512,512);
 for(let i=0;i<60000;i++){ctx.fillStyle=['#4c614c35','#bab88b45','#69784d55','#d0c49925'][i%4];ctx.fillRect(random()*512,random()*512,.4+random()*2,.4+random()*3);}
 const t=canvasTexture(canvas,true);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(70,60);return t;
}
