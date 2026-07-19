/**
 * 弹幕对战系统 - AI自动参与的阵营对抗游戏
 * 
 * 玩法：
 * - 红蓝两大阵营自动对战
 * - AI机器人自动生成、冲锋、攻击
 * - 弹幕（子弹）从双方阵地射出
 * - AI解说员实时播报战况
 * - 玩家可召唤增援（按键加入阵营）
 * - 积分制，先达到目标分数获胜
 */
import * as THREE from '../vendor/three.module.js?v=1784448000';

// 阵营颜色
const TEAM_RED = { color: 0xFF4444, name: '红方', hex: '#FF4444' };
const TEAM_BLUE = { color: 0x4488FF, name: '蓝方', hex: '#4488FF' };

// AI解说话术库
const COMMENTARY = {
  start: [
    '战斗开始！红蓝双方严阵以待！',
    '弹幕对决正式打响！谁能笑到最后？',
    '欢迎来到弹幕战场！AI战士们已经迫不及待了！',
  ],
  redKill: [
    '红方击杀！攻势凶猛！',
    '红方拿下一血！蓝方需要稳住！',
    '红方火力全开！蓝方节节败退！',
    '红方连续击杀！势不可挡！',
  ],
  blueKill: [
    '蓝方反杀！漂亮的操作！',
    '蓝方扳回一城！红方不能大意！',
    '蓝方弹幕如雨！红方防线告急！',
    '蓝方强势追击！比分逼近！',
  ],
  redAdvantage: [
    '红方占据优势！比分领先！',
    '红方压制全场！蓝方需要反击！',
    '红方大军压境！蓝方处境危险！',
  ],
  blueAdvantage: [
    '蓝方后来居上！比分反超！',
    '蓝方掌控节奏！红方陷入被动！',
    '蓝方弹幕覆盖全场！红方难以招架！',
  ],
  tie: [
    '双方势均力敌！比分胶着！',
    '旗鼓相当！谁能打破僵局？',
    '战况激烈！比分咬得很紧！',
  ],
  win: (team) => `${team.name}获胜！恭喜${team.name}赢得本场弹幕对决！`,
  spawn: [
    '新战士加入战场！',
    '增援到达！战力提升！',
    'AI战士已就位，准备战斗！',
  ],
  combo: (n) => `${n}连击！火力惊人！`,
};

export class DanmakuBattleManager {
  constructor(scene, camera, audio) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.active = false;

    // 战场配置
    this.arenaCenter = new THREE.Vector3(0, 25, 0);
    this.arenaWidth = 60;
    this.redSpawnZ = -25;
    this.blueSpawnZ = 25;

    // 阵营
    this.redTeam = { ...TEAM_RED, score: 0, kills: 0, bots: [], combo: 0 };
    this.blueTeam = { ...TEAM_BLUE, score: 0, kills: 0, bots: [], combo: 0 };

    // 目标分数
    this.targetScore = 100;

    // 实体
    this.bots = [];        // 所有战士
    this.bullets = [];     // 所有弹幕
    this.particles = [];   // 粒子效果
    this.danmakuTexts = []; // 飞行弹幕文字

    // 计时器
    this._spawnTimer = 0;
    this._bulletTimer = 0;
    this._commentaryTimer = 0;
    this._lastScoreDiff = 0;
    this._battleTime = 0;
    this._lastComboTime = 0;

    // 战场容器
    this.battleGroup = new THREE.Group();

    // 解说消息回调
    this.onMessage = null;

    // 玩家阵营（null=观战）
    this.playerTeam = null;

    // 保存原始相机位置
    this._origCameraPos = null;
    this._origCameraRot = null;
  }

  /** 启动弹幕对战 */
  start() {
    if (this.active) return;
    this.active = true;
    this.redTeam.score = 0;
    this.redTeam.kills = 0;
    this.redTeam.combo = 0;
    this.blueTeam.score = 0;
    this.blueTeam.kills = 0;
    this.blueTeam.combo = 0;
    this._battleTime = 0;
    this._spawnTimer = 0;
    this._bulletTimer = 0;
    this._commentaryTimer = 0;

    // 清理旧实体
    this._clearAll();

    // 添加战场到场景
    this.scene.add(this.battleGroup);

    // 设置观战相机
    this._origCameraPos = this.camera.position.clone();
    this._origCameraRot = this.camera.rotation.clone();
    this.camera.position.set(0, 40, 55);
    this.camera.lookAt(0, 25, 0);

    // 生成初始战士
    for (let i = 0; i < 3; i++) {
      this._spawnBot(this.redTeam);
      this._spawnBot(this.blueTeam);
    }

    // 开始解说
    this._say(COMMENTARY.start[Math.floor(Math.random() * COMMENTARY.start.length)]);

    // 播放音效
    if (this.audio && typeof this.audio.playJump === 'function') this.audio.playJump();
  }

  /** 停止弹幕对战 */
  stop() {
    if (!this.active) return;
    this.active = false;
    this._clearAll();
    this.scene.remove(this.battleGroup);

    // 恢复相机
    if (this._origCameraPos) {
      this.camera.position.copy(this._origCameraPos);
    }
    if (this._origCameraRot) {
      this.camera.rotation.copy(this._origCameraRot);
    }

    this.playerTeam = null;
  }

  /** 玩家加入阵营 */
  joinTeam(team) {
    this.playerTeam = team;
    // 召唤3个战士
    for (let i = 0; i < 3; i++) {
      this._spawnBot(team);
    }
    this._say(`玩家加入${team.name}！召唤3名战士增援！`);
    if (this.audio && typeof this.audio.playJump === 'function') this.audio.playJump();
  }

  /** 更新对战 */
  update(dt) {
    if (!this.active) return;

    this._battleTime += dt;
    this._spawnTimer += dt;
    this._bulletTimer += dt;
    this._commentaryTimer += dt;

    // 自动生成战士（每3秒）
    if (this._spawnTimer >= 3.0) {
      this._spawnTimer = 0;
      this._spawnBot(this.redTeam);
      this._spawnBot(this.blueTeam);
    }

    // 自动发射弹幕（每0.5秒）
    if (this._bulletTimer >= 0.5) {
      this._bulletTimer = 0;
      this._fireBullets();
    }

    // 更新战士
    this._updateBots(dt);

    // 更新弹幕
    this._updateBullets(dt);

    // 更新粒子
    this._updateParticles(dt);

    // 更新弹幕文字
    this._updateDanmakuTexts(dt);

    // AI解说（每5秒）
    if (this._commentaryTimer >= 5.0) {
      this._commentaryTimer = 0;
      this._autoCommentary();
    }

    // 检查胜利
    if (this.redTeam.score >= this.targetScore) {
      this._say(COMMENTARY.win(this.redTeam));
      setTimeout(() => this.stop(), 3000);
    } else if (this.blueTeam.score >= this.targetScore) {
      this._say(COMMENTARY.win(this.blueTeam));
      setTimeout(() => this.stop(), 3000);
    }

    // 相机缓慢旋转
    const angle = this._battleTime * 0.05;
    this.camera.position.x = Math.sin(angle) * 55;
    this.camera.position.z = Math.cos(angle) * 55;
    this.camera.position.y = 40 + Math.sin(this._battleTime * 0.1) * 3;
    this.camera.lookAt(0, 25, 0);
  }

  /** 生成战士 */
  _spawnBot(team) {
    const isRed = team === this.redTeam;
    const z = isRed ? this.redSpawnZ : this.blueSpawnZ;
    const x = (Math.random() - 0.5) * this.arenaWidth;
    const y = 25 + Math.random() * 2;

    // 创建简单的体素战士模型
    const bot = new THREE.Group();

    // 身体
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: team.color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    bot.add(body);

    // 头
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshLambertMaterial({ color: team.color, emissive: team.color, emissiveIntensity: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    bot.add(head);

    // 眼睛（发光）
    const eyeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 1.55, 0.31);
    bot.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.15, 1.55, 0.31);
    bot.add(eyeR);

    // 手臂
    const armGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    const armMat = new THREE.MeshLambertMaterial({ color: team.color });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.55, 0.7, 0);
    bot.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.55, 0.7, 0);
    bot.add(armR);

    // 腿
    const legGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.2, -0.3, 0);
    bot.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.2, -0.3, 0);
    bot.add(legR);

    bot.position.set(x, y, z);
    // 红方面朝+Z（向蓝方冲），蓝方面朝-Z（向红方冲）
    bot.rotation.y = isRed ? 0 : Math.PI;

    // 战士数据
    bot.userData = {
      team: team,
      hp: 30 + Math.random() * 20,
      maxHp: 50,
      attack: 5 + Math.random() * 5,
      speed: 3 + Math.random() * 2,
      attackRange: 8 + Math.random() * 4,
      attackCooldown: 0,
      walkPhase: Math.random() * Math.PI * 2,
      parts: { body, head, armL, armR, legL, legR },
    };

    // HP条
    const hpBar = this._createHpBar(team.color);
    hpBar.position.y = 2.2;
    bot.add(hpBar);
    bot.userData.hpBar = hpBar;

    this.battleGroup.add(bot);
    this.bots.push(bot);
    team.bots.push(bot);
  }

  /** 创建HP条 */
  _createHpBar(color) {
    const group = new THREE.Group();
    const bgGeo = new THREE.PlaneGeometry(1.2, 0.15);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
    group.add(new THREE.Mesh(bgGeo, bgMat));
    const fillGeo = new THREE.PlaneGeometry(1.2, 0.15);
    const fillMat = new THREE.MeshBasicMaterial({ color: color });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.z = 0.01;
    group.add(fill);
    group.userData.fill = fill;
    return group;
  }

  /** 更新HP条 */
  _updateHpBar(bot) {
    const ud = bot.userData;
    const ratio = Math.max(0, ud.hp / ud.maxHp);
    if (ud.hpBar && ud.hpBar.userData.fill) {
      ud.hpBar.userData.fill.scale.x = ratio;
      ud.hpBar.userData.fill.position.x = -(1 - ratio) * 0.6;
    }
  }

  /** 更新战士AI */
  _updateBots(dt) {
    const alive = [];
    for (const bot of this.bots) {
      const ud = bot.userData;

      if (ud.hp <= 0) {
        // 死亡效果
        this._createExplosion(bot.position, ud.team.color);
        this.battleGroup.remove(bot);
        continue;
      }

      // 寻找最近敌人
      const enemyTeam = ud.team === this.redTeam ? this.blueTeam : this.redTeam;
      let nearest = null;
      let nearestDist = Infinity;
      for (const e of enemyTeam.bots) {
        if (e.userData.hp <= 0) continue;
        const d = bot.position.distanceTo(e.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = e;
        }
      }

      if (nearest) {
        // 朝向敌人
        const dir = nearest.position.clone().sub(bot.position);
        dir.y = 0;
        bot.rotation.y = Math.atan2(dir.x, dir.z);

        if (nearestDist > ud.attackRange) {
          // 移动
          dir.normalize();
          bot.position.x += dir.x * ud.speed * dt;
          bot.position.z += dir.z * ud.speed * dt;

          // 走路动画
          ud.walkPhase += dt * 8;
          const swing = Math.sin(ud.walkPhase) * 0.3;
          ud.parts.legL.rotation.x = swing;
          ud.parts.legR.rotation.x = -swing;
          ud.parts.armL.rotation.x = -swing * 0.5;
          ud.parts.armR.rotation.x = swing * 0.5;
        } else {
          // 攻击
          ud.attackCooldown -= dt;
          if (ud.attackCooldown <= 0) {
            ud.attackCooldown = 0.8 + Math.random() * 0.4;
            this._fireBullet(bot, nearest);
            // 攻击动画
          }

          // 待机动画
          ud.walkPhase += dt * 3;
          ud.parts.armL.rotation.x = Math.sin(ud.walkPhase) * 0.1;
          ud.parts.armR.rotation.x = -Math.sin(ud.walkPhase) * 0.1;
        }
      }

      // 限制在战场内
      bot.position.x = Math.max(-this.arenaWidth / 2, Math.min(this.arenaWidth / 2, bot.position.x));
      bot.position.y = 25;

      this._updateHpBar(bot);
      alive.push(bot);
    }

    // 更新阵营战士列表
    this.redTeam.bots = alive.filter(b => b.userData.team === this.redTeam);
    this.blueTeam.bots = alive.filter(b => b.userData.team === this.blueTeam);
    this.bots = alive;
  }

  /** 发射弹幕（单个战士） */
  _fireBullet(shooter, target) {
    const ud = shooter.userData;
    const geo = new THREE.SphereGeometry(0.25, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: ud.team.color });
    const bullet = new THREE.Mesh(geo, mat);

    bullet.position.copy(shooter.position);
    bullet.position.y += 1.2;

    const dir = target.position.clone().sub(shooter.position);
    dir.normalize();

    bullet.userData = {
      velocity: dir.multiplyScalar(15),
      damage: ud.attack,
      team: ud.team,
      life: 3.0,
    };

    this.battleGroup.add(bullet);
    this.bullets.push(bullet);

    // 音效
    if (this.audio && typeof this.audio.playJump === 'function') {
      // 轻量播放，不每次都触发
      if (Math.random() < 0.3) this.audio.playJump();
    }
  }

  /** 阵营齐射弹幕 */
  _fireBullets() {
    // 每方随机选2个战士发射
    for (const team of [this.redTeam, this.blueTeam]) {
      const shooters = team.bots.filter(b => b.userData.hp > 0);
      if (shooters.length === 0) continue;
      const count = Math.min(2, shooters.length);
      for (let i = 0; i < count; i++) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        const enemyTeam = team === this.redTeam ? this.blueTeam : this.redTeam;
        const targets = enemyTeam.bots.filter(b => b.userData.hp > 0);
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          this._fireBullet(shooter, target);
        }
      }
    }
  }

  /** 更新弹幕 */
  _updateBullets(dt) {
    const alive = [];
    for (const bullet of this.bullets) {
      const ud = bullet.userData;
      bullet.position.add(ud.velocity.clone().multiplyScalar(dt));
      ud.life -= dt;

      let hit = false;

      // 检测碰撞
      const enemyTeam = ud.team === this.redTeam ? this.blueTeam : this.redTeam;
      for (const enemy of enemyTeam.bots) {
        if (enemy.userData.hp <= 0) continue;
        const d = bullet.position.distanceTo(enemy.position);
        if (d < 1.2) {
          enemy.userData.hp -= ud.damage;
          this._createHitEffect(bullet.position, ud.team.color);
          hit = true;

          if (enemy.userData.hp <= 0) {
            // 击杀
            ud.team.kills++;
            ud.team.score += 10;
            ud.team.combo++;

            // 连击效果
            const now = performance.now();
            if (now - this._lastComboTime < 2000 && ud.team.combo >= 3) {
              this._say(COMMENTARY.combo(ud.team.combo));
              ud.team.score += 5; // 连击加分
            }
            this._lastComboTime = now;

            // 飞行弹幕文字
            this._spawnDanmakuText(`${ud.team.name}击杀！+10`, ud.team);

            // 解说
            const msgs = ud.team === this.redTeam ? COMMENTARY.redKill : COMMENTARY.blueKill;
            if (Math.random() < 0.4) {
              this._say(msgs[Math.floor(Math.random() * msgs.length)]);
            }
          }
          break;
        }
      }

      if (!hit && ud.life > 0) {
        alive.push(bullet);
      } else {
        this.battleGroup.remove(bullet);
      }
    }
    this.bullets = alive;

    // 重置combo
    const now = performance.now();
    if (now - this._lastComboTime > 3000) {
      this.redTeam.combo = 0;
      this.blueTeam.combo = 0;
    }
  }

  /** 爆炸效果 */
  _createExplosion(pos, color) {
    for (let i = 0; i < 12; i++) {
      const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      p.position.y += 0.5;

      const angle = (i / 12) * Math.PI * 2;
      const speed = 3 + Math.random() * 3;
      p.userData = {
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 5 + 2,
          Math.sin(angle) * speed
        ),
        life: 1.0,
      };

      this.battleGroup.add(p);
      this.particles.push(p);
    }
  }

  /** 命中效果 */
  _createHitEffect(pos, color) {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);

      p.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 4
        ),
        life: 0.4,
      };

      this.battleGroup.add(p);
      this.particles.push(p);
    }
  }

  /** 更新粒子 */
  _updateParticles(dt) {
    const alive = [];
    for (const p of this.particles) {
      const ud = p.userData;
      p.position.add(ud.velocity.clone().multiplyScalar(dt));
      ud.velocity.y -= 10 * dt; // 重力
      ud.life -= dt;

      if (p.material) {
        p.material.opacity = Math.max(0, ud.life);
      }

      if (ud.life > 0) {
        alive.push(p);
      } else {
        this.battleGroup.remove(p);
      }
    }
    this.particles = alive;
  }

  /** 生成飞行弹幕文字 */
  _spawnDanmakuText(text, team) {
    // 用canvas纹理创建飞行文字
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = team.hex;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, 128, 32);
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6, 1.5, 1);
    sprite.position.copy(this.arenaCenter);
    sprite.position.x = -this.arenaWidth / 2;
    sprite.position.y = 28 + Math.random() * 8;
    sprite.position.z = (Math.random() - 0.5) * 20;

    sprite.userData = {
      velocity: new THREE.Vector3(8 + Math.random() * 4, 0, 0),
      life: 4.0,
    };

    this.battleGroup.add(sprite);
    this.danmakuTexts.push(sprite);
  }

  /** 更新飞行弹幕文字 */
  _updateDanmakuTexts(dt) {
    const alive = [];
    for (const text of this.danmakuTexts) {
      const ud = text.userData;
      text.position.add(ud.velocity.clone().multiplyScalar(dt));
      ud.life -= dt;

      if (text.material) {
        text.material.opacity = Math.min(1, ud.life);
      }

      if (ud.life > 0 && text.position.x < this.arenaWidth / 2 + 10) {
        alive.push(text);
      } else {
        this.battleGroup.remove(text);
        if (text.material) {
          if (text.material.map) text.material.map.dispose();
          text.material.dispose();
        }
      }
    }
    this.danmakuTexts = alive;
  }

  /** AI自动解说 */
  _autoCommentary() {
    const diff = this.redTeam.score - this.blueTeam.score;
    const absDiff = Math.abs(diff);

    if (absDiff < 5) {
      this._say(COMMENTARY.tie[Math.floor(Math.random() * COMMENTARY.tie.length)]);
    } else if (diff > 0 && diff > this._lastScoreDiff) {
      this._say(COMMENTARY.redAdvantage[Math.floor(Math.random() * COMMENTARY.redAdvantage.length)]);
    } else if (diff < 0 && diff < this._lastScoreDiff) {
      this._say(COMMENTARY.blueAdvantage[Math.floor(Math.random() * COMMENTARY.blueAdvantage.length)]);
    } else {
      // 随机播报
      if (Math.random() < 0.3) {
        const msgs = COMMENTARY.spawn;
        this._say(msgs[Math.floor(Math.random() * msgs.length)]);
      }
    }

    this._lastScoreDiff = diff;
  }

  /** 发送解说消息 */
  _say(msg) {
    if (this.onMessage) {
      this.onMessage(msg);
    }
  }

  /** 清理所有实体 */
  _clearAll() {
    for (const bot of this.bots) this.battleGroup.remove(bot);
    for (const b of this.bullets) this.battleGroup.remove(b);
    for (const p of this.particles) this.battleGroup.remove(p);
    for (const t of this.danmakuTexts) {
      this.battleGroup.remove(t);
      if (t.material) {
        if (t.material.map) t.material.map.dispose();
        t.material.dispose();
      }
    }
    this.bots = [];
    this.bullets = [];
    this.particles = [];
    this.danmakuTexts = [];
    this.redTeam.bots = [];
    this.blueTeam.bots = [];
  }

  /** 获取当前战况（用于HUD） */
  getStatus() {
    return {
      redScore: this.redTeam.score,
      blueScore: this.blueTeam.score,
      redBots: this.redTeam.bots.filter(b => b.userData.hp > 0).length,
      blueBots: this.blueTeam.bots.filter(b => b.userData.hp > 0).length,
      redKills: this.redTeam.kills,
      blueKills: this.blueTeam.kills,
      target: this.targetScore,
      time: this._battleTime,
    };
  }
}
