/**
 * 像素方块世界 - 机器人实体系统（AI完全体版 v2）
 * 包含：ScoutBot、HeavyBot、BuilderBot（自主建造）的体素模型、智能AI、建筑模板
 * 参考：【当AI完全体进入我的世界！！】
 */
import * as THREE from 'three';
import { BlockType, isSolid, CHUNK_SIZE } from './voxel.js?v=1783823000';

/* ============================================
   常量配置
   ============================================ */
const SCOUT_COUNT = 5;
const HEAVY_COUNT = 3;
const MOBILE_SCOUT_COUNT = 2;
const MOBILE_HEAVY_COUNT = 1;
const SPAWN_RADIUS = 25;
const MIN_SPAWN_DIST = 4;
const WANDER_RANGE = 20;

/* ============================================
   工具函数
   ============================================ */
function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function seedRand(x, z) {
  let h = (x * 374761393 + z * 668265263) ^ 1274126177;
  h = ((h ^ (h >> 13)) * 1274126177);
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

/* ============================================
   建筑模板 — 机器人可自主建造的结构
   ============================================ */
const STRUCTURES = {
  smallHouse: {
    name: '小房子',
    icon: '🏠',
    blocks: (() => {
      const b = [];
      // 地板 5x5
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        b.push({ x, y: 0, z, type: BlockType.COBBLESTONE });
      // 墙壁 3层
      for (let y = 1; y <= 3; y++) {
        for (let x = 0; x < 5; x++) {
          b.push({ x, y, z: 0, type: BlockType.WOOD });
          b.push({ x, y, z: 4, type: BlockType.WOOD });
        }
        for (let z = 1; z < 4; z++) {
          b.push({ x: 0, y, z, type: BlockType.WOOD });
          b.push({ x: 4, y, z, type: BlockType.WOOD });
        }
      }
      // 门洞
      b.push({ x: 2, y: 1, z: 0, type: BlockType.AIR });
      b.push({ x: 2, y: 2, z: 0, type: BlockType.AIR });
      // 窗户
      b.push({ x: 1, y: 2, z: 4, type: BlockType.GLASS });
      b.push({ x: 3, y: 2, z: 4, type: BlockType.GLASS });
      // 屋顶
      for (let x = 0; x < 5; x++) for (let z = -1; z <= 5; z++)
        b.push({ x, y: 4, z, type: BlockType.STONE });
      for (let x = 1; x < 4; x++) for (let z = 0; z <= 4; z++)
        b.push({ x, y: 5, z, type: BlockType.STONE });
      for (let x = 1; x < 4; x++) for (let z = 1; z <= 3; z++)
        b.push({ x, y: 6, z, type: BlockType.STONE });
      // 室内光源
      b.push({ x: 2, y: 3, z: 3, type: BlockType.GLASS });
      return b;
    })(),
  },

  watchtower: {
    name: '瞭望塔',
    icon: '🗼',
    blocks: (() => {
      const b = [];
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++)
        b.push({ x, y: 0, z, type: BlockType.STONE });
      for (let y = 1; y < 6; y++) {
        b.push({ x: 0, y, z: 0, type: BlockType.COBBLESTONE });
        b.push({ x: 0, y, z: 2, type: BlockType.COBBLESTONE });
        b.push({ x: 2, y, z: 0, type: BlockType.COBBLESTONE });
        b.push({ x: 2, y, z: 2, type: BlockType.COBBLESTONE });
      }
      for (let x = -1; x <= 3; x++) for (let z = -1; z <= 3; z++)
        b.push({ x, y: 6, z, type: BlockType.WOOD });
      for (let x = -1; x <= 3; x++) {
        b.push({ x, y: 7, z: -1, type: BlockType.WOOD });
        b.push({ x, y: 7, z: 3, type: BlockType.WOOD });
      }
      for (let z = -1; z <= 3; z++) {
        b.push({ x: -1, y: 7, z, type: BlockType.WOOD });
        b.push({ x: 3, y: 7, z, type: BlockType.WOOD });
      }
      b.push({ x: 1, y: 7, z: 1, type: BlockType.GLASS });
      return b;
    })(),
  },

  wall: {
    name: '围墙',
    icon: '🧱',
    blocks: (() => {
      const b = [];
      for (let x = 0; x < 12; x++) {
        for (let y = 0; y < 3; y++)
          b.push({ x, y, z: 0, type: BlockType.COBBLESTONE });
        if (x % 2 === 0) b.push({ x, y: 3, z: 0, type: BlockType.MOSSY_COBBLESTONE });
      }
      return b;
    })(),
  },

  pixelHeart: {
    name: '像素爱心',
    icon: '💗',
    blocks: (() => {
      const heart = [
        '...@@...@@...',
        '..@@@@.@@@@..',
        '.@@@@@@@@@@@.',
        '.@@@@@@@@@@@.',
        '..@@@@@@@@@..',
        '...@@@@@@@...',
        '....@@@@@....',
        '.....@@@.....',
        '......@......',
      ];
      const b = [];
      for (let row = 0; row < heart.length; row++)
        for (let col = 0; col < heart[row].length; col++)
          if (heart[row][col] === '@')
            b.push({ x: col, y: 0, z: row, type: BlockType.BILIBILI_PINK });
      return b;
    })(),
  },

  bridge: {
    name: '桥梁',
    icon: '🌉',
    blocks: (() => {
      const b = [];
      for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 2; z++) b.push({ x, y: 0, z, type: BlockType.WOOD });
        b.push({ x, y: 1, z: -1, type: BlockType.WOOD });
        b.push({ x, y: 1, z: 2, type: BlockType.WOOD });
      }
      return b;
    })(),
  },
};

const STRUCTURE_KEYS = Object.keys(STRUCTURES);

/* ============================================
   机器人基类
   ============================================ */
class Robot {
  constructor(scene, world, x, y, z) {
    this.scene = scene;
    this.world = world;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3();
    this.rotation = 0;
    this.targetRotation = 0;
    this.state = 'idle'; // idle | wander | patrol | follow
    this.stateTimer = randRange(2, 5);
    this.wanderTarget = null;
    this.wanderSpeed = 1.5;
    this.turnSpeed = 2.0;
    this.collisionWidth = 0.4;
    this.collisionHeight = 0.8;
    this.onGround = true;
    this.jumpCooldown = 0;
    this._animParts = [];
    this._animTimer = 0;
    this._animPhase = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;
    scene.add(this.group);
  }

  _getGroundY(px, pz) {
    for (let y = 40; y >= 0; y--) {
      const block = this.world.getBlock(Math.floor(px), y, Math.floor(pz));
      if (isSolid(block)) return y + 1;
    }
    return 0;
  }

  _isSafeStep(px, py, pz) {
    const hw = this.collisionWidth * 0.5;
    const hh = this.collisionHeight;
    for (let dy = 0; dy <= Math.ceil(hh); dy++) {
      for (let dx = -hw; dx <= hw; dx += hw) {
        for (let dz = -hw; dz <= hw; dz += hw) {
          const bx = Math.floor(px + dx), by = Math.floor(py + dy), bz = Math.floor(pz + dz);
          if (isSolid(this.world.getBlock(bx, by, bz))) return false;
        }
      }
    }
    return true;
  }

  _animateLimbs(dt) {
    this._animTimer += dt;
    this._animPhase = Math.sin(this._animTimer * 8) * 0.3;
    for (const part of this._animParts) {
      if (part.userData && part.userData.animAxis) {
        part.rotation[part.userData.animAxis] = this._animPhase;
      } else {
        part.rotation.x = this._animPhase * 0.5;
      }
    }
  }

  _resetLimbs() {
    for (const part of this._animParts) {
      part.rotation.x += (0 - part.rotation.x) * 0.1;
      part.rotation.z += (0 - part.rotation.z) * 0.1;
    }
  }

  update(dt, center) {
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    this.stateTimer -= dt;

    // 状态转换
    if (this.state === 'idle' && this.stateTimer <= 0) {
      this.state = 'wander';
      const angle = Math.random() * Math.PI * 2;
      const dist = randRange(3, WANDER_RANGE);
      this.wanderTarget = new THREE.Vector3(
        center.x + Math.cos(angle) * dist, 0,
        center.z + Math.sin(angle) * dist
      );
      this.stateTimer = randRange(4, 10);
    } else if (this.state === 'wander' && this.stateTimer <= 0) {
      this.state = 'idle';
      this.wanderTarget = null;
      this.stateTimer = randRange(1, 4);
      this._resetLimbs();
    }

    // 执行行为
    if (this.state === 'wander' && this.wanderTarget) {
      this._doWander(dt);
    }
  }

  _doWander(dt) {
    const dx = this.wanderTarget.x - this.position.x;
    const dz = this.wanderTarget.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1.0) {
      this.state = 'idle';
      this.wanderTarget = null;
      this.stateTimer = randRange(1, 4);
      this._resetLimbs();
      return;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const step = this.wanderSpeed * dt;
    const nx = this.position.x + dirX * step;
    const nz = this.position.z + dirZ * step;
    const ny = this._getGroundY(nx, nz);

    if (this._isSafeStep(nx, ny, nz)) {
      this.position.x = nx;
      this.position.z = nz;
      this.position.y = ny;
    }
    this.targetRotation = Math.atan2(dirZ, dirX);
    this._animateLimbs(dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
}

/* ============================================
   轻型侦察机器人 (ScoutBot)
   ============================================ */
export class ScoutBot extends Robot {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.collisionWidth = 0.3;
    this.collisionHeight = 0.6;
    this.wanderSpeed = 3.5;
    this.turnSpeed = 5.0;
    this._buildModel();
  }

  _buildModel() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xC0C0C0 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x505050 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x4488FF });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.45), bodyMat);
    body.position.set(0, 0.35, 0);
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.3), darkMat);
    head.position.set(0, 0.55, 0.15);
    this.group.add(head);

    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.03), eyeMat);
    eye.position.set(0, 0.58, 0.32);
    eye.name = 'eye';
    this.group.add(eye);

    const antGeo = new THREE.BoxGeometry(0.03, 0.25, 0.03);
    const ant = new THREE.Mesh(antGeo, darkMat);
    ant.position.set(0, 0.78, 0.12);
    this.group.add(ant);
    const ball = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xFF3333 }));
    ball.position.set(0, 0.92, 0.12);
    ball.name = 'antennaBall';
    this.group.add(ball);

    const legs = [[0.12, 0.18, 0.15], [-0.12, 0.18, 0.15], [0.12, 0.18, -0.15], [-0.12, 0.18, -0.15]];
    for (const [lx, ly, lz] of legs) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), darkMat);
      leg.position.set(lx, ly, lz);
      this.group.add(leg);
      this._animParts.push(leg);
    }
  }

  update(dt, center) {
    super.update(dt, center);
    // 天线闪烁
    const ball = this.group.getObjectByName('antennaBall');
    if (ball) ball.material.color.setRGB(0.5 + Math.sin(Date.now() * 0.01) * 0.5, 0.2, 0.2);
    const eye = this.group.getObjectByName('eye');
    if (eye) eye.material.color.setRGB(0.2, 0.2, 0.5 + Math.sin(Date.now() * 0.008) * 0.5);
  }

  getInfo() {
    return { name: 'ScoutBot', type: '侦察机器人', status: this.state === 'wander' ? '巡逻中' : '待命', color: '银灰' };
  }
}

/* ============================================
   重型机器人 (HeavyBot)
   ============================================ */
export class HeavyBot extends Robot {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.collisionWidth = 0.5;
    this.collisionHeight = 0.9;
    this.wanderSpeed = 1.2;
    this.turnSpeed = 1.5;
    this._buildModel();
  }

  _buildModel() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3A3A3A });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFF8800 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), bodyMat);
    body.position.set(0, 0.45, 0);
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.4), darkMat);
    head.position.set(0, 0.72, 0.2);
    this.group.add(head);

    const eyeGeo = new THREE.BoxGeometry(0.1, 0.07, 0.03);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.09, 0.76, 0.42);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(-0.09, 0.76, 0.42);
    this.group.add(eyeR);

    const antGeo = new THREE.BoxGeometry(0.04, 0.2, 0.04);
    const ant = new THREE.Mesh(antGeo, darkMat);
    ant.position.set(0, 0.96, 0.18);
    this.group.add(ant);
    const ball = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xFF6600 }));
    ball.position.set(0, 1.08, 0.18);
    ball.name = 'antennaBallH';
    this.group.add(ball);

    const legGeo = new THREE.BoxGeometry(0.1, 0.28, 0.1);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2A2A2A });
    const legPos = [[0.15, 0.2, 0.2], [-0.15, 0.2, 0.2], [0.15, 0.2, -0.2], [-0.15, 0.2, -0.2]];
    for (const [lx, ly, lz] of legPos) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, ly, lz);
      this.group.add(leg);
      this._animParts.push(leg);
    }
  }

  update(dt, center) {
    super.update(dt, center);
    const ball = this.group.getObjectByName('antennaBallH');
    if (ball) ball.material.color.setRGB(1, 0.3 + Math.sin(Date.now() * 0.005) * 0.3, 0);
  }

  getInfo() {
    return { name: 'HeavyBot', type: '重型机器人', status: this.state === 'wander' ? '巡逻中' : '待命', color: '暗灰' };
  }
}

/* ============================================
   建造机器人 (BuilderBot) — 自主AI建造者
   能自动建造房屋、围墙、塔楼、像素艺术等
   ============================================ */
export class BuilderBot extends Robot {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.collisionWidth = 0.6;
    this.collisionHeight = 1.0;
    this.wanderSpeed = 1.8;
    this.turnSpeed = 3.0;
    this.antennaAngle = 0;

    this.buildMode = false;
    this.buildTarget = null;
    this.buildQueue = [];
    this.buildCooldown = 0;
    this.followingPlayer = false;
    this.playerTarget = null;
    this.currentStructure = null;
    this.buildProgress = 0;
    this.totalBlocks = 0;
    this.buildOrigin = null;
    this.particles = [];
    this.autoBuildDelay = 2 + Math.random() * 3; // 2-5秒后自动建造
    this._autoBuildTriggered = false;

    this._buildModel();
  }

  _buildModel() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4A90D9 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1E3A5F });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00FF88 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.8), bodyMat);
    body.position.set(0, 0.5, 0);
    this.group.add(body);

    const corePanel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.05), darkMat);
    corePanel.position.set(0, 0.55, 0.43);
    this.group.add(corePanel);

    const aiCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.03), glowMat);
    aiCore.position.set(0, 0.55, 0.46);
    aiCore.name = 'aiCore';
    this.group.add(aiCore);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.4), bodyMat);
    head.position.set(0, 0.82, 0.25);
    this.group.add(head);

    const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.03), darkMat);
    faceplate.position.set(0, 0.82, 0.47);
    this.group.add(faceplate);

    const eyeGeo = new THREE.BoxGeometry(0.08, 0.06, 0.02);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.08, 0.88, 0.49);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(-0.08, 0.88, 0.49);
    this.group.add(eyeR);

    const antGeo = new THREE.BoxGeometry(0.04, 0.22, 0.04);
    const antC = new THREE.Mesh(antGeo, darkMat);
    antC.position.set(0, 1.08, 0.22);
    this.group.add(antC);
    const ballC = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), accentMat);
    ballC.position.set(0, 1.2, 0.22);
    ballC.name = 'antennaBallC';
    this.group.add(ballC);

    const antL = new THREE.Mesh(antGeo, darkMat);
    antL.position.set(0.12, 1.05, 0.22);
    this.group.add(antL);
    const ballL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), accentMat);
    ballL.position.set(0.12, 1.17, 0.22);
    ballL.name = 'antennaBallL2';
    this.group.add(ballL);

    const antR = new THREE.Mesh(antGeo, darkMat);
    antR.position.set(-0.12, 1.05, 0.22);
    this.group.add(antR);
    const ballR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), accentMat);
    ballR.position.set(-0.12, 1.17, 0.22);
    ballR.name = 'antennaBallR2';
    this.group.add(ballR);

    const armGeo = new THREE.BoxGeometry(0.12, 0.35, 0.15);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x3A5F8F });
    const armL2 = new THREE.Mesh(armGeo, armMat);
    armL2.position.set(0.36, 0.45, 0.1);
    this.group.add(armL2);
    this._animParts.push(armL2);
    const armR2 = new THREE.Mesh(armGeo, armMat);
    armR2.position.set(-0.36, 0.45, 0.1);
    this.group.add(armR2);
    this._animParts.push(armR2);

    const toolGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
    const toolL = new THREE.Mesh(toolGeo, accentMat);
    toolL.position.set(0.36, 0.28, 0.18);
    toolL.name = 'buildToolL';
    this.group.add(toolL);
    const toolR = new THREE.Mesh(toolGeo, accentMat);
    toolR.position.set(-0.36, 0.28, 0.18);
    toolR.name = 'buildToolR';
    this.group.add(toolR);

    const legGeo = new THREE.BoxGeometry(0.14, 0.32, 0.14);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x5A7FAF });
    const legs = [[0.15, 0.16, 0.22], [-0.15, 0.16, 0.22], [0.15, 0.16, -0.22], [-0.15, 0.16, -0.22]];
    for (const [lx, ly, lz] of legs) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, ly, lz);
      this.group.add(leg);
      this._animParts.push(leg);
    }
  }

  _animateAntenna(dt) {
    this.antennaAngle += dt * 3;
    const ballC = this.group.getObjectByName('antennaBallC');
    if (ballC) ballC.position.y = 1.2 + Math.sin(this.antennaAngle) * 0.02;
    const ballL = this.group.getObjectByName('antennaBallL2');
    if (ballL) ballL.position.x = 0.12 + Math.sin(this.antennaAngle * 1.5) * 0.02;
    const ballR = this.group.getObjectByName('antennaBallR2');
    if (ballR) ballR.position.x = -0.12 - Math.sin(this.antennaAngle * 1.5) * 0.02;
    const aiCore = this.group.getObjectByName('aiCore');
    if (aiCore) {
      const pulse = this.buildMode ? (0.5 + Math.sin(this.antennaAngle * 4) * 0.5) : (0.5 + Math.sin(this.antennaAngle * 2) * 0.5);
      aiCore.material.color.setRGB(pulse, 1, pulse);
    }
  }

  /** 开始建造指定结构 */
  startBuilding(structureName, originX, originY, originZ) {
    const template = STRUCTURES[structureName];
    if (!template) return false;
    this.buildMode = true;
    this.currentStructure = structureName;
    this.buildOrigin = { x: originX, y: originY, z: originZ };
    this.buildQueue = template.blocks.map(b => ({
      x: originX + b.x,
      y: originY + b.y,
      z: originZ + b.z,
      type: b.type,
    }));
    this.totalBlocks = this.buildQueue.length;
    this.buildProgress = 0;
    this.buildTarget = null;
    return true;
  }

  /** 在玩家附近随机建造 */
  startRandomBuildNearPlayer(playerPos) {
    const key = STRUCTURE_KEYS[Math.floor(Math.random() * STRUCTURE_KEYS.length)];
    const template = STRUCTURES[key];
    const angle = Math.random() * Math.PI * 2;
    const dist = randRange(5, 15);
    const ox = Math.floor(playerPos.x + Math.cos(angle) * dist);
    const oz = Math.floor(playerPos.z + Math.sin(angle) * dist);
    let oy = 20;
    for (let y = 40; y >= 1; y--) {
      if (isSolid(this.world.getBlock(ox, y, oz))) { oy = y + 1; break; }
    }
    if (oy < 1 || oy > 40) return false;
    this.setFollowPlayer(null);
    this.stopFollow();
    return this.startBuilding(key, ox, oy, oz);
  }

  setFollowPlayer(playerPos) {
    this.followingPlayer = true;
    // 容错：接受 Player 对象、Vector3 或 null
    if (!playerPos) {
      this.playerTarget = null;
    } else if (playerPos.isVector3) {
      this.playerTarget = playerPos.clone();
    } else if (playerPos.position && playerPos.position.isVector3) {
      this.playerTarget = playerPos.position.clone();
    } else {
      this.playerTarget = null;
    }
    this.state = 'follow';
  }

  stopFollow() {
    this.followingPlayer = false;
    this.playerTarget = null;
    this.state = 'idle';
  }

  /** 获取建造进度百分比 */
  getBuildProgress() {
    if (!this.buildMode || this.totalBlocks === 0) return 0;
    return Math.round((this.buildProgress / this.totalBlocks) * 100);
  }

  update(dt, center) {
    if (this.buildCooldown > 0) this.buildCooldown -= dt;
    this._animateAntenna(dt);

    // 自动建造：出生后延迟几秒自动开始建造
    if (!this._autoBuildTriggered && !this.buildMode) {
      this.autoBuildDelay -= dt;
      if (this.autoBuildDelay <= 0) {
        this._autoBuildTriggered = true;
        this.startRandomBuildNearPlayer(this.position);
      }
    }

    // 更新建造粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else {
        p.mesh.position.y += dt * 2;
        p.mesh.material.opacity = p.life / p.maxLife;
        p.mesh.scale.setScalar(p.life / p.maxLife);
      }
    }

    // 建造模式
    if (this.buildMode && this.buildQueue.length > 0) {
      this._buildStep(dt);
      return; // 建造时不移动
    }

    // 建造完成
    if (this.buildMode && this.buildQueue.length === 0) {
      this.buildMode = false;
      this.currentStructure = null;
      this.buildOrigin = null;
      this.state = 'idle';
    }

    // 跟随玩家
    if (this.state === 'follow' && this.playerTarget) {
      this._updateFollow(dt, center);
    } else {
      super.update(dt, center);
    }
  }

  _buildStep(dt) {
    // 如果当前位置远离建造目标，先移动过去
    if (!this.buildTarget && this.buildQueue.length > 0) {
      this.buildTarget = this.buildQueue.shift();
    }

    if (!this.buildTarget) return;

    const tx = this.buildTarget.x + 0.5;
    const ty = this.buildTarget.y;
    const tz = this.buildTarget.z + 0.5;
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 1.0) {
      // 移动到目标位置
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const step = this.wanderSpeed * dt;
      const nx = this.position.x + dirX * step;
      const nz = this.position.z + dirZ * step;
      const ny = this._getGroundY(nx, nz);
      if (this._isSafeStep(nx, ny, nz)) {
        this.position.x = nx;
        this.position.z = nz;
        this.position.y = ny;
      }
      this.targetRotation = Math.atan2(dirZ, dirX);
      this._animateLimbs(dt);
    } else {
      // 到达位置，放置方块
      if (this.buildCooldown <= 0) {
        if (this.buildTarget.type === BlockType.AIR) {
          // 移除方块
          this.world.setBlock(this.buildTarget.x, this.buildTarget.y, this.buildTarget.z, BlockType.AIR);
        } else {
          this.world.setBlock(this.buildTarget.x, this.buildTarget.y, this.buildTarget.z, this.buildTarget.type);
        }
        this._spawnBuildParticles(this.buildTarget.x + 0.5, this.buildTarget.y + 0.5, this.buildTarget.z + 0.5);
        this.buildProgress++;
        this.buildCooldown = 0.15; // 快速建造
        this.buildTarget = null;
      }
    }
  }

  _spawnBuildParticles(px, py, pz) {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        px + (Math.random() - 0.5) * 0.5,
        py + Math.random() * 0.3,
        pz + (Math.random() - 0.5) * 0.5
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, life: 0.5 + Math.random() * 0.5, maxLife: 0.5 + Math.random() * 0.5 });
    }
  }

  _updateFollow(dt, center) {
    if (!this.playerTarget) { this.state = 'idle'; return; }
    const dx = this.playerTarget.x - this.position.x;
    const dz = this.playerTarget.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 3.0) {
      const dirX = dx / dist, dirZ = dz / dist;
      const step = this.wanderSpeed * dt;
      const nx = this.position.x + dirX * step, nz = this.position.z + dirZ * step;
      const ny = this._getGroundY(nx, nz);
      if (this._isSafeStep(nx, ny, nz)) {
        this.position.x = nx; this.position.z = nz; this.position.y = ny;
      }
      this.targetRotation = Math.atan2(dirZ, dirX);
      this._animateLimbs(dt);
    } else {
      this._resetLimbs();
    }
  }

  getInfo() {
    let status;
    if (this.buildMode) {
      status = `建造中 ${this.currentStructure ? STRUCTURES[this.currentStructure].name : ''} ${this.getBuildProgress()}%`;
    } else if (this.followingPlayer) {
      status = '跟随玩家';
    } else {
      status = '待命';
    }
    return { name: 'BuilderBot', type: '建造机器人', status, color: '科技蓝' };
  }
}

/* ============================================
   机器人生成管理器
   ============================================ */
export class AnimalManager {
  constructor(scene, world, isMobile = false) {
    this.scene = scene;
    this.world = world;
    this.isMobile = isMobile;
    this.robots = [];
    this.spawnCenter = new THREE.Vector3(0, 0, 0);
    this._spawned = false;
  }

  get animals() { return this.robots; }

  spawnAnimals() {
    if (this._spawned) return;
    this._spawned = true;
    const scoutCount = this.isMobile ? MOBILE_SCOUT_COUNT : SCOUT_COUNT;
    const heavyCount = this.isMobile ? MOBILE_HEAVY_COUNT : HEAVY_COUNT;
    const builderCount = this.isMobile ? 1 : 2;
    const usedPositions = [];

    const trySpawn = (type) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = randRange(5, SPAWN_RADIUS);
        const sx = this.spawnCenter.x + Math.cos(angle) * dist;
        const sz = this.spawnCenter.z + Math.sin(angle) * dist;
        const groundBlock = this.world.getBlock(Math.floor(sx), Math.floor(this._getGroundY(sx, sz) - 1), Math.floor(sz));
        const validGround = type === 'builder' ? isSolid(groundBlock) :
          (groundBlock === BlockType.GRASS || groundBlock === BlockType.SAND || groundBlock === BlockType.SNOW_GRASS);
        if (!validGround) continue;
        const gy = this._getGroundY(sx, sz);
        if (gy < 1 || gy > 40) continue;
        let tooClose = false;
        for (const p of usedPositions) {
          if (Math.sqrt((sx - p.x) ** 2 + (sz - p.z) ** 2) < MIN_SPAWN_DIST) { tooClose = true; break; }
        }
        if (tooClose) continue;
        usedPositions.push({ x: sx, z: sz });
        let robot;
        if (type === 'scout') robot = new ScoutBot(this.scene, this.world, sx, gy, sz);
        else if (type === 'heavy') robot = new HeavyBot(this.scene, this.world, sx, gy, sz);
        else if (type === 'builder') robot = new BuilderBot(this.scene, this.world, sx, gy, sz);
        this.robots.push(robot);
        return;
      }
    };

    for (let i = 0; i < heavyCount; i++) trySpawn('heavy');
    for (let i = 0; i < scoutCount; i++) trySpawn('scout');
    for (let i = 0; i < builderCount; i++) trySpawn('builder');
  }

  _getGroundY(px, pz) {
    for (let y = 40; y >= 0; y--) {
      if (isSolid(this.world.getBlock(Math.floor(px), y, Math.floor(pz)))) return y + 1;
    }
    return 0;
  }

  getStats() {
    const stats = { scout: 0, heavy: 0, builder: 0 };
    for (const robot of this.robots) {
      if (robot instanceof ScoutBot) stats.scout++;
      else if (robot instanceof HeavyBot) stats.heavy++;
      else if (robot instanceof BuilderBot) stats.builder++;
    }
    return stats;
  }

  setBuilderFollow(playerPos) {
    for (const robot of this.robots) {
      if (robot instanceof BuilderBot) robot.setFollowPlayer(playerPos);
    }
  }

  stopBuilderFollow() {
    for (const robot of this.robots) {
      if (robot instanceof BuilderBot) robot.stopFollow();
    }
  }

  /** 命令 BuilderBot 在玩家附近随机建造（优先空闲机器人，没有则命令正在建造的） */
  commandBuildNearPlayer(playerPos) {
    // 优先找空闲的 BuilderBot
    for (const robot of this.robots) {
      if (robot instanceof BuilderBot && !robot.buildMode) {
        return robot.startRandomBuildNearPlayer(playerPos);
      }
    }
    // 没有空闲的，命令正在建造的机器人到玩家附近新位置建造
    for (const robot of this.robots) {
      if (robot instanceof BuilderBot) {
        return robot.startRandomBuildNearPlayer(playerPos);
      }
    }
    return false;
  }

  spawnBuilderNearPlayer(playerPos) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = randRange(3, 8);
      const sx = playerPos.x + Math.cos(angle) * dist;
      const sz = playerPos.z + Math.sin(angle) * dist;
      const gy = this._getGroundY(sx, sz);
      if (gy < 1 || gy > 40) continue;
      const groundBlock = this.world.getBlock(Math.floor(sx), Math.floor(gy - 1), Math.floor(sz));
      if (!isSolid(groundBlock)) continue;
      let tooClose = false;
      for (const robot of this.robots) {
        if (Math.sqrt((sx - robot.position.x) ** 2 + (sz - robot.position.z) ** 2) < 3) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const builder = new BuilderBot(this.scene, this.world, sx, gy, sz);
      this.robots.push(builder);
      return builder;
    }
    return null;
  }

  update(dt, playerPos) {
    for (const robot of this.robots) {
      robot.update(dt, this.spawnCenter);
    }
  }

  disposeAll() {
    for (const robot of this.robots) robot.dispose();
    this.robots = [];
  }
}
