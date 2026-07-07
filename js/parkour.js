/**
 * 像素方块世界 - 跑酷模式管理器
 * 融合跑酷 + 建造：BuilderBot 在玩家前方实时建造跑酷段，玩家穿越
 *
 * 5 种跑酷段模板：
 *   1. bridge    桥梁段（带间隙需跳跃）
 *   2. wall      围墙段（缺口需左右躲）
 *   3. stairs    阶梯段（上升再下降）
 *   4. platforms 浮空平台段（连续跳跃）
 *   5. heart     奖励爱心段（恢复生命 + 加分）
 */
import * as THREE from 'three';
import { BlockType, isSolid } from './voxel.js?v=1782823800';
import { BuilderBot } from './animals.js?v=1782823800';
// 注：parkour.js 自身版本通过 game.js 的 import 链路控制缓存

/* ============================================
   常量
   ============================================ */
const PARKOUR_RUN_SPEED = 6.0;       // 自动前进速度（格/秒）
const PARKOUR_STRAFE_SPEED = 5.5;    // 左右移动速度
const PARKOUR_JUMP_SPEED = 11.0;     // 跳跃初速度
const PARKOUR_GRAVITY = -28;         // 跑酷重力（略强，操作更跟手）
const SEGMENT_LENGTH = 24;           // 每段长度（格）
const SEGMENT_GAP = 3;               // 段间间隙（需跳跃跨越）
const BUILD_AHEAD_DISTANCE = 36;     // 玩家前方多少格开始建造下一段
const FALL_Y_THRESHOLD = -8;         // 掉落到此 Y 判定失败
const MAX_LIVES = 3;
const LANDING_PAD_LEN = 4;           // 段首尾各铺 4 格平地（落脚点）

/* ============================================
   5 种跑酷段模板生成器
   每个生成器返回 blocks 数组：{x, y, z, type}
   坐标系：段内局部坐标，x=左右(0=中)，y=高度(0=地面)，z=前进方向(0=段首)
   ============================================ */
const PARKOUR_TEMPLATES = {
  /* 1. 桥梁段：16 格长桥，中间 2 处 2 格间隙 */
  bridge: {
    name: '桥梁',
    icon: '🌉',
    length: SEGMENT_LENGTH,
    generate() {
      const b = [];
      // 落脚平台（段首 4 格）
      for (let z = 0; z < LANDING_PAD_LEN; z++)
        for (let x = -2; x <= 2; x++)
          b.push({ x, y: 0, z, type: BlockType.WOOD });
      // 桥面：6 格 + 间隙2格 + 6 格 + 间隙2格 + 4 格
      let z = LANDING_PAD_LEN;
      const segLens = [6, 6, 4];
      const gaps = [2, 2];
      for (let s = 0; s < segLens.length; s++) {
        for (let dz = 0; dz < segLens[s]; dz++, z++) {
          for (let x = -2; x <= 2; x++) {
            b.push({ x, y: 0, z, type: BlockType.WOOD });
          }
        }
        if (s < gaps.length) z += gaps[s]; // 间隙
      }
      // 段尾落脚平台
      for (let dz = 0; dz < LANDING_PAD_LEN && z < SEGMENT_LENGTH; dz++, z++)
        for (let x = -2; x <= 2; x++)
          b.push({ x, y: 0, z, type: BlockType.WOOD });
      // 桥两侧栏杆（点缀）
      for (let zz = LANDING_PAD_LEN; zz < SEGMENT_LENGTH - LANDING_PAD_LEN; zz += 3) {
        b.push({ x: -3, y: 1, z: zz, type: BlockType.WOOD });
        b.push({ x: 3, y: 1, z: zz, type: BlockType.WOOD });
      }
      return b;
    },
  },

  /* 2. 围墙段：3 道墙，每道有缺口需左右躲 */
  wall: {
    name: '围墙',
    icon: '🧱',
    length: SEGMENT_LENGTH,
    generate() {
      const b = [];
      // 段首落脚
      for (let z = 0; z < LANDING_PAD_LEN; z++)
        for (let x = -3; x <= 3; x++)
          b.push({ x, y: 0, z, type: BlockType.COBBLESTONE });
      // 3 道墙，间隔 6 格
      const wallZ = [10, 16, 22];
      for (let i = 0; i < wallZ.length; i++) {
        const wz = wallZ[i];
        // 缺口位置：左/中/右 随机（用确定性伪随机保持一致）
        const gap = (i % 3) - 1; // -1, 0, 1
        for (let x = -3; x <= 3; x++) {
          if (x === gap) continue; // 缺口
          for (let y = 1; y <= 2; y++) {
            b.push({ x, y, z: wz, type: BlockType.BRICK });
          }
        }
        // 缺口上方标记（醒目）
        b.push({ x: gap, y: 3, z: wz, type: BlockType.GLASS });
      }
      // 段中地面填充
      for (let z = LANDING_PAD_LEN; z < SEGMENT_LENGTH; z++) {
        if (wallZ.includes(z)) continue;
        for (let x = -3; x <= 3; x++)
          b.push({ x, y: 0, z, type: BlockType.COBBLESTONE });
      }
      return b;
    },
  },

  /* 3. 阶梯段：上升 6 级再下降 6 级 */
  stairs: {
    name: '阶梯',
    icon: '🪜',
    length: SEGMENT_LENGTH,
    generate() {
      const b = [];
      // 段首落脚
      for (let z = 0; z < LANDING_PAD_LEN; z++)
        for (let x = -3; x <= 3; x++)
          b.push({ x, y: 0, z, type: BlockType.STONE });
      // 上升阶梯（6 级，每级 1 格宽 1 格高）
      let z = LANDING_PAD_LEN;
      for (let step = 1; step <= 6; step++, z++) {
        for (let x = -2; x <= 2; x++) {
          // 填充到当前高度
          for (let y = 0; y < step; y++) {
            b.push({ x, y, z, type: BlockType.STONE });
          }
        }
      }
      // 顶部平台
      for (let dz = 0; dz < 2; dz++, z++) {
        for (let x = -2; x <= 2; x++) {
          for (let y = 0; y < 6; y++) {
            b.push({ x, y, z, type: BlockType.STONE });
          }
        }
      }
      // 下降阶梯
      for (let step = 5; step >= 0; step--, z++) {
        for (let x = -2; x <= 2; x++) {
          for (let y = 0; y < step; y++) {
            b.push({ x, y, z, type: BlockType.STONE });
          }
        }
      }
      // 段尾落脚
      for (let dz = 0; dz < LANDING_PAD_LEN && z < SEGMENT_LENGTH; dz++, z++)
        for (let x = -3; x <= 3; x++)
          b.push({ x, y: 0, z, type: BlockType.STONE });
      return b;
    },
  },

  /* 4. 浮空平台段：5 个独立平台，间隔 3 格需跳跃 */
  platforms: {
    name: '浮空平台',
    icon: '🟦',
    length: SEGMENT_LENGTH,
    generate() {
      const b = [];
      // 段首落脚
      for (let z = 0; z < LANDING_PAD_LEN; z++)
        for (let x = -2; x <= 2; x++)
          b.push({ x, y: 0, z, type: BlockType.WOOD });
      // 5 个浮空平台，高度递增再递减
      const platforms = [
        { z: 7, x: 0, y: 0 },
        { z: 11, x: 2, y: 1 },
        { z: 15, x: -2, y: 2 },
        { z: 19, x: 0, y: 1 },
        { z: 22, x: 0, y: 0 },
      ];
      for (const p of platforms) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            b.push({ x: p.x + dx, y: p.y, z: p.z + dz, type: BlockType.DIAMOND_BLOCK });
          }
        }
      }
      // 段尾落脚
      for (let z = 23; z < SEGMENT_LENGTH; z++)
        for (let x = -2; x <= 2; x++)
          b.push({ x, y: 0, z, type: BlockType.WOOD });
      return b;
    },
  },

  /* 5. 奖励爱心段：像素爱心平台 + 恢复生命 + 加分 */
  heart: {
    name: '爱心奖励',
    icon: '💗',
    length: SEGMENT_LENGTH,
    generate() {
      const b = [];
      // 大平台
      for (let z = 0; z < SEGMENT_LENGTH; z++)
        for (let x = -4; x <= 4; x++)
          b.push({ x, y: 0, z, type: BlockType.WOOD });
      // 中心像素爱心（9 高 12 宽）
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
      for (let row = 0; row < heart.length; row++) {
        for (let col = 0; col < heart[row].length; col++) {
          if (heart[row][col] === '@') {
            b.push({
              x: col - 6,
              y: 2,
              z: 8 + row,
              type: BlockType.BILIBILI_PINK,
            });
          }
        }
      }
      // 围绕的钻石装饰（加分点）
      const gems = [
        { x: -4, y: 2, z: 4 }, { x: 4, y: 2, z: 4 },
        { x: -4, y: 2, z: 18 }, { x: 4, y: 2, z: 18 },
      ];
      for (const g of gems) b.push({ ...g, type: BlockType.DIAMOND_BLOCK });
      return b;
    },
  },
};

const PARKOUR_KEYS = Object.keys(PARKOUR_TEMPLATES);

/* ============================================
   跑酷模式管理器
   ============================================ */
export class ParkourManager {
  constructor(scene, world, animalManager, audio, showMessage) {
    this.scene = scene;
    this.world = world;
    this.animalManager = animalManager;
    this.audio = audio;
    this.showMessage = showMessage || (() => {});

    this.active = false;
    this.score = 0;
    this.distance = 0;
    this.lives = MAX_LIVES;
    this.segmentIndex = 0;

    // 跑酷起点（玩家进入跑酷时的位置）
    this.startPos = new THREE.Vector3();
    // 跑酷方向（固定 -Z）
    this.direction = new THREE.Vector3(0, 0, -1);
    // 当前段起始 Z（世界坐标）
    this.currentSegmentZ = 0;
    // 下一段起始 Z
    this.nextSegmentZ = 0;
    // 已触发生造的段索引
    this.builtSegmentIndex = -1;
    // 上次触发建造的 BuilderBot
    this.activeBuilder = null;
    // 玩家进入跑酷前的状态备份
    this._savedState = null;
    // 失败重置冷却
    this._respawnCooldown = 0;
    // 跑酷模式横向位置目标
    this._targetX = 0;
    // 上一帧是否在地面（用于落地音效）
    this._wasOnGround = false;
    // 当前段类型名
    this.currentSegmentName = '';
    // 速度倍率（随段数提升）
    this.speedMultiplier = 1.0;
    // 玩家可见模型（第三人称下显示）
    this.playerAvatar = null;
    // 跑步动画相位
    this._animPhase = 0;
    // 是否在地面（动画用）
    this._animOnGround = false;
  }

  /** 创建第三人称玩家可见模型（像素小人） */
  _createPlayerAvatar() {
    const group = new THREE.Group();

    // 像素小人各部位材质（Minecraft Steve 风格配色）
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF9C39B });   // 皮肤
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3DB85C });  // 绿上衣
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3A4F9B });  // 蓝裤子
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x4A2E14 });   // 头发
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x4A4A4A });   // 鞋

    // 头部（8x8x8 像素，缩放为 0.5 格）
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.55;
    group.add(head);

    // 头发顶
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.55), hairMat);
    hair.position.y = 1.85;
    group.add(hair);

    // 身体（4x6x2 像素）
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.25), shirtMat);
    body.position.y = 1.0;
    group.add(body);

    // 左臂
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirtMat);
    leftArm.position.set(-0.32, 1.0, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);

    // 右臂
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirtMat);
    rightArm.position.set(0.32, 1.0, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // 左腿
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pantsMat);
    leftLeg.position.set(-0.13, 0.35, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    // 右腿
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pantsMat);
    rightLeg.position.set(0.13, 0.35, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // 鞋（覆盖腿底部）
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.24), shoeMat);
    leftShoe.position.set(-0.13, 0.1, 0);
    group.add(leftShoe);
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.24), shoeMat);
    rightShoe.position.set(0.13, 0.1, 0);
    group.add(rightShoe);

    group.visible = false;
    this.scene.add(group);
    return group;
  }

  /** 更新玩家模型位置和动画 */
  _updatePlayerAvatar(player, dt) {
    if (!this.playerAvatar) return;
    this.playerAvatar.visible = true;
    this.playerAvatar.position.copy(player.position);

    // 跑步动画：腿和臂前后摆动
    this._animPhase += dt * 10;
    const swing = Math.sin(this._animPhase) * 0.5;
    const jumpFactor = player.onGround ? 1 : 0.2;

    const leftArm = this.playerAvatar.getObjectByName('leftArm');
    const rightArm = this.playerAvatar.getObjectByName('rightArm');
    const leftLeg = this.playerAvatar.getObjectByName('leftLeg');
    const rightLeg = this.playerAvatar.getObjectByName('rightLeg');

    if (leftArm) leftArm.rotation.x = swing * jumpFactor;
    if (rightArm) rightArm.rotation.x = -swing * jumpFactor;
    if (leftLeg) leftLeg.rotation.x = -swing * jumpFactor;
    if (rightLeg) rightLeg.rotation.x = swing * jumpFactor;
  }

  /** 进入跑酷模式 */
  start(player) {
    if (this.active) return;
    this.active = true;
    // 创建第三人称玩家可见模型
    if (!this.playerAvatar) {
      this.playerAvatar = this._createPlayerAvatar();
    }
    this.score = 0;
    this.distance = 0;
    this.lives = MAX_LIVES;
    this.segmentIndex = 0;
    this.speedMultiplier = 1.0;
    this._respawnCooldown = 0;
    this._wasOnGround = false;

    // 记录起点
    this.startPos.copy(player.position);
    this._targetX = player.position.x;

    // 备份玩家状态
    this._savedState = {
      position: player.position.clone(),
      yaw: player.yaw,
      pitch: player.pitch,
      moveSpeed: player.moveSpeed,
      jumpSpeed: player.jumpSpeed,
      gravity: player.gravity,
    };

    // 强制面向 -Z（跑酷前进方向）
    player.yaw = 0;
    player.pitch = -0.05;
    player.gravity = PARKOUR_GRAVITY;
    player.jumpSpeed = PARKOUR_JUMP_SPEED;

    // 起点放置一个起始平台（如果脚下没有方块）
    this._ensurePlatform(Math.floor(player.position.x), Math.floor(player.position.y - 1), Math.floor(player.position.z), 6);

    // 第 0 段起点 = 玩家前方 SEGMENT_LENGTH 处
    this.currentSegmentZ = Math.floor(player.position.z) - SEGMENT_LENGTH - SEGMENT_GAP;
    this.nextSegmentZ = this.currentSegmentZ - SEGMENT_LENGTH - SEGMENT_GAP;
    this.builtSegmentIndex = -1;

    // 立即触发第 0 段建造
    this._triggerNextBuild();

    if (this.audio) this.audio.playJump();
    this.showMessage('🏃 跑酷模式启动！自动前进，A/D 左右，空格跳跃');
  }

  /** 退出跑酷模式 */
  stop(player) {
    if (!this.active) return;
    this.active = false;

    // 隐藏玩家模型
    if (this.playerAvatar) this.playerAvatar.visible = false;

    // 恢复玩家状态
    if (player && this._savedState) {
      player.gravity = this._savedState.gravity;
      player.jumpSpeed = this._savedState.jumpSpeed;
      player.moveSpeed = this._savedState.moveSpeed;
    }
    this.showMessage('退出跑酷模式');
  }

  /** 玩家失败：扣命 + 重置到段首 */
  _onFail(player) {
    this.lives--;
    if (this.audio && this.audio.playDamage) this.audio.playDamage();
    else if (this.audio) this.audio.playJump();

    if (this.lives <= 0) {
      this.showMessage(`💀 跑酷失败！得分 ${this.score} | 距离 ${Math.floor(this.distance)}`);
      this.stop(player);
      // 传送回跑酷起点
      player.position.copy(this.startPos);
      player.velocity.set(0, 0, 0);
      return;
    }

    // 重置到当前段首（段首落脚平台上方）
    const respawnX = 0;
    const respawnY = this.startPos.y; // 站在跑酷路径 y=0 方块上方
    const respawnZ = this.currentSegmentZ + 2; // 段首前 2 格（落脚平台内）
    player.position.set(respawnX, respawnY, respawnZ);
    player.velocity.set(0, 0, 0);
    this._targetX = 0;
    this._respawnCooldown = 0.5;
    this.showMessage(`💔 剩余生命 ${this.lives}/${MAX_LIVES}`);
  }

  /** 触发下一段建造 */
  _triggerNextBuild() {
    const nextIdx = this.builtSegmentIndex + 1;
    if (nextIdx >= 50) return; // 上限保护

    // 选择段类型：前 2 段固定 bridge 让玩家适应，之后随机；每 5 段插入 heart 奖励
    let key;
    if (nextIdx > 0 && nextIdx % 5 === 0) {
      key = 'heart';
    } else if (nextIdx < 2) {
      key = 'bridge';
    } else {
      key = PARKOUR_KEYS[Math.floor(Math.random() * (PARKOUR_KEYS.length - 1))]; // 排除 heart
    }
    const template = PARKOUR_TEMPLATES[key];

    // 段起始世界坐标
    const segmentOriginZ = nextIdx === 0
      ? this.currentSegmentZ
      : this.nextSegmentZ;

    // 计算段起点 Y：玩家脚下方块的 Y（Player.position.y 是脚部，方块在脚下一格）
    const originX = 0;
    const originY = Math.floor(this.startPos.y - 1);
    const originZ = segmentOriginZ;

    // 找一个空闲 BuilderBot 来建造
    const builder = this._findFreeBuilder();
    if (builder) {
      // 把 BuilderBot 传送到段起点附近
      builder.position.set(originX + 5, originY + 1, originZ + 2);
      builder.buildMode = false;
      builder.buildQueue = [];
      builder.buildTarget = null;
      // 用 BuilderBot 的建造机制（带动画 + 粒子）
      const blocks = template.generate().map(b => ({
        x: originX + b.x,
        y: originY + b.y,
        z: originZ + b.z,
        type: b.type,
      }));
      builder.buildMode = true;
      builder.currentStructure = `parkour_${key}`;
      builder.buildOrigin = { x: originX, y: originY, z: originZ };
      builder.buildQueue = blocks;
      builder.buildTarget = null;
      builder.totalBlocks = blocks.length;
      builder.buildProgress = 0;
      builder.buildCooldown = 0;
      builder._autoBuildTriggered = true; // 阻止其自动建造其他东西
      this.activeBuilder = builder;
    } else {
      // 没有可用 BuilderBot，直接铺方块（不阻塞跑酷）
      const blocks = template.generate();
      for (const b of blocks) {
        this.world.setBlock(originX + b.x, originY + b.y, originZ + b.z, b.type);
      }
    }

    this.builtSegmentIndex = nextIdx;
    this.currentSegmentName = template.name;

    // 更新下一段起点 Z
    this.nextSegmentZ = originZ - SEGMENT_LENGTH - SEGMENT_GAP;
  }

  /** 找一个空闲的 BuilderBot */
  _findFreeBuilder() {
    if (!this.animalManager) return null;
    for (const r of this.animalManager.robots) {
      if (r instanceof BuilderBot && !r.buildMode) return r;
    }
    // 如果没有空闲的，抢占最久未活动的
    return null;
  }

  /** 在指定位置铺设一个确保安全的平台 */
  _ensurePlatform(cx, cy, cz, size) {
    const half = Math.floor(size / 2);
    for (let dx = -half; dx <= half; dx++) {
      for (let dz = -half; dz <= half; dz++) {
        if (!isSolid(this.world.getBlock(cx + dx, cy, cz + dz))) {
          this.world.setBlock(cx + dx, cy, cz + dz, BlockType.WOOD);
        }
      }
    }
  }

  /** 主更新：跑酷模式下的玩家控制 + 段管理 */
  update(dt, player) {
    if (!this.active) return;

    // 限制最大帧间隔
    dt = Math.min(dt, 0.05);

    // 失败重置冷却
    if (this._respawnCooldown > 0) {
      this._respawnCooldown -= dt;
    }

    // 速度倍率：每段提升 5%
    this.speedMultiplier = 1.0 + this.segmentIndex * 0.05;
    const runSpeed = PARKOUR_RUN_SPEED * this.speedMultiplier;

    // === 自动前进（-Z 方向） ===
    player.velocity.z = -runSpeed;

    // === 左右移动（A/D） ===
    if (player.keys['KeyA'] || player.keys['ArrowLeft']) {
      this._targetX = Math.max(this._targetX - PARKOUR_STRAFE_SPEED * dt, -4);
    }
    if (player.keys['KeyD'] || player.keys['ArrowRight']) {
      this._targetX = Math.min(this._targetX + PARKOUR_STRAFE_SPEED * dt, 4);
    }
    // 平滑插值到目标 X
    player.velocity.x = (this._targetX - player.position.x) * 8;

    // === 重力 ===
    player.velocity.y += PARKOUR_GRAVITY * dt;

    // === 跳跃（空格，仅地面） ===
    if ((player.keys['Space'] || player.keys['KeyK']) && player.onGround) {
      player.velocity.y = PARKOUR_JUMP_SPEED;
      player.onGround = false;
      if (this.audio) this.audio.playJump();
    }

    // === 逐轴移动 + 碰撞（复用 Player 的碰撞逻辑） ===
    player.onGround = false;
    player.position.x += player.velocity.x * dt;
    player._resolveCollision('x');
    player.position.y += player.velocity.y * dt;
    player._resolveCollision('y');
    player.position.z += player.velocity.z * dt;
    player._resolveCollision('z');

    // === 落地音效 ===
    if (player.onGround && !this._wasOnGround && player.velocity.y < -2) {
      if (this.audio) this.audio.playLand(BlockType.WOOD);
    }
    this._wasOnGround = player.onGround;

    // === 失败检测：掉落 ===
    if (player.position.y < FALL_Y_THRESHOLD && this._respawnCooldown <= 0) {
      this._onFail(player);
      return;
    }

    // === 更新相机（第三人称跟随，玩家居中偏下，能看到前方建造） ===
    const targetCamPos = new THREE.Vector3(
      player.position.x,
      player.position.y + 3.5,
      player.position.z + 7
    );
    player.camera.position.lerp(targetCamPos, Math.min(1, dt * 6));
    // 看向玩家前方一点（让玩家在画面下方，前方路径在上方）
    player.camera.lookAt(
      player.position.x,
      player.position.y + 0.8,
      player.position.z - 5
    );

    // === 更新玩家可见模型位置和跑步动画 ===
    this._updatePlayerAvatar(player, dt);

    // === 距离 + 分数累加 ===
    this.distance = Math.max(this.distance, this.startPos.z - player.position.z);
    const newScore = Math.floor(this.distance * 10);
    if (newScore > this.score) this.score = newScore;

    // === 段补完：玩家接近某段时，若 BuilderBot 还没建完，瞬间补齐剩余方块 ===
    // 避免因 BuilderBot 建造速度慢导致玩家掉坑
    this._ensureSegmentComplete(player);

    // === 段切换检测：玩家通过当前段中点时触发下一段建造 ===
    // 当前段 z 范围：[currentSegmentZ, currentSegmentZ + SEGMENT_LENGTH]（currentSegmentZ 为负）
    // 段中点 z = currentSegmentZ + SEGMENT_LENGTH / 2
    // 玩家从段尾（z 大）向段首（z 小）前进，z 递减
    if (player.position.z < this.currentSegmentZ + SEGMENT_LENGTH / 2) {
      this._triggerNextBuild();
      // _triggerNextBuild 已把 nextSegmentZ 更新为再下一段；
      // 当前段应推进到刚刚建造的那一段
      this.currentSegmentZ = this.currentSegmentZ - SEGMENT_LENGTH - SEGMENT_GAP;
      this.segmentIndex++;
      this.score += 100; // 段通过奖励
      this.showMessage(`✅ 通过第 ${this.segmentIndex} 段：${this.currentSegmentName} +100`);
    }
  }

  /** 段补完：若 BuilderBot 还在建造当前段且玩家已接近，瞬间补齐剩余方块 */
  _ensureSegmentComplete(player) {
    if (!this.activeBuilder || !this.activeBuilder.buildMode) return;
    // 玩家距离当前段段首还有多少格（正值表示未到达）
    const distToSegmentStart = player.position.z - this.currentSegmentZ;
    // 玩家进入段尾 8 格内时，强制补完
    if (distToSegmentStart < SEGMENT_LENGTH + 8 && this.activeBuilder.buildQueue.length > 0) {
      // 直接把剩余方块铺好
      const remain = this.activeBuilder.buildQueue.splice(0);
      for (const b of remain) {
        if (b.type === BlockType.AIR) {
          this.world.setBlock(b.x, b.y, b.z, BlockType.AIR);
        } else {
          this.world.setBlock(b.x, b.y, b.z, b.type);
        }
      }
      this.activeBuilder.buildProgress = this.activeBuilder.totalBlocks;
      this.activeBuilder.buildTarget = null;
      this.activeBuilder.buildMode = false;
      this.activeBuilder.currentStructure = null;
    }
  }

  /** 获取跑酷 HUD 数据 */
  getHUDData() {
    return {
      active: this.active,
      score: this.score,
      distance: Math.floor(this.distance),
      lives: this.lives,
      maxLives: MAX_LIVES,
      segment: this.segmentIndex,
      segmentName: this.currentSegmentName,
      speed: Math.round(this.speedMultiplier * 100),
    };
  }
}
