/**
 * 像素方块世界 - 跑酷模式管理器（Endless Runner 风格）
 * 参考 Gemini Runner 玩法：3 车道自动前进，躲避障碍物，收集金币
 *
 * 玩法：
 *   - 玩家自动向前跑（-Z 方向）
 *   - A/D 或 ←/→ 切换 3 个车道（左/中/右）
 *   - 空格 跳跃（躲避低矮障碍/跨越间隙）
 *   - S 或 ↓ 滑铲（躲避高悬障碍）
 *   - 撞到障碍物 = 失败扣命
 *   - 收集金币加分
 *   - 体素世界在下方作为背景
 */
import * as THREE from 'three';
import { BlockType } from './voxel.js';

/* ============================================
   常量
   ============================================ */
const PARKOUR_RUN_SPEED = 9.0;       // 自动前进速度（格/秒，比之前快）
const PARKOUR_JUMP_SPEED = 11.0;     // 跳跃初速度
const PARKOUR_GRAVITY = -30;         // 跑酷重力（强重力，跳跃更跟手）
const MAX_LIVES = 3;

// 3 车道系统
const LANE_WIDTH = 2.0;              // 车道宽度
const LANE_X = [-LANE_WIDTH, 0, LANE_WIDTH]; // 左/中/右车道 X 坐标

// 跑酷起点固定在高空，远离体素地形
const PARKOUR_START_Y = 55;          // 跑酷路径方块顶面 Y
const PARKOUR_FALL_OFFSET = 15;      // 掉落超过起点下方 15 格判定失败

// 障碍物生成参数
const SPAWN_AHEAD_DISTANCE = 80;     // 玩家前方多少格生成障碍物
const DESPAWN_BEHIND_DISTANCE = 15;  // 玩家后方多少格销毁障碍物
const MIN_OBSTACLE_GAP = 6;          // 障碍物最小间距
const MAX_OBSTACLE_GAP = 12;         // 障碍物最大间距

// 滑铲持续时间
const SLIDE_DURATION = 0.6;          // 滑铲持续时间（秒）

/* ============================================
   障碍物类型
   ============================================ */
const ObstacleKind = {
  LOW: 'low',        // 低矮障碍（需跳跃）
  HIGH: 'high',      // 高悬障碍（需滑铲）
  FULL: 'full',      // 完整方块墙（必须切换车道）
  GAP: 'gap',        // 地面间隙（需跳跃）
  COIN: 'coin',      // 金币（收集加分）
};

/**
 * 跑酷模式管理器
 */
export class ParkourManager {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;

    this.active = false;
    this.startPos = new THREE.Vector3();

    // 游戏状态
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.lives = MAX_LIVES;
    this.speedMultiplier = 1.0;

    // 玩家状态
    this._targetLane = 1;            // 0=左, 1=中, 2=右
    this._targetX = 0;
    this._isSliding = false;
    this._slideTimer = 0;
    this._respawnCooldown = 0;
    this._wasOnGround = false;
    this._laneSwitched = false;      // 防止按住 A/D 连续切换

    // 障碍物管理
    this.obstacles = [];             // {mesh, kind, lane, z, hit}
    this._nextSpawnZ = 0;            // 下一个障碍物 Z 坐标
    this._lastSpawnKind = null;      // 上次生成的类型（避免连续相同）

    // 路径方块管理（独立 Mesh，不写入体素世界，避免受 CHUNK_HEIGHT 限制 + 区块重建开销）
    this._pathGroup = new THREE.Group();  // 所有跑道方块的父容器
    this._pathGeo = new THREE.BoxGeometry(1, 1, 1);
    this._pathMatWood = new THREE.MeshLambertMaterial({ color: 0x78503a });
    this._pathMatStone = new THREE.MeshLambertMaterial({ color: 0x7a7a7a });
    this._placedBlocks = [];         // {mesh, x, y, z} 已放置的方块（用于回收）
    this._pathMinZ = 0;              // 当前路径最小 Z（已生成最远位置）
    this._pathBlockSet = new Set();  // "x,y,z" 集合，用于碰撞检测快速查询

    // 玩家可见模型
    this.playerAvatar = null;
    this._animPhase = 0;

    // 备份玩家原始状态
    this._savedState = null;

    // HUD 消息
    this._message = '';
    this._messageTimer = 0;
  }

  /* ============================================
     玩家可见模型（像素小人）
     ============================================ */
  _createPlayerAvatar() {
    const group = new THREE.Group();

    const skinMat = new THREE.MeshLambertMaterial({ color: 0xF9C39B });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3DB85C });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3A4F9B });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x4A2E14 });
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x4A4A4A });

    // 头
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.55;
    group.add(head);

    // 头发
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.55), hairMat);
    hair.position.y = 1.85;
    group.add(hair);

    // 身体
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.25), shirtMat);
    body.position.y = 1.0;
    group.add(body);

    // 双臂
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirtMat);
    leftArm.position.set(-0.32, 1.0, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirtMat);
    rightArm.position.set(0.32, 1.0, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // 双腿
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pantsMat);
    leftLeg.position.set(-0.13, 0.35, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), pantsMat);
    rightLeg.position.set(0.13, 0.35, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // 鞋
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

  _updatePlayerAvatar(player, dt) {
    if (!this.playerAvatar) return;
    this.playerAvatar.visible = true;
    this.playerAvatar.position.copy(player.position);

    // 跑步动画
    this._animPhase += dt * 14;
    const swing = Math.sin(this._animPhase) * 0.6;
    const jumpFactor = player.onGround ? 1 : 0.15;
    const slideFactor = this._isSliding ? 0 : 1;

    const leftArm = this.playerAvatar.getObjectByName('leftArm');
    const rightArm = this.playerAvatar.getObjectByName('rightArm');
    const leftLeg = this.playerAvatar.getObjectByName('leftLeg');
    const rightLeg = this.playerAvatar.getObjectByName('rightLeg');

    if (this._isSliding) {
      // 滑铲姿势：身体后倾，腿前伸
      this.playerAvatar.rotation.x = -0.6;
      if (leftArm) leftArm.rotation.x = 1.2;
      if (rightArm) rightArm.rotation.x = 1.2;
      if (leftLeg) leftLeg.rotation.x = 1.4;
      if (rightLeg) rightLeg.rotation.x = 1.4;
    } else {
      this.playerAvatar.rotation.x = 0;
      if (leftArm) leftArm.rotation.x = swing * jumpFactor;
      if (rightArm) rightArm.rotation.x = -swing * jumpFactor;
      if (leftLeg) leftLeg.rotation.x = -swing * jumpFactor * slideFactor;
      if (rightLeg) rightLeg.rotation.x = swing * jumpFactor * slideFactor;
    }
  }

  /* ============================================
     障碍物生成
     ============================================ */

  /**
   * 在指定 Z 位置生成一组障碍物
   * 每次生成 1-2 个车道有障碍，留至少 1 个空车道
   */
  _spawnObstacleGroup(z) {
    // 随机选择 1-2 个车道放障碍物（保证至少 1 个车道可通过）
    const laneCount = Math.random() < 0.6 ? 1 : 2;
    const lanes = [0, 1, 2];
    // 洗牌
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const blockedLanes = lanes.slice(0, laneCount);

    for (const lane of blockedLanes) {
      // 随机障碍类型
      const kinds = [ObstacleKind.LOW, ObstacleKind.HIGH, ObstacleKind.FULL];
      // 偶尔生成金币（在空车道）
      let kind = kinds[Math.floor(Math.random() * kinds.length)];
      // 避免连续相同类型
      if (kind === this._lastSpawnKind && Math.random() < 0.6) {
        kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length];
      }
      this._lastSpawnKind = kind;
      this._createObstacle(kind, lane, z);
    }

    // 在空车道放金币（30% 概率）
    const freeLanes = lanes.slice(laneCount);
    if (freeLanes.length > 0 && Math.random() < 0.4) {
      const coinLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
      this._createObstacle(ObstacleKind.COIN, coinLane, z);
    }
  }

  /**
   * 创建单个障碍物网格
   */
  _createObstacle(kind, lane, z) {
    const x = LANE_X[lane];
    const groundY = PARKOUR_START_Y;
    let mesh;

    switch (kind) {
      case ObstacleKind.LOW: {
        // 低矮障碍：1 格高，需跳跃
        const geo = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 1, 0.8);
        const mat = new THREE.MeshLambertMaterial({ color: 0xD32F2F });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, groundY + 0.5, z);
        break;
      }
      case ObstacleKind.HIGH: {
        // 高悬障碍：悬空 1.5 格，需滑铲
        const geo = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 1, 0.8);
        const mat = new THREE.MeshLambertMaterial({ color: 0xFF9800 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, groundY + 2.0, z);
        break;
      }
      case ObstacleKind.FULL: {
        // 完整方块墙：2 格高，必须切换车道
        const geo = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 2.5, 0.8);
        const mat = new THREE.MeshLambertMaterial({ color: 0x7B1FA2 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, groundY + 1.25, z);
        break;
      }
      case ObstacleKind.COIN: {
        // 金币：旋转的黄色圆盘
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
        const mat = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0x886600 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(x, groundY + 1.2, z);
        break;
      }
      default:
        return;
    }

    mesh.userData = { kind, lane, hit: false };
    this.scene.add(mesh);
    this.obstacles.push(mesh);
  }

  /** 销毁过期障碍物 */
  _cleanupObstacles(playerZ) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      // 障碍物在玩家后方超过 DESPAWN_BEHIND_DISTANCE 格则销毁
      if (obs.position.z > playerZ + DESPAWN_BEHIND_DISTANCE) {
        this.scene.remove(obs);
        obs.geometry.dispose();
        obs.material.dispose();
        this.obstacles.splice(i, 1);
      }
    }
  }

  /** 旋转金币动画 */
  _animateCoins(dt) {
    for (const obs of this.obstacles) {
      if (obs.userData.kind === ObstacleKind.COIN) {
        obs.rotation.z += dt * 4;
      }
    }
  }

  /* ============================================
     路径铺设
     ============================================ */

  /**
   * 在玩家前方铺设跑道方块（独立 Mesh，不写入体素世界）
   * 跑道宽度 3 个车道（X: -3 ~ 3）
   */
  _layPath(targetZ) {
    const startX = -3;
    const endX = 3;
    const y = PARKOUR_START_Y - 1; // 跑道方块在玩家脚下

    while (this._pathMinZ > targetZ) {
      const z = this._pathMinZ;
      for (let x = startX; x <= endX; x++) {
        // 跑道用木板，边缘用石头
        const isEdge = (x === startX || x === endX);
        const mesh = new THREE.Mesh(this._pathGeo, isEdge ? this._pathMatStone : this._pathMatWood);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        this._pathGroup.add(mesh);
        this._placedBlocks.push({ mesh, x, y, z });
        this._pathBlockSet.add(`${x},${y},${z}`);
      }
      this._pathMinZ--;
    }
  }

  /** 清理远离的路径方块（避免内存堆积） */
  _cleanupPath(playerZ) {
    const cleanupZ = playerZ + DESPAWN_BEHIND_DISTANCE;
    for (let i = this._placedBlocks.length - 1; i >= 0; i--) {
      const b = this._placedBlocks[i];
      if (b.z > cleanupZ) {
        this._pathGroup.remove(b.mesh);
        this._pathBlockSet.delete(`${b.x},${b.y},${b.z}`);
        this._placedBlocks.splice(i, 1);
      }
    }
  }

  /* ============================================
     碰撞检测
     ============================================ */

  /**
   * 检测玩家与障碍物的碰撞
   * 返回 {hit: bool, coin: bool}
   */
  _checkCollisions(player) {
    const px = player.position.x;
    const py = player.position.y;
    const pz = player.position.z;
    // 玩家碰撞箱（滑铲时降低高度）
    const pHalfW = 0.3;
    const pBottom = py;
    const pTop = this._isSliding ? py + 0.8 : py + 1.8;

    for (const obs of this.obstacles) {
      if (obs.userData.hit) continue;
      const ox = obs.position.x;
      const oy = obs.position.y;
      const oz = obs.position.z;

      // 障碍物碰撞箱（近似）
      const oHalfW = LANE_WIDTH * 0.4;
      let oBottom, oTop;
      switch (obs.userData.kind) {
        case ObstacleKind.LOW:
          oBottom = PARKOUR_START_Y; oTop = PARKOUR_START_Y + 1; break;
        case ObstacleKind.HIGH:
          oBottom = PARKOUR_START_Y + 1.5; oTop = PARKOUR_START_Y + 2.5; break;
        case ObstacleKind.FULL:
          oBottom = PARKOUR_START_Y; oTop = PARKOUR_START_Y + 2.5; break;
        case ObstacleKind.COIN:
          // 金币用球形检测
          oBottom = oy - 0.4; oTop = oy + 0.4; break;
        default: continue;
      }

      // Z 方向重叠（障碍物在玩家附近）
      const dz = Math.abs(oz - pz);
      if (dz > 0.8) continue;

      // X 方向重叠
      const dx = Math.abs(ox - px);
      if (dx > oHalfW + pHalfW) continue;

      // Y 方向重叠（用 pTop 而非固定 1.8，正确处理滑铲）
      if (pTop <= oBottom || pBottom >= oTop) continue;

      // 命中
      if (obs.userData.kind === ObstacleKind.COIN) {
        obs.userData.hit = true;
        this.scene.remove(obs);
        this.coins++;
        this.score += 50;
        if (this.audio && typeof this.audio.playJump === 'function') this.audio.playJump();
        return { hit: false, coin: true };
      } else {
        obs.userData.hit = true;
        return { hit: true, coin: false };
      }
    }
    return { hit: false, coin: false };
  }

  /* ============================================
     游戏生命周期
     ============================================ */

  /** 进入跑酷模式 */
  start(player) {
    if (this.active) return;
    this.active = true;

    // 创建玩家模型
    if (!this.playerAvatar) {
      this.playerAvatar = this._createPlayerAvatar();
    }

    // 重置状态
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.lives = MAX_LIVES;
    this.speedMultiplier = 1.0;
    this._targetLane = 1;
    this._targetX = 0;
    this._isSliding = false;
    this._slideTimer = 0;
    this._respawnCooldown = 0;
    this._wasOnGround = false;
    this._laneSwitched = false;

    // 记录起点（固定高空）
    this.startPos.set(0, PARKOUR_START_Y + 1, Math.floor(player.position.z));
    player.position.copy(this.startPos);
    player.velocity.set(0, 0, 0);

    // 备份玩家状态
    this._savedState = {
      position: this.startPos.clone(),
      yaw: player.yaw,
      pitch: player.pitch,
      moveSpeed: player.moveSpeed,
      jumpSpeed: player.jumpSpeed,
      gravity: player.gravity,
    };

    // 设置跑酷物理参数
    player.yaw = 0;
    player.pitch = -0.05;
    player.gravity = PARKOUR_GRAVITY;
    player.jumpSpeed = PARKOUR_JUMP_SPEED;

    // 清理旧障碍物和路径
    this._clearAllObstacles();
    this._clearAllPath();

    // 将跑道容器加入场景
    this.scene.add(this._pathGroup);

    // 初始化路径
    this._pathMinZ = Math.floor(player.position.z) + 5;
    this._layPath(Math.floor(player.position.z) - 30);

    // 初始化障碍物生成位置
    this._nextSpawnZ = Math.floor(player.position.z) - 20;

    if (this.audio && typeof this.audio.playJump === 'function') this.audio.playJump();
    this.showMessage('🏃 跑酷启动！A/D 切换车道 · 空格跳跃 · S 滑铲');
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
      player.yaw = this._savedState.yaw;
      player.pitch = this._savedState.pitch;
    }

    // 清理障碍物和路径
    this._clearAllObstacles();
    this._clearAllPath();
    this.scene.remove(this._pathGroup);

    this.showMessage('退出跑酷模式');
  }

  /** 清理所有障碍物 */
  _clearAllObstacles() {
    for (const obs of this.obstacles) {
      this.scene.remove(obs);
      obs.geometry.dispose();
      obs.material.dispose();
    }
    this.obstacles = [];
  }

  /** 清理所有路径方块 */
  _clearAllPath() {
    for (const b of this._placedBlocks) {
      this._pathGroup.remove(b.mesh);
    }
    this._placedBlocks = [];
    this._pathBlockSet.clear();
  }

  /** 玩家失败：扣命 + 重置 */
  _onFail(player) {
    this.lives--;
    if (this.audio) this.audio.playDamage();

    if (this.lives <= 0) {
      this.showMessage(`💀 跑酷失败！得分 ${this.score} | 距离 ${Math.floor(this.distance)} | 金币 ${this.coins}`);
      this.stop(player);
      // 不设置玩家位置，由游戏循环检测 active=false 后恢复到出生点
      return;
    }

    // 原地重置：保持在当前 Z 位置（路径仍在），重置到跑道顶面，避免传送到已清理的旧区域
    player.position.set(0, PARKOUR_START_Y + 1, Math.floor(player.position.z));
    player.velocity.set(0, 0, 0);
    this._targetLane = 1;
    this._targetX = 0;
    this._isSliding = false;
    this._respawnCooldown = 1.0;
    this.showMessage(`💔 剩余生命 ${this.lives}/${MAX_LIVES}`);
  }

  /** 显示消息 */
  showMessage(msg) {
    this._message = msg;
    this._messageTimer = 2.5;
  }

  /* ============================================
     主更新循环
     ============================================ */
  update(dt, player) {
    if (!this.active) return;

    // 限制最大帧间隔
    dt = Math.min(dt, 0.05);

    // 消息计时
    if (this._messageTimer > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) this._message = '';
    }

    // 失败重置冷却
    if (this._respawnCooldown > 0) {
      this._respawnCooldown -= dt;
    }

    // 速度倍率：每 100 米提升 10%
    this.speedMultiplier = 1.0 + Math.floor(this.distance / 100) * 0.1;
    const runSpeed = PARKOUR_RUN_SPEED * this.speedMultiplier;

    // === 自动前进（-Z 方向） ===
    player.velocity.z = -runSpeed;

    // === 车道切换（A/D 或 ←/→） ===
    if (player.keys['KeyA'] || player.keys['ArrowLeft']) {
      if (this._targetLane > 0 && !this._laneSwitched) {
        this._targetLane--;
        this._targetX = LANE_X[this._targetLane];
        this._laneSwitched = true;
      }
    } else if (player.keys['KeyD'] || player.keys['ArrowRight']) {
      if (this._targetLane < 2 && !this._laneSwitched) {
        this._targetLane++;
        this._targetX = LANE_X[this._targetLane];
        this._laneSwitched = true;
      }
    } else {
      this._laneSwitched = false;
    }

    // 平滑插值到目标车道 X
    player.velocity.x = (this._targetX - player.position.x) * 12;

    // === 重力 ===
    player.velocity.y += PARKOUR_GRAVITY * dt;

    // === 跳跃（空格，仅地面） ===
    if ((player.keys['Space'] || player.keys['KeyK']) && player.onGround && !this._isSliding) {
      player.velocity.y = PARKOUR_JUMP_SPEED;
      player.onGround = false;
      if (this.audio && typeof this.audio.playJump === 'function') this.audio.playJump();
    }

    // === 滑铲（S 或 ↓，仅地面） ===
    if ((player.keys['KeyS'] || player.keys['ArrowDown']) && player.onGround && !this._isSliding) {
      this._isSliding = true;
      this._slideTimer = SLIDE_DURATION;
    }
    if (this._isSliding) {
      this._slideTimer -= dt;
      if (this._slideTimer <= 0) {
        this._isSliding = false;
      }
    }

    // === 跑酷专用碰撞检测（跑道方块不在体素世界中，不能用 _resolveCollision）===
    player.onGround = false;

    // X 轴：车道插值移动，无需碰撞检测（_targetX 已限制在车道范围）
    player.position.x += player.velocity.x * dt;

    // Y 轴：跑道支撑检测（跑道顶面 Y = PARKOUR_START_Y，跑道沿 Z 无限延伸）
    const trackTopY = PARKOUR_START_Y;
    player.position.y += player.velocity.y * dt;
    if (player.velocity.y <= 0 && player.position.y <= trackTopY) {
      // 下落且到达或低于跑道顶面：强制支撑
      player.position.y = trackTopY;
      player.velocity.y = 0;
      player.onGround = true;
    }

    // Z 轴：自动前进，无需碰撞检测（障碍物碰撞在 _checkCollisions 中处理）
    player.position.z += player.velocity.z * dt;

    // === 落地音效 ===
    if (player.onGround && !this._wasOnGround && player.velocity.y < -2) {
      if (this.audio) this.audio.playLand(BlockType.WOOD);
    }
    this._wasOnGround = player.onGround;

    // === 失败检测：掉落 ===
    const fallThreshold = this.startPos.y - PARKOUR_FALL_OFFSET;
    if (player.position.y < fallThreshold && this._respawnCooldown <= 0) {
      this._onFail(player);
      return;
    }

    // === 碰撞检测 ===
    const collision = this._checkCollisions(player);
    if (collision.hit && this._respawnCooldown <= 0) {
      this._onFail(player);
      return;
    }

    // === 路径铺设（玩家前方） ===
    this._layPath(Math.floor(player.position.z) - 40);

    // === 障碍物生成（玩家前方） ===
    while (this._nextSpawnZ > player.position.z - SPAWN_AHEAD_DISTANCE) {
      this._spawnObstacleGroup(this._nextSpawnZ);
      // 下一个障碍物间距
      const gap = MIN_OBSTACLE_GAP + Math.random() * (MAX_OBSTACLE_GAP - MIN_OBSTACLE_GAP);
      this._nextSpawnZ -= gap;
    }

    // === 清理过期障碍物和路径 ===
    this._cleanupObstacles(player.position.z);
    this._cleanupPath(player.position.z);

    // === 金币旋转动画 ===
    this._animateCoins(dt);

    // === 相机（第三人称，玩家后方上方） ===
    const targetCamPos = new THREE.Vector3(
      player.position.x * 0.5,  // 相机 X 跟随但减弱（避免晃动）
      player.position.y + 3.5,
      player.position.z + 7
    );
    player.camera.position.lerp(targetCamPos, Math.min(1, dt * 8));
    player.camera.lookAt(
      player.position.x * 0.5,
      player.position.y + 0.8,
      player.position.z - 5
    );

    // === 更新玩家模型 ===
    this._updatePlayerAvatar(player, dt);

    // === 距离 + 分数 ===
    this.distance = Math.max(this.distance, this.startPos.z - player.position.z);
    this.score = Math.max(this.score, Math.floor(this.distance * 5) + this.coins * 50);
  }

  /** 获取跑酷 HUD 数据 */
  getHUDData() {
    return {
      active: this.active,
      score: this.score,
      distance: Math.floor(this.distance),
      lives: this.lives,
      maxLives: MAX_LIVES,
      coins: this.coins,
      speed: Math.round(this.speedMultiplier * 100),
      lane: this._targetLane,
      sliding: this._isSliding,
      message: this._message,
    };
  }
}
