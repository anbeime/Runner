/**
 * 像素方块世界 - 游戏主模块
 * 包含：玩家控制、物理系统、射线检测、游戏循环
 */

import * as THREE from 'three';
import {
  World, Chunk, BlockType, BlockNames, isSolid,
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, getBlockColor,
  isMobileDevice, getRenderDistance,
} from './voxel.js?v=1783575000';
import { AnimalManager, ScoutBot, HeavyBot, BuilderBot } from './animals.js?v=1783575000';
import { GameAudio } from './audio.js?v=1783575000';
import { ParkourManager } from './parkour.js?v=1783575000';

/* ============================================
   玩家类 - 第一人称角色控制
   ============================================ */
class Player {
  constructor(camera, world, audio) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    // 位置与速度（出生点在文字墙正对面，面朝立墙）
    // 文字墙位于 z=0，玩家应在 z>0 位置，yaw=0 时看向负Z方向（南）
    // 文字墙基底 Y=19，顶部 Y=27，玩家站在沙地 Y=18 上方
    this.position = new THREE.Vector3(0, 22, 35);  // 在立墙前方35格处，站在沙地上
    this.velocity = new THREE.Vector3(0, 0, 0);

    // 视角旋转（欧拉角）
    // 微俯视以更好观看文字墙（pitch 负值为向上看）
    this.pitch = -0.25;   // 上下俯仰（约-14度，略微向上）
    this.yaw = 0;         // 左右偏航（面向负Z方向=南=文字墙）

    // 物理参数
    this.gravity = -25;
    this.jumpSpeed = 12;
    this.moveSpeed = 5.5;
    this.onGround = false;
    this._wasOnGround = false;
    this._wasInWater = false;
    this._footstepAccum = 0; // 脚步声累积距离

    // 玩家碰撞体尺寸
    this.width = 0.6;
    this.height = 1.75;
    this.eyeHeight = 1.6;

    // 输入状态
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;

    // 交互参数
    this.reachDistance = 7;
    this.selectedBlock = BlockType.GRASS;

    // 射线检测结果缓存
    this.targetBlock = null;
    this.targetFace = null;

    // 出生点（掉出世界后复活用）
    this.spawnPoint = new THREE.Vector3(0, 22, 35);
  }

  /** 处理鼠标移动（视角旋转） */
  onMouseMove(dx, dy) {
    const sensitivity = 0.002;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    // 限制俯仰角范围
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  /** 每帧更新：物理、碰撞、视角 */
  update(dt) {
    // 限制最大帧间隔，防止穿墙
    dt = Math.min(dt, 0.05);

    // 计算移动方向（基于视角）
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    ).normalize();

    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();

    // 根据输入计算目标速度
    const moveDir = new THREE.Vector3(0, 0, 0);
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    // 水平移动
    this.velocity.x = moveDir.x * this.moveSpeed;
    this.velocity.z = moveDir.z * this.moveSpeed;

    // === 水物理检测 ===
    const footBlock = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y),
      Math.floor(this.position.z)
    );
    const eyeBlock = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + this.eyeHeight),
      Math.floor(this.position.z)
    );
    const inWater = (footBlock === BlockType.WATER || eyeBlock === BlockType.WATER);

    // 重力：水中大幅降低
    const effectiveGravity = inWater ? this.gravity * 0.15 : this.gravity;
    this.velocity.y += effectiveGravity * dt;

    // 水中游泳：按住空格上浮
    if (inWater && (this.keys['Space'] || this.keys['KeyK'])) {
      this.velocity.y = 3;
      this.onGround = false;
    }

    // 跳跃（仅在地面且不在水中）
    if (!inWater && (this.keys['Space'] || this.keys['KeyK']) && this.onGround) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
      if (this.audio) this.audio.playJump();
    }

    // 水中移动减速
    if (inWater) {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
    }

    // 逐轴移动并进行碰撞检测
    this.onGround = false;

    // X轴
    this.position.x += this.velocity.x * dt;
    this._resolveCollision('x');

    // Y轴
    this.position.y += this.velocity.y * dt;
    this._resolveCollision('y');

    // Z轴
    this.position.z += this.velocity.z * dt;
    this._resolveCollision('z');

    // 防止掉出世界：传送回出生点
    if (this.position.y < -10) {
      this.position.copy(this.spawnPoint);
      this.velocity.set(0, 0, 0);
    }

    // 更新相机
    this.camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );

    // 更新相机朝向
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(
      this.camera.position.x + lookDir.x,
      this.camera.position.y + lookDir.y,
      this.camera.position.z + lookDir.z
    );

    // 射线检测（目标方块）
    this._raycast();

    // === 音效触发 ===
    if (this.audio) {
      // 落地音效
      if (this.onGround && !this._wasOnGround && this.velocity.y < -2) {
        const belowBlock = this.world.getBlock(
          Math.floor(this.position.x),
          Math.floor(this.position.y - 0.1),
          Math.floor(this.position.z)
        );
        this.audio.playLand(belowBlock);
      }
      // 入水音效
      if (inWater && !this._wasInWater) {
        this.audio.playSplash();
      }
      // 脚步声
      if (this.onGround) {
        const isMoving = Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1;
        if (isMoving) {
          this._footstepAccum += Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2) * dt;
          if (this._footstepAccum > 2.2) {
            this._footstepAccum = 0;
            const groundBlock = this.world.getBlock(
              Math.floor(this.position.x),
              Math.floor(this.position.y - 0.1),
              Math.floor(this.position.z)
            );
            this.audio.playFootstep(groundBlock);
          }
        }
      }
    }

    this._wasOnGround = this.onGround;
    this._wasInWater = inWater;
  }

  /**
   * AABB 碰撞检测与解决
   * 沿指定轴检测碰撞并推出
   */
  _resolveCollision(axis) {
    const halfW = this.width / 2;
    const min = new THREE.Vector3(
      this.position.x - halfW,
      this.position.y,
      this.position.z - halfW
    );
    const max = new THREE.Vector3(
      this.position.x + halfW,
      this.position.y + this.height,
      this.position.z + halfW
    );

    // 检测范围内所有可能的方块
    const startX = Math.floor(min.x);
    const endX = Math.floor(max.x);
    const startY = Math.floor(min.y);
    const endY = Math.floor(max.y);
    const startZ = Math.floor(min.z);
    const endZ = Math.floor(max.z);

    for (let bx = startX; bx <= endX; bx++) {
      for (let by = startY; by <= endY; by++) {
        for (let bz = startZ; bz <= endZ; bz++) {
          const blockType = this.world.getBlock(bx, by, bz);
          if (blockType === BlockType.AIR) continue;

          const isWater = blockType === BlockType.WATER;

          // 水方块特殊处理：仅在Y轴下落时充当"地面"
          if (isWater) {
            if (axis !== 'y' || this.velocity.y >= 0) continue;
            // 只有下落接触水面才阻挡
            const blockMinW = { x: bx, y: by, z: bz };
            const blockMaxW = { x: bx + 1, y: by + 1, z: bz + 1 };
            if (min.x < blockMaxW.x && max.x > blockMinW.x &&
                min.y < blockMaxW.y && max.y > blockMinW.y &&
                min.z < blockMaxW.z && max.z > blockMinW.z) {
              this.position.y = blockMaxW.y;
              this.velocity.y = 0;
              this.onGround = true;
              min.y = this.position.y;
              max.y = this.position.y + this.height;
            }
            continue;
          }

          // 固体方块的 AABB
          const blockMin = { x: bx, y: by, z: bz };
          const blockMax = { x: bx + 1, y: by + 1, z: bz + 1 };

          // 检测 AABB 重叠
          if (min.x < blockMax.x && max.x > blockMin.x &&
              min.y < blockMax.y && max.y > blockMin.y &&
              min.z < blockMax.z && max.z > blockMin.z) {

            // 沿指定轴推出
            if (axis === 'x') {
              if (this.velocity.x > 0) {
                this.position.x = blockMin.x - halfW;
              } else {
                this.position.x = blockMax.x + halfW;
              }
              this.velocity.x = 0;
            } else if (axis === 'y') {
              if (this.velocity.y > 0) {
                this.position.y = blockMin.y - this.height;
              } else {
                this.position.y = blockMax.y;
                this.onGround = true;
              }
              this.velocity.y = 0;
            } else if (axis === 'z') {
              if (this.velocity.z > 0) {
                this.position.z = blockMin.z - halfW;
              } else {
                this.position.z = blockMax.z + halfW;
              }
              this.velocity.z = 0;
            }

            // 更新碰撞体范围
            min.x = this.position.x - halfW;
            max.x = this.position.x + halfW;
            min.y = this.position.y;
            max.y = this.position.y + this.height;
            min.z = this.position.z - halfW;
            max.z = this.position.z + halfW;
          }
        }
      }
    }
  }

  /**
   * DDA 射线检测算法
   * 从相机位置沿视线方向步进，找到第一个实体方块
   */
  _raycast() {
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    this.targetBlock = null;
    this.targetFace = null;

    // DDA 参数
    const step = 0.05;
    const maxSteps = this.reachDistance / step;
    let prevX = Math.floor(origin.x);
    let prevY = Math.floor(origin.y);
    let prevZ = Math.floor(origin.z);

    for (let i = 0; i < maxSteps; i++) {
      const t = i * step;
      const x = Math.floor(origin.x + direction.x * t);
      const y = Math.floor(origin.y + direction.y * t);
      const z = Math.floor(origin.z + direction.z * t);

      // 跳过相同方块
      if (x === prevX && y === prevY && z === prevZ) continue;

      const block = this.world.getBlock(x, y, z);
      if (isSolid(block)) {
        this.targetBlock = { x, y, z, type: block };

        // 计算命中面的法线（上一步与当前步的差值）
        this.targetFace = {
          x: prevX - x,
          y: prevY - y,
          z: prevZ - z,
        };
        return;
      }

      prevX = x;
      prevY = y;
      prevZ = z;
    }
  }

  /** 放置方块 */
  placeBlock() {
    if (!this.targetBlock || !this.targetFace) return false;

    const px = this.targetBlock.x + this.targetFace.x;
    const py = this.targetBlock.y + this.targetFace.y;
    const pz = this.targetBlock.z + this.targetFace.z;

    // 检查新方块是否与玩家碰撞
    const halfW = this.width / 2;
    const playerMin = {
      x: this.position.x - halfW, y: this.position.y, z: this.position.z - halfW
    };
    const playerMax = {
      x: this.position.x + halfW, y: this.position.y + this.height, z: this.position.z + halfW
    };

    if (px + 1 > playerMin.x && px < playerMax.x &&
        py + 1 > playerMin.y && py < playerMax.y &&
        pz + 1 > playerMin.z && pz < playerMax.z) {
      return false; // 不能在玩家位置放置
    }

    if (py < 0 || py >= CHUNK_HEIGHT) return false;
    if (this.world.getBlock(px, py, pz) !== BlockType.AIR) return false;

    this.world.setBlock(px, py, pz, this.selectedBlock);
    if (this.audio) this.audio.playBlockPlace(this.selectedBlock);
    return true;
  }

  /** 破坏方块 */
  breakBlock() {
    if (!this.targetBlock) return false;

    const { x, y, z } = this.targetBlock;
    if (y < 0 || y >= CHUNK_HEIGHT) return false;

    const prevBlock = this.world.getBlock(x, y, z);
    this.world.setBlock(x, y, z, BlockType.AIR);
    if (this.audio) this.audio.playBlockBreak(prevBlock);
    return true;
  }
}

/* ============================================
   高亮方块线框
   ============================================ */
class BlockHighlight {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2, transparent: true, opacity: 0.6 });
    this.mesh = new THREE.LineSegments(edges, mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(targetBlock) {
    if (targetBlock) {
      this.mesh.position.set(targetBlock.x + 0.5, targetBlock.y + 0.5, targetBlock.z + 0.5);
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}

/* ============================================
   触摸控制器（移动端专用）
   ============================================ */
class TouchController {
  constructor(player, game) {
    this.player = player;
    this.game = game;
    this.moveX = 0;    // -1 ~ 1 左右
    this.moveZ = 0;    // -1 ~ 1 前后
    this._joystickId = null;
    this._lookTouchId = null;
    this._lastTouchX = 0;
    this._lastTouchY = 0;
    this._init();
  }

  _init() {
    const zone = document.getElementById('joystickZone');
    const thumb = document.getElementById('joystickThumb');
    const canvas = this.game.canvas;

    // 用 pointerId 区分摇杆触点和视角触点，支持多点同时操作
    this._joystickId = null;
    this._lookTouchId = null;

    // ----- 虚拟摇杆 -----
    const findJoystickTouch = (e) => {
      if (this._joystickId === null) return null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === this._joystickId) return e.touches[i];
      }
      return null;
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._joystickId === null) {
        this._joystickId = e.changedTouches[0].identifier;
      }
      const t = findJoystickTouch(e);
      if (t) this._updateJoystick(t, zone, thumb);
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findJoystickTouch(e);
      if (t) this._updateJoystick(t, zone, thumb);
    }, { passive: false });
    zone.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._joystickId === e.changedTouches[0].identifier) {
        this._joystickId = null;
      }
      this.moveX = 0;
      this.moveZ = 0;
      thumb.style.transform = 'translate(-50%, -50%)';
    });
    zone.addEventListener('touchcancel', (e) => {
      if (this._joystickId === e.changedTouches[0].identifier) {
        this._joystickId = null;
      }
      this.moveX = 0;
      this.moveZ = 0;
      thumb.style.transform = 'translate(-50%, -50%)';
    });

    // ----- 视角控制（右侧区域） -----
    // 找一个非摇杆触点用于视角
    const findLookTouch = (e) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier !== this._joystickId && t.clientX > window.innerWidth * 0.35) {
          return t;
        }
      }
      return null;
    };

    canvas.addEventListener('touchstart', (e) => {
      // 只在有新触点落在右侧区域时开启视角（排除UI按钮区域）
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        // 跳过落在操作按钮区域的触摸
        if (t.target && t.target.closest && t.target.closest('#actionButtons, #joystickZone, #mobileHotbar')) continue;
        if (t.identifier !== this._joystickId && t.clientX > window.innerWidth * 0.35) {
          this._lookTouchId = t.identifier;
          this._lastTouchX = t.clientX;
          this._lastTouchY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this._lookTouchId === null) return;
      // 在全部触点中找到我们的视角触点
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === this._lookTouchId) {
          const dx = t.clientX - this._lastTouchX;
          const dy = t.clientY - this._lastTouchY;
          if (this.player && typeof this.player.onMouseMove === 'function') {
            this.player.onMouseMove(dx * 1.8, dy * 1.8);
          }
          this._lastTouchX = t.clientX;
          this._lastTouchY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    });
    canvas.addEventListener('touchcancel', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    });

    // ----- 操作按钮 -----
    const btnJump = document.getElementById('btnJump');
    const btnPlace = document.getElementById('btnPlace');
    const btnBreak = document.getElementById('btnBreak');

    // 按钮按下时的视觉反馈
    const _flashBtn = (btn, isError) => {
      if (!btn) return;
      const bg = isError ? 'rgba(255, 80, 80, 0.4)' : 'rgba(255, 255, 255, 0.35)';
      const border = isError ? 'rgba(255, 80, 80, 0.7)' : 'rgba(255, 255, 255, 0.6)';
      btn.style.background = bg;
      btn.style.borderColor = border;
      btn.style.transition = 'background 0.1s, border-color 0.1s';
      setTimeout(() => {
        btn.style.background = 'rgba(255, 255, 255, 0.12)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      }, 150);
    };

    // 触觉反馈（设备支持时）
    const _haptic = (pattern) => {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    };

    if (btnJump) {
      const _jumpDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player && this.player.keys) this.player.keys['Space'] = true;
        _flashBtn(btnJump);
      };
      const _jumpUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player && this.player.keys) this.player.keys['Space'] = false;
      };
      btnJump.addEventListener('pointerdown', _jumpDown);
      btnJump.addEventListener('pointerup', _jumpUp);
      btnJump.addEventListener('pointercancel', _jumpUp);
      btnJump.addEventListener('pointerleave', _jumpUp);
    }

    if (btnPlace) {
      const _placeDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player && typeof this.player.placeBlock === 'function') {
          const ok = this.player.placeBlock();
          _flashBtn(btnPlace, !ok);
          if (!ok) _haptic(10);
        }
      };
      btnPlace.addEventListener('pointerdown', _placeDown);
    }

    if (btnBreak) {
      const _breakDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player && typeof this.player.breakBlock === 'function') {
          const ok = this.player.breakBlock();
          _flashBtn(btnBreak, !ok);
          if (!ok) _haptic(10);
        }
      };
      btnBreak.addEventListener('pointerdown', _breakDown);
    }
  }

  _updateJoystick(touch, zone, thumb) {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width / 2 - 25;

    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxR) {
      dx = dx / dist * maxR;
      dy = dy / dist * maxR;
    }

    this.moveX = dx / maxR;
    this.moveZ = dy / maxR;

    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

/* ============================================
   游戏主类
   ============================================ */
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.isRunning = false;
    this.isPointerLocked = false;

    // 设备检测
    this.isMobile = isMobileDevice();
    this.renderDistance = getRenderDistance();

    // Three.js 核心对象
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // 游戏对象
    this.world = null;
    this.player = null;
    this.highlight = null;
    this.touchController = null;
    this.animalManager = null;
    this.parkourManager = null;

    // 帧率统计
    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.fpsTime = 0;
    this.fps = 0;

    // UI 元素
    this.ui = {
      crosshair: document.getElementById('crosshair'),
      hotbar: document.getElementById('hotbar'),
      selectedBlockName: document.getElementById('selectedBlockName'),
      debugInfo: document.getElementById('debugInfo'),
      blockHighlight: document.getElementById('blockHighlight'),
      startScreen: document.getElementById('startScreen'),
      pauseScreen: document.getElementById('pauseScreen'),
      loadingBar: document.getElementById('loadingBar'),
      loadingFill: document.getElementById('loadingFill'),
      controlsPanel: document.getElementById('controlsPanel'),
    };

    // 可选方块列表（扩展版，来自 pycraft）
    this.blockTypes = [
      BlockType.GRASS, BlockType.DIRT, BlockType.STONE,
      BlockType.SAND, BlockType.WOOD, BlockType.LEAVES,
      BlockType.COBBLESTONE, BlockType.BIRCH_WOOD, BlockType.BRICK,
      BlockType.GLASS, BlockType.SANDSTONE, BlockType.MOSSY_COBBLESTONE,
      BlockType.SNOW_BLOCK, BlockType.DIAMOND_BLOCK,
    ];
    this.selectedSlot = 0;
    
    // 云彩系统
    this.clouds = null;

    // 背景音乐
    this.audio = new GameAudio();
    this._musicStarted = false;
  }

  /** 初始化游戏 */
  async init() {
    // 先绑定事件（按钮等），确保即使后续 3D 初始化失败也能点击
    this._initEvents();

    this._initRenderer();

    // WebGL 不可用时：跳过 3D 初始化，按钮已绑定，点击会给出提示
    if (this.webglAvailable !== true) {
      console.log('[init] WebGL 不可用，跳过 3D 初始化，按钮已绑定');
      return;
    }

    this._initScene();
    this._initPlayer();
    this._initHighlight();
    this._initHotbar();
    if (this.isMobile) this._initMobileHotbar();

    // 设置预览视角：近距离平视"BILIBILI"立墙
    this.camera.position.set(0, 23, 12);
    this.camera.lookAt(0, 25, 0);

    // 开始界面保持显示，背后渲染 3D 世界
    this.ui.loadingBar.style.display = 'block';

    // 早期标记初始化完成：避免移动端区块加载耗时超过诊断超时（3秒）
    // 区块加载循环可能耗时较长（移动端约49个区块 + setTimeout 让步），不应阻塞就绪标记
    window.__gameReady = true;
    // 早期启动渲染循环：让开始界面背后逐步呈现世界，同时区块仍在加载
    if (this.webglAvailable) {
      this.animate();
    }

    const radius = this.renderDistance;

    // 按离世界中心距离排序，优先加载"BILIBILI"立墙区域
    const chunksToLoad = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        chunksToLoad.push([dx, dz]);
      }
    }
    chunksToLoad.sort((a, b) => {
      const dA = a[0] * a[0] + a[1] * a[1];
      const dB = b[0] * b[0] + b[1] * b[1];
      return dA - dB;
    });

    const needed = chunksToLoad.length;
    let generated = 0;
    let firstFrameDone = false;

    for (const [cx, cz] of chunksToLoad) {
      const key = this.world.chunkKey(cx, cz);
      if (!this.world.chunks.has(key)) {
        const chunk = await this._createChunk(cx, cz);
        if (chunk.mesh) this.scene.add(chunk.mesh);
        if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.add(chunk.flowerMesh);
        generated++;
        this.ui.loadingFill.style.width = `${(generated / needed * 100) | 0}%`;

        // 中心区块加载完毕后立即渲染首帧（确保"BILIBILI"立墙可见）
        if (!firstFrameDone && cx * cx + cz * cz <= 4) {
          this.renderer.render(this.scene, this.camera);
          firstFrameDone = true;
        }

        this.renderer.render(this.scene, this.camera);
        // 移动端每 2 个区块让步一次（降低 setTimeout 节流累计耗时），桌面端每 3 个
        if (generated % (this.isMobile ? 2 : 3) === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    // 出生在立墙前方（仅设玩家数据，相机保持在立墙视角）
    this._spawnX = 5.4;
    this._spawnZ = 22.6;
    // 从上往下扫描找到地表高度（避免出生在地下）
    this._spawnY = 20;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (isSolid(this.world.getBlock(Math.floor(this._spawnX), y, Math.floor(this._spawnZ)))) {
        this._spawnY = y + 1;
        break;
      }
    }
    this.player.position.set(this._spawnX, this._spawnY, this._spawnZ);
    this.player.spawnPoint.set(this._spawnX, this._spawnY, this._spawnZ);
    this.player.yaw = 0;              // 面朝正北，正对树叶文字立墙
    this.player.pitch = -0.3;         // 微俯视，观赏立墙全貌

    // 相机保持立墙预览视角，等用户点击开始后再切到玩家视角
    // 不做 camera.position 移动，保持背景一直是游戏世界

    this.ui.loadingBar.style.display = 'none';

    // 在世界中生成小机器人
    this.animalManager.spawnAnimals();
  }

  /** 创建区块 */
  _createChunk(cx, cz) {
    const key = this.world.chunkKey(cx, cz);
    if (this.world.chunks.has(key)) return this.world.chunks.get(key);

    const chunk = new Chunk(cx, cz);
    this.world.generateChunkData(chunk);
    chunk.buildMesh(
      (wx, wy, wz) => this.world.getBlock(wx, wy, wz),
      this.world.material, this.world.waterMaterial, this.world.flowerMaterial
    );
    this.world.chunks.set(key, chunk);
    return chunk;
  }

  /** 初始化渲染器 */
  _initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: this.isMobile ? 'low-power' : 'default',
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      // 移动端降低像素比以提升性能
      const maxPixelRatio = this.isMobile ? 1.2 : 2;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
      this.renderer.setClearColor(0x87CEEB);
      this.webglAvailable = true;
    } catch (err) {
      console.error('[Renderer] WebGL 初始化失败:', err);
      this.renderer = null;
      this.webglAvailable = false;
      // 显示 WebGL 不可用提示（不阻断后续事件绑定）
      this._showWebGLError();
    }
  }

  /** 显示 WebGL 不可用提示 */
  _showWebGLError() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:200;background:rgba(20,0,0,0.95);color:#fff;padding:24px 32px;border-radius:12px;border:1px solid #c0392b;max-width:480px;text-align:center;font:14px/1.6 sans-serif;box-shadow:0 0 40px rgba(192,57,43,0.5);';
    div.innerHTML = '<div style="font-size:40px;margin-bottom:12px;">⚠️</div>' +
      '<div style="font-size:18px;font-weight:bold;color:#ff6b6b;margin-bottom:10px;">WebGL 不可用</div>' +
      '<div style="color:#ccc;margin-bottom:14px;">你的浏览器或环境禁用了 WebGL，无法渲染 3D 场景。</div>' +
      '<div style="color:#999;font-size:12px;">请尝试：<br>1. 在 Chrome/Edge 浏览器中打开<br>2. 开启浏览器硬件加速（设置→系统）<br>3. 更新显卡驱动</div>';
    document.body.appendChild(div);
  }

  /** 初始化场景与灯光 */
  _initScene() {
    this.scene = new THREE.Scene();

    // 雾效：距离根据设备动态调整，移动端增加雾距避免近处物体泛蓝
    const fogFar = this.renderDistance * CHUNK_SIZE + 4;
    const fogNear = this.isMobile ? Math.max(25, fogFar - 20) : Math.max(15, fogFar - 40);
    this.scene.fog = new THREE.Fog(0x87CEEB, fogNear, fogFar);

    // 环境光
    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.7);
    this.scene.add(ambientLight);

    // 方向光（模拟太阳）
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(50, 100, 30);
    this.scene.add(dirLight);

    // 半球光（天空+地面反射）
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x556633, 0.3);
    this.scene.add(hemiLight);

    // 初始化世界并设置渲染距离
    this.world = new World(this.scene);
    this.world.renderDistance = this.renderDistance;
    this.world.init();
    
    // 初始化云彩系统（来自 pycraft）
    this._initClouds();

    // 初始化机器人生成管理器
    this.animalManager = new AnimalManager(this.scene, this.world, this.isMobile);

    // 初始化跑酷模式管理器（融合跑酷 + 建造）— try-catch 保护，避免阻断后续 _initEvents
    try {
      this.parkourManager = new ParkourManager(
        this.scene, this.world, this.audio
      );
    } catch (err) {
      console.error('[ParkourManager] 初始化失败:', err);
      this.parkourManager = null;
    }

    // 相机：移动端更广视角（90°），桌面端默认（75°）
    this.defaultFov = this.isMobile ? 90 : 75;
    this.fov = this.defaultFov;
    this.fovMin = 15;
    this.fovMax = 130;
    this.camera = new THREE.PerspectiveCamera(
      this.fov, window.innerWidth / window.innerHeight, 0.1, 1000
    );
  }

  /** 初始化玩家 */
  _initPlayer() {
    this.player = new Player(this.camera, this.world, this.audio);
  }

  /** 初始化云彩系统（来自 pycraft 美化） */
  _initClouds() {
    // 云彩使用多个半透明白色平面组成
    const cloudGroup = new THREE.Group();
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    
    // 生成随机分布的云朵
    const cloudCount = this.isMobile ? 15 : 30; // 移动端减少云量
    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Group();
      
      // 每朵云由2-5个椭圆组成
      const puffCount = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < puffCount; j++) {
        const width = 8 + Math.random() * 12;
        const height = 3 + Math.random() * 2;
        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, cloudMaterial);
        mesh.position.set(
          (Math.random() - 0.5) * width * 0.8,
          (Math.random() - 0.5) * height * 0.3,
          0
        );
        cloud.add(mesh);
      }
      
      // 云朵位置：高度80-120，随机分布在世界周围
      cloud.position.set(
        (Math.random() - 0.5) * 200,
        80 + Math.random() * 40,
        (Math.random() - 0.5) * 200
      );
      cloudGroup.add(cloud);
    }
    
    this.clouds = cloudGroup;
    this.scene.add(cloudGroup);
  }

  /** 初始化方块高亮 */
  _initHighlight() {
    this.highlight = new BlockHighlight(this.scene);
  }

  /** 初始化物品栏UI */
  _initHotbar() {
    const hotbar = this.ui.hotbar;
    hotbar.innerHTML = '';

    this.blockTypes.forEach((type, i) => {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot${i === 0 ? ' selected' : ''}`;
      slot.dataset.index = i;

      const preview = document.createElement('div');
      preview.className = 'block-preview';
      preview.style.background = getBlockColor(type);
      // 添加3D效果
      preview.style.boxShadow = 'inset -3px -3px 0 rgba(0,0,0,0.25), inset 3px 3px 0 rgba(255,255,255,0.15)';
      slot.appendChild(preview);

      const keyLabel = document.createElement('span');
      keyLabel.className = 'slot-key';
      keyLabel.textContent = i + 1;
      slot.appendChild(keyLabel);

      hotbar.appendChild(slot);
    });
  }

  /** 更新物品栏选中状态 */
  _updateHotbar() {
    const slots = this.ui.hotbar.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selectedSlot);
    });
    this.player.selectedBlock = this.blockTypes[this.selectedSlot];

    // 更新选中方块名称提示（热键栏上方）
    const name = BlockNames[this.blockTypes[this.selectedSlot]] || '';
    const nameEl = this.ui.selectedBlockName;
    if (nameEl) {
      nameEl.textContent = name;
      // 切换时短暂放大动画
      nameEl.style.transform = 'translateX(-50%) scale(1.15)';
      nameEl.style.opacity = '1';
      setTimeout(() => {
        nameEl.style.transform = 'translateX(-50%) scale(1)';
      }, 120);
    }

    // 同步更新移动端物品栏
    if (this.isMobile) this._updateMobileHotbar();
  }

  /** 初始化移动端物品栏 */
  _initMobileHotbar() {
    const mobileHotbar = document.getElementById('mobileHotbar');
    if (!mobileHotbar) return;
    mobileHotbar.innerHTML = '';

    this.blockTypes.forEach((type, i) => {
      const slot = document.createElement('div');
      slot.className = `m-slot${i === 0 ? ' selected' : ''}`;
      slot.dataset.index = i;

      const preview = document.createElement('div');
      preview.className = 'm-block-preview';
      preview.style.background = getBlockColor(type);
      preview.style.boxShadow = 'inset -2px -2px 0 rgba(0,0,0,0.25), inset 2px 2px 0 rgba(255,255,255,0.15)';
      slot.appendChild(preview);

      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.selectedSlot = i;
        this._updateHotbar();
      });

      mobileHotbar.appendChild(slot);
    });
  }

  /** 更新移动端物品栏选中状态 */
  _updateMobileHotbar() {
    const slots = document.querySelectorAll('#mobileHotbar .m-slot');
    slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selectedSlot);
    });
  }

  /** 绑定事件监听 */
  _initEvents() {
    // === 优先绑定按钮事件（确保即使后续抛错也能点击）===
    const sandboxBtn = this.ui.startScreen.querySelector('[data-mode="sandbox"]');
    const parkourBtn = this.ui.startScreen.querySelector('[data-mode="parkour"]');
    if (sandboxBtn) sandboxBtn.addEventListener('click', () => this._enterGame('sandbox'));
    if (parkourBtn) parkourBtn.addEventListener('click', () => this._enterGame('parkour'));

    // 键盘事件（桌面端 + 移动端外接键盘通用）
    document.addEventListener('keydown', (e) => {
      if (!this.player) return;
      this.player.keys[e.code] = true;

      // 数字键选择方块
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const idx = parseInt(e.code.charAt(5)) - 1;
        if (idx < this.blockTypes.length) {
          this.selectedSlot = idx;
          this._updateHotbar();
        }
      }

      // ESC 暂停（移动端也支持）
      if (e.code === 'Escape' && this.isRunning) {
        if (this.isMobile) {
          this.isRunning = false;
          this.ui.pauseScreen.style.display = 'flex';
          this._showGameUI(false);
        }
      }

      // 视野调整快捷键（= 放大/缩小视野，- 缩小/扩大视野）
      if (e.code === 'Equal') {           // = 放大画面 → 视野变窄
        this._adjustFOV(-5);
      }
      if (e.code === 'Minus') {           // - 缩小画面 → 视野变广
        this._adjustFOV(5);
      }
      if (e.code === 'Digit0' || e.code === 'Numpad0') {  // 0 重置视野
        this._resetFOV();
      }
      
      // B键 - 命令BuilderBot在附近随机建造
      if (e.code === 'KeyB') {
        if (this.animalManager) {
          const built = this.animalManager.commandBuildNearPlayer(this.player.position);
          if (built) {
            this._showMessage('BuilderBot 开始建造！');
          } else {
            this._showMessage('没有空闲的 BuilderBot');
          }
        }
      }
      
      // V键 - 切换BuilderBot跟随/待命
      if (e.code === 'KeyV') {
        if (this.animalManager) {
          const bots = this.animalManager.robots.filter(a => a instanceof BuilderBot && !a.buildMode);
          if (bots.length > 0) {
            const bot = bots[0];
            if (bot.followingPlayer) {
              bot.stopFollow();
              this._showMessage('BuilderBot 待命');
            } else {
              bot.setFollowPlayer(this.player.position.clone());
              this._showMessage('BuilderBot 跟随中');
            }
          }
        }
      }
      
      // N键 - 生成新的BuilderBot
      if (e.code === 'KeyN') {
        if (this.animalManager && this.isRunning) {
          const bot = this.animalManager.spawnBuilderNearPlayer(this.player.position);
          if (bot) {
            this._showMessage('BuilderBot 已生成！');
          } else {
            this._showMessage('附近没有合适的生成位置');
          }
        }
      }

      // P键 - 切换跑酷模式（融合跑酷 + 建造）
      if (e.code === 'KeyP' && this.isRunning) {
        if (this.parkourManager) {
          if (this.parkourManager.active) {
            this.parkourManager.stop(this.player);
            this._setWorldVisible(true);
            // 恢复玩家到出生点
            this.player.position.copy(this.player.spawnPoint);
            this.player.velocity.set(0, 0, 0);
            this._updateParkourHUD(false);
          } else {
            this._setWorldVisible(false);
            this.parkourManager.start(this.player);
            this._updateParkourHUD(true);
          }
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      if (!this.player) return;
      this.player.keys[e.code] = false;
    });

    // 鼠标移动（仅桌面端指针锁定后）
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.player.onMouseMove(e.movementX, e.movementY);
    });

    // 鼠标点击（仅桌面端指针锁定后，且不在跑酷模式）
    document.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked) return;
      if (this.parkourManager && this.parkourManager.active) return; // 跑酷模式禁用方块操作
      if (e.button === 0) {
        this.player.placeBlock();
      } else if (e.button === 2) {
        this.player.breakBlock();
      }
    });

    // 禁用右键菜单
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 滚轮切换方块（仅桌面端指针锁定后）
    document.addEventListener('wheel', (e) => {
      if (!this.isPointerLocked) return;

      // Ctrl + 滚轮 / 触控板双指缩放 → 调整视野
      // 捏合(deltaY>0) = 缩小画面 = 视野变广(FOV变大)；推开(deltaY<0) = 放大画面 = 视野变窄(FOV变小)
      if (e.ctrlKey) {
        this._adjustFOV(e.deltaY > 0 ? 5 : -5);
        return;
      }

      if (e.deltaY > 0) {
        this.selectedSlot = (this.selectedSlot + 1) % this.blockTypes.length;
      } else {
        this.selectedSlot = (this.selectedSlot - 1 + this.blockTypes.length) % this.blockTypes.length;
      }
      this._updateHotbar();
    });

    // ----- 桌面端：指针锁定逻辑 -----
    if (!this.isMobile) {
      document.addEventListener('pointerlockchange', () => {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
        if (this.isPointerLocked) {
          this.ui.pauseScreen.style.display = 'none';
          this._showGameUI(true);
        } else if (this.isRunning) {
          this.ui.pauseScreen.style.display = 'flex';
        }
      });

      const requestLock = () => {
        if (!this.isPointerLocked && this.isRunning) {
          this.canvas.requestPointerLock();
        }
      };

      this.ui.pauseScreen.addEventListener('click', requestLock);
      this.canvas.addEventListener('click', requestLock);
    }

    // ----- 移动端：直接进入游戏 + 触摸控制 -----
    if (this.isMobile) {

      this.ui.pauseScreen.addEventListener('click', () => {
        this.isRunning = true;
        this.ui.pauseScreen.style.display = 'none';
        this._showGameUI(true);
      });

      // 初始化触摸控制器
      this.touchController = new TouchController(this.player, this);
    }

    // 窗口尺寸变化
    window.addEventListener('resize', () => this._onResize());

    // 音乐开关按钮
    const btnMusic = document.getElementById('btnMusic');
    if (btnMusic) {
      btnMusic.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleMusic();
      });
    }
  }

  /**
   * 统一进入游戏入口
   * @param {'sandbox'|'parkour'} mode - sandbox 沙盒建造；parkour 试玩跑酷模式
   */
  _enterGame(mode) {
    if (this.isRunning) return;
    // WebGL 不可用：点击按钮给提示，不进入游戏
    if (!this.webglAvailable) {
      this._showMessage('⚠️ WebGL 不可用，无法启动 3D 游戏。请在 Chrome/Edge 中开启硬件加速后重试。');
      return;
    }
    this.isRunning = true;
    this.ui.startScreen.style.display = 'none';
    this._startMusic();

    // 生成一个 BuilderBot 在玩家附近（跑酷模式会用作路径建造者，沙盒模式自动建造建筑）
    if (this.animalManager && this.animalManager.robots) {
      const bx = this.player.position.x + 8;
      const bz = this.player.position.z - 10;
      // 从上往下扫描找地表高度（World 类没有 getHeightAt，用 getBlock 替代）
      let by = 20;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        if (isSolid(this.world.getBlock(Math.floor(bx), y, Math.floor(bz)))) {
          by = y + 1;
          break;
        }
      }
      const builder = new BuilderBot(this.scene, this.world, bx, by, bz);
      builder.setFollowPlayer(this.player.position.clone());
      this.animalManager.robots.push(builder);
      if (mode === 'sandbox') {
        this._showMessage('BuilderBot 已就绪，即将自动建造！');
      }
    }

    // 相机从立墙预览切到玩家第一人称
    this.camera.position.set(this._spawnX, this._spawnY + this.player.eyeHeight, this._spawnZ);
    const lookDir = new THREE.Vector3(
      -Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    this.camera.lookAt(
      this.camera.position.x + lookDir.x,
      this.camera.position.y + lookDir.y,
      this.camera.position.z + lookDir.z
    );

    // 桌面端请求指针锁定；移动端显示触控 UI
    if (!this.isMobile) {
      this.canvas.requestPointerLock();
    } else {
      this._showGameUI(true);
    }

    // 试玩跑酷模式：延迟一帧后启动跑酷（确保游戏循环已运行）
    if (mode === 'parkour' && this.parkourManager) {
      setTimeout(() => {
        if (this.parkourManager && !this.parkourManager.active) {
          this._setWorldVisible(false);
          this.parkourManager.start(this.player);
          this._updateParkourHUD(true);
        }
      }, 200);
    }
  }

  _showGameUI(show) {
    const display = show ? 'flex' : 'none';
    this.ui.crosshair.style.display = show ? 'block' : 'none';
    this.ui.selectedBlockName.style.display = show ? 'block' : 'none';
    this.ui.hotbar.style.display = this.isMobile ? 'none' : display; // 桌面端物品栏
    this.ui.debugInfo.style.display = show ? 'block' : 'none';
    this.ui.blockHighlight.style.display = 'none'; // 已禁用
    // 右上角操作说明面板（仅桌面端）
    if (!this.isMobile) {
      this.ui.controlsPanel.style.display = show ? 'flex' : 'none';
    }
    // 移动端控件：仅在移动端显示
    if (this.isMobile) {
      const mobileControls = document.getElementById('mobileControls');
      if (mobileControls) mobileControls.style.display = show ? 'block' : 'none';
    }
  }

  /** 更新跑酷模式 HUD */
  _updateParkourHUD(show) {
    let hud = document.getElementById('parkourHUD');
    if (!show) {
      if (hud) hud.style.display = 'none';
      return;
    }
    if (!hud) return; // DOM 元素由 index.html 提供
    const data = this.parkourManager.getHUDData();
    const hearts = '❤'.repeat(data.lives) + '🖤'.repeat(data.maxLives - data.lives);
    document.getElementById('parkourScore').textContent = data.score.toLocaleString();
    document.getElementById('parkourDistance').textContent = data.distance;
    document.getElementById('parkourLives').textContent = hearts;
    // 兼容新 endless runner 数据结构（金币 + 消息 + 车道）
    const coinEl = document.getElementById('parkourCoins');
    if (coinEl) coinEl.textContent = data.coins || 0;
    const segEl = document.getElementById('parkourSegment');
    if (segEl) {
      const laneNames = ['左', '中', '右'];
      const laneText = data.lane != null ? `车道:${laneNames[data.lane] || '中'}` : '';
      const slideText = data.sliding ? ' · 滑铲中' : '';
      segEl.textContent = `${laneText}${slideText}`;
    }
    document.getElementById('parkourSpeed').textContent = data.speed + '%';
    // 显示临时消息
    const msgEl = document.getElementById('parkourMessage');
    if (msgEl) {
      msgEl.textContent = data.message || '';
      msgEl.style.display = data.message ? 'block' : 'none';
    }
    hud.style.display = 'block';
  }

  /** 启动背景音乐 */
  _startMusic() {
    if (this._musicStarted) return;
    this._musicStarted = true;
    this.audio.init().then(() => {
      this._updateMusicButton();
    }).catch(() => {
      // 浏览器可能不支持 Web Audio
      this._musicStarted = false;
    });
  }

  /** 显示/隐藏体素世界（跑酷模式作为独立维度，隐藏地面世界） */
  _setWorldVisible(visible) {
    // 隐藏/显示所有区块网格
    for (const chunk of this.world.chunks.values()) {
      if (chunk.mesh) chunk.mesh.visible = visible;
      if (chunk.waterMesh) chunk.waterMesh.visible = visible;
      if (chunk.flowerMesh) chunk.flowerMesh.visible = visible;
    }
    // 隐藏/显示机器人（属于地面世界）
    if (this.animalManager) {
      for (const robot of this.animalManager.robots) {
        if (robot.group) robot.group.visible = visible;
      }
    }
  }

  /** 显示短暂消息提示 */
  _showMessage(msg) {
    let el = document.getElementById('gameMsg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gameMsg';
      el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
        + 'color:#fff;font-size:20px;font-weight:bold;'
        + 'text-shadow:2px 2px 4px rgba(0,0,0,0.8);'
        + 'pointer-events:none;z-index:1000;transition:opacity 0.5s;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }

  /** 切换音乐/音效开关（循环：全部开 → 仅音效 → 全部关 → 全部开） */
  _toggleMusic() {
    if (!this._musicStarted) {
      this._startMusic();
      return;
    }
    if (!this.audio.isMusicMuted && !this.audio.isSfxMuted) {
      // 全部开 → 关音乐
      this.audio.toggleMusic();
    } else if (this.audio.isMusicMuted && !this.audio.isSfxMuted) {
      // 关音乐 → 全部关
      this.audio.toggleSfx();
    } else {
      // 全部关 → 全部开
      this.audio.toggleMusic(); // 开音乐
      this.audio.toggleSfx();  // 开音效
    }
    this._updateMusicButton();
  }

  /** 更新音乐按钮图标 */
  _updateMusicButton() {
    const btn = document.getElementById('btnMusic');
    if (!btn) return;
    if (!this._musicStarted) {
      btn.textContent = '🔇';
      btn.title = '点击开启声音';
    } else if (!this.audio.isMusicMuted && !this.audio.isSfxMuted) {
      btn.textContent = '🔊';
      btn.title = '音乐+音效（点击切换）';
    } else if (this.audio.isMusicMuted && !this.audio.isSfxMuted) {
      btn.textContent = '🔉';
      btn.title = '仅音效（点击切换）';
    } else {
      btn.textContent = '🔇';
      btn.title = '已静音（点击恢复）';
    }
  }

  /** 窗口大小变化处理 */
  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** 调整视野角度（FOV） */
  _adjustFOV(delta) {
    this.fov = Math.max(this.fovMin, Math.min(this.fovMax, this.fov + delta));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this._showFOVHint();
  }

  /** 重置视野到默认值 */
  _resetFOV() {
    this._adjustFOV(this.defaultFov - this.fov);
  }

  /** 短暂显示 FOV 提示 */
  _showFOVHint() {
    if (this._fovHintTimer) clearTimeout(this._fovHintTimer);
    let hint = document.getElementById('fovHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'fovHint';
      hint.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'color:#fff;font-size:28px;font-weight:bold;' +
        'text-shadow:0 2px 8px rgba(0,0,0,0.6);pointer-events:none;z-index:100;' +
        'transition:opacity 0.3s;';
      document.body.appendChild(hint);
    }
    hint.textContent = `FOV: ${this.fov.toFixed(0)}°`;
    hint.style.opacity = '1';
    this._fovHintTimer = setTimeout(() => {
      hint.style.opacity = '0';
    }, 1200);
  }

  /** 更新调试信息 */
  _updateDebugInfo() {
    const pos = this.player.position;
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cz = Math.floor(pos.z / CHUNK_SIZE);
    const chunks = this.world.chunks.size;

    const robotStats = this.animalManager ? this.animalManager.getStats() : { scout: 0, heavy: 0, builder: 0 };
    const totalRobots = robotStats.scout + robotStats.heavy + robotStats.builder;

    let buildInfo = '';
    if (this.animalManager) {
      const builders = this.animalManager.robots.filter(a => a instanceof BuilderBot && a.buildMode);
      if (builders.length > 0) {
        const b = builders[0];
        buildInfo = `<br><span style="color:#FFD700">🏗️ ${b.currentStructure || '建造中'} ${b.getBuildProgress()}%</span>`;
      }
    }

    this.ui.debugInfo.innerHTML =
      `FPS: ${this.fps}<br>` +
      `FOV: ${this.fov.toFixed(0)}°<br>` +
      `XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}<br>` +
      `区块: ${cx}, ${cz} | 已加载: ${chunks}<br>` +
      `机器人: ${totalRobots} 只<br>` +
      `<span style="color:#5B9BD5">侦察: ${robotStats.scout}</span> | ` +
      `<span style="color:#E67E22">重型: ${robotStats.heavy}</span> | ` +
      `<span style="color:#3498DB">建造: ${robotStats.builder}</span>` +
      buildInfo;

    this.ui.blockHighlight.style.display = 'none';
  }

  /** 主游戏循环 */
  animate() {
    requestAnimationFrame(() => this.animate());

    // WebGL 不可用时跳过渲染（防止 renderer 为 null 导致崩溃）
    if (!this.renderer || !this.scene || !this.camera) return;

    const dt = this.clock.getDelta();

    // FPS 计算
    this.frameCount++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = 0;
    }

    // 移动端：从触控控制器注入键盘输入
    if (this.isMobile && this.touchController && this.isRunning && this.player) {
      const tc = this.touchController;
      const deadZone = 0.15;
      const absX = Math.abs(tc.moveX);
      const absZ = Math.abs(tc.moveZ);
      this.player.keys['KeyW'] = tc.moveZ < -deadZone;
      this.player.keys['KeyS'] = tc.moveZ > deadZone;
      this.player.keys['KeyA'] = tc.moveX < -deadZone;
      this.player.keys['KeyD'] = tc.moveX > deadZone;
    }

    // 跑酷模式：active 时直接更新（第三人称，不依赖指针锁定）
    if (this.parkourManager && this.parkourManager.active) {
      this.parkourManager.update(dt, this.player);
      // 跑酷是独立维度，不按跑酷位置加载/卸载体素区块

      // 跑酷因失败自动结束：恢复世界和玩家位置
      if (!this.parkourManager.active) {
        this._setWorldVisible(true);
        this.player.position.copy(this.player.spawnPoint);
        this.player.velocity.set(0, 0, 0);
        this._updateParkourHUD(false);
      }
    } else if (this.isPointerLocked || (this.isMobile && this.isRunning)) {
      // 沙盒模式：桌面端需指针锁定，移动端运行时即更新
      this.player.update(dt);
      this.world.update(this.player.position.x, this.player.position.z);
      this.highlight.update(this.player.targetBlock);
    }

    // 云彩缓慢移动（始终运行）
    if (this.clouds) {
      this.clouds.children.forEach((cloud, idx) => {
        // 每朵云以略微不同的速度向东移动
        const speed = 0.5 + (idx % 5) * 0.2;
        cloud.position.x += speed * dt;
        // 云彩循环：移出视野后重新从西边出现
        if (cloud.position.x > 120) {
          cloud.position.x = -120;
          cloud.position.z = (Math.random() - 0.5) * 200;
        }
      });
    }

    // 更新机器人 AI（始终运行，即使暂停状态也让机器人有生命感）
    if (this.animalManager) {
      this.animalManager.update(dt);
    }

    // 更新跑酷 HUD
    if (this.parkourManager && this.parkourManager.active) {
      this._updateParkourHUD(true);
    }

    // 渲染（renderer 已在循环开头校验，这里安全）
    this.renderer.render(this.scene, this.camera);

    // 更新UI（降低更新频率）
    if (this.frameCount % 10 === 0) {
      this._updateDebugInfo();
    }
  }
}

/* ============================================
   启动游戏
   ============================================ */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const game = new Game();
    window.__game = game; // 暴露到全局便于调试
    // init() 内部会早期设置 window.__gameReady 和启动 animate()，避免移动端区块加载超时
    await game.init();
  } catch (err) {
    console.error('[Game] 启动失败:', err);
    const detail = (err && (err.stack || err.message)) || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    if (window.showError) {
      window.showError('[Game 启动失败] type=' + (err && err.constructor && err.constructor.name) + ' detail=' + detail);
    }
    // 即使失败也标记就绪，避免诊断超时误报遮盖真实错误
    window.__gameReady = true;
  }
});
