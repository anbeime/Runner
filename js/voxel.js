/**
 * 像素方块世界 - 增强版体素引擎核心模块
 * 基于 pycraft 项目增强：更多方块类型、生物群系、花朵、云彩
 */

import * as THREE from 'three';
import { SimplexNoise } from './noise.js';

/* ============================================
   常量与配置
   ============================================ */
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 48;
export const RENDER_DISTANCE = 4;
export const MOBILE_RENDER_DISTANCE = 4;
export const SEA_LEVEL = 20;

export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
    || ('ontouchstart' in window && window.innerWidth < 1024);
}

export function getRenderDistance() {
  return isMobileDevice() ? MOBILE_RENDER_DISTANCE : RENDER_DISTANCE;
}

/* ============================================
   方块类型定义（扩展）
   ============================================ */
export const BlockType = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,          // 橡树木头
  LEAVES: 6,        // 橡树树叶
  WATER: 7,
  BILIBILI_PINK: 8,
  // 新增方块类型（来自pycraft）
  COBBLESTONE: 9,      // 圆石
  MOSSY_COBBLESTONE: 10, // 苔藓圆石
  SNOWY_GRASS: 11,     // 雪草
  SNOW_BLOCK: 12,      // 雪块
  BIRCH_WOOD: 13,      // 白桦木
  BIRCH_LEAVES: 14,    // 白桦树叶
  SANDSTONE: 15,       // 沙岩
  POPPY: 16,           // 罂粟（红花）
  DANDELION: 17,       // 蒲公英（黄花）
  ALLIUM: 18,          // 满天星（紫花）
  BLUE_ORCHID: 19,     // 兰花
  GLASS: 20,           // 玻璃
  DIAMOND_BLOCK: 21,   // 钻石块
  BRICK: 22,           // 砖块
  GRAVEL: 23,          // 砂砾
};

export const BlockNames = {
  [BlockType.GRASS]: '草地',
  [BlockType.DIRT]: '泥土',
  [BlockType.STONE]: '石头',
  [BlockType.SAND]: '沙子',
  [BlockType.WOOD]: '木头',
  [BlockType.LEAVES]: '树叶',
  [BlockType.WATER]: '水',
  [BlockType.BILIBILI_PINK]: '粉色',
  [BlockType.COBBLESTONE]: '圆石',
  [BlockType.MOSSY_COBBLESTONE]: '苔圆石',
  [BlockType.SNOWY_GRASS]: '雪草',
  [BlockType.SNOW_BLOCK]: '雪块',
  [BlockType.BIRCH_WOOD]: '白桦木',
  [BlockType.BIRCH_LEAVES]: '白桦叶',
  [BlockType.SANDSTONE]: '沙岩',
  [BlockType.POPPY]: '罂粟',
  [BlockType.DANDELION]: '蒲公英',
  [BlockType.ALLIUM]: '满天星',
  [BlockType.BLUE_ORCHID]: '蓝兰花',
  [BlockType.GLASS]: '玻璃',
  [BlockType.DIAMOND_BLOCK]: '钻石块',
  [BlockType.BRICK]: '砖块',
  [BlockType.GRAVEL]: '砂砾',
};

// 非固体方块（可穿过）- 包括水和玻璃
const NON_SOLID = new Set([
  BlockType.AIR, BlockType.WATER, BlockType.POPPY, BlockType.DANDELION,
  BlockType.ALLIUM, BlockType.BLUE_ORCHID
]);

export const isSolid = (type) => !NON_SOLID.has(type);

// 可放置方块列表（用于物品栏）
export const PLACEABLE_BLOCKS = [
  BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.COBBLESTONE,
  BlockType.SAND, BlockType.WOOD, BlockType.LEAVES, BlockType.BILIBILI_PINK,
  BlockType.SNOWY_GRASS, BlockType.BIRCH_WOOD, BlockType.SANDSTONE,
  BlockType.GLASS, BlockType.DIAMOND_BLOCK, BlockType.BRICK,
];

/* ============================================
   生物群系定义
   ============================================ */
export const BiomeType = {
  PLAINS: 0,        // 平原（草地、树木）
  SNOWY_PLAINS: 1,  // 雪地平原
  DESERT: 2,        // 沙漠
  FOREST: 3,        // 森林（密集树木）
};

// 生物群系特征配置
const BiomeConfig = {
  [BiomeType.PLAINS]: {
    groundBlock: BlockType.GRASS,
    underBlock: BlockType.DIRT,
    treeChance: 0.02,
    flowerChance: 0.08,
    treeType: 'oak',
  },
  [BiomeType.SNOWY_PLAINS]: {
    groundBlock: BlockType.SNOWY_GRASS,
    underBlock: BlockType.DIRT,
    treeChance: 0.01,
    flowerChance: 0.02,
    treeType: 'birch',
    hasSnowLayer: true,
  },
  [BiomeType.DESERT]: {
    groundBlock: BlockType.SAND,
    underBlock: BlockType.SANDSTONE,
    treeChance: 0.005,
    flowerChance: 0,
    treeType: 'none',
    hasSandstoneStructures: true,
  },
  [BiomeType.FOREST]: {
    groundBlock: BlockType.GRASS,
    underBlock: BlockType.DIRT,
    treeChance: 0.15,
    flowerChance: 0.12,
    treeType: 'oak',
  },
};

/* ============================================
   纹理图集系统（扩展）
   ============================================ */
const TEX_SIZE = 16;
const ATLAS_COLS = 12;
const ATLAS_ROWS = 2;
const ATLAS_W = TEX_SIZE * ATLAS_COLS;
const ATLAS_H = TEX_SIZE * ATLAS_ROWS;

const TEX = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3,
  SAND: 4, WOOD_SIDE: 5, WOOD_TOP: 6, LEAVES: 7,
  WATER: 8, BILIBILI_PINK: 9, COBBLESTONE: 10, MOSSY_COBBLESTONE: 11,
  SNOWY_GRASS_TOP: 12, SNOWY_GRASS_SIDE: 13, SNOW_BLOCK: 14, BIRCH_WOOD_SIDE: 15,
  BIRCH_LEAVES: 16, SANDSTONE: 17, POPPY: 18, DANDELION: 19,
  ALLIUM: 20, BLUE_ORCHID: 21, GLASS: 22, DIAMOND_BLOCK: 23,
};

const BLOCK_TEXTURES = {
  [BlockType.GRASS]: { top: TEX.GRASS_TOP, side: TEX.GRASS_SIDE, bottom: TEX.DIRT },
  [BlockType.DIRT]: { top: TEX.DIRT, side: TEX.DIRT, bottom: TEX.DIRT },
  [BlockType.STONE]: { top: TEX.STONE, side: TEX.STONE, bottom: TEX.STONE },
  [BlockType.SAND]: { top: TEX.SAND, side: TEX.SAND, bottom: TEX.SAND },
  [BlockType.WOOD]: { top: TEX.WOOD_TOP, side: TEX.WOOD_SIDE, bottom: TEX.WOOD_TOP },
  [BlockType.LEAVES]: { top: TEX.LEAVES, side: TEX.LEAVES, bottom: TEX.LEAVES },
  [BlockType.WATER]: { top: TEX.WATER, side: TEX.WATER, bottom: TEX.WATER },
  [BlockType.BILIBILI_PINK]: { top: TEX.BILIBILI_PINK, side: TEX.BILIBILI_PINK, bottom: TEX.BILIBILI_PINK },
  [BlockType.COBBLESTONE]: { top: TEX.COBBLESTONE, side: TEX.COBBLESTONE, bottom: TEX.COBBLESTONE },
  [BlockType.MOSSY_COBBLESTONE]: { top: TEX.MOSSY_COBBLESTONE, side: TEX.MOSSY_COBBLESTONE, bottom: TEX.MOSSY_COBBLESTONE },
  [BlockType.SNOWY_GRASS]: { top: TEX.SNOWY_GRASS_TOP, side: TEX.SNOWY_GRASS_SIDE, bottom: TEX.DIRT },
  [BlockType.SNOW_BLOCK]: { top: TEX.SNOW_BLOCK, side: TEX.SNOW_BLOCK, bottom: TEX.SNOW_BLOCK },
  [BlockType.BIRCH_WOOD]: { top: TEX.WOOD_TOP, side: TEX.BIRCH_WOOD_SIDE, bottom: TEX.WOOD_TOP },
  [BlockType.BIRCH_LEAVES]: { top: TEX.BIRCH_LEAVES, side: TEX.BIRCH_LEAVES, bottom: TEX.BIRCH_LEAVES },
  [BlockType.SANDSTONE]: { top: TEX.SANDSTONE, side: TEX.SANDSTONE, bottom: TEX.SANDSTONE },
  [BlockType.GLASS]: { top: TEX.GLASS, side: TEX.GLASS, bottom: TEX.GLASS },
  [BlockType.DIAMOND_BLOCK]: { top: TEX.DIAMOND_BLOCK, side: TEX.DIAMOND_BLOCK, bottom: TEX.DIAMOND_BLOCK },
};

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xff) / 255;
}

function drawTexture(ctx, index, drawFn) {
  if (index >= ATLAS_COLS * ATLAS_ROWS) return;
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  ctx.save();
  ctx.translate(col * TEX_SIZE, row * TEX_SIZE);
  drawFn(ctx);
  ctx.restore();
}

function fillNoisy(ctx, baseR, baseG, baseB, noiseAmount = 20) {
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const n = (hash(px, py) - 0.5) * noiseAmount;
      ctx.fillStyle = `rgb(${(baseR + n)|0},${(baseG + n)|0},${(baseB + n)|0})`;
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function createAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 基础纹理
  drawTexture(ctx, TEX.GRASS_TOP, c => fillNoisy(c, 90, 160, 50, 30));
  drawTexture(ctx, TEX.GRASS_SIDE, c => {
    fillNoisy(c, 134, 96, 67, 20);
    for (let py = 0; py < 4; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        c.fillStyle = `rgb(70,${140+(hash(px+100,py+100)-0.5)*30|0},40)`;
        c.fillRect(px, py, 1, 1);
      }
    }
  });
  drawTexture(ctx, TEX.DIRT, c => fillNoisy(c, 134, 96, 67, 25));
  drawTexture(ctx, TEX.STONE, c => {
    fillNoisy(c, 128, 128, 128, 25);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(80,80,80,0.5)';
      c.fillRect((hash(i,42)*14)|0, (hash(i,73)*14)|0, 2, 1);
    }
  });
  drawTexture(ctx, TEX.SAND, c => fillNoisy(c, 220, 200, 130, 20));
  drawTexture(ctx, TEX.WOOD_SIDE, c => {
    fillNoisy(c, 120, 80, 50, 15);
    for (let px = 0; px < TEX_SIZE; px++) {
      if (hash(px, 999) > 0.65) {
        c.fillStyle = 'rgba(80,55,30,0.5)';
        c.fillRect(px, 0, 1, TEX_SIZE);
      }
    }
  });
  drawTexture(ctx, TEX.WOOD_TOP, c => {
    fillNoisy(c, 160, 120, 70, 15);
    for (let py = 0; py < TEX_SIZE; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        if ((Math.sqrt((px-8)**2+(py-8)**2)|0) % 3 === 0) {
          c.fillStyle = 'rgba(90,60,30,0.5)';
          c.fillRect(px, py, 1, 1);
        }
      }
    }
  });
  drawTexture(ctx, TEX.LEAVES, c => {
    for (let py = 0; py < TEX_SIZE; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        if (hash(px+50,py+50) > 0.15) {
          c.fillStyle = `rgb(30,${100+(hash(px,py)*40)|0},30)`;
          c.fillRect(px, py, 1, 1);
        }
      }
    }
  });
  drawTexture(ctx, TEX.WATER, c => fillNoisy(c, 50, 130, 220, 15));
  drawTexture(ctx, TEX.BILIBILI_PINK, c => fillNoisy(c, 251, 114, 153, 8));
  
  // 新增纹理
  drawTexture(ctx, TEX.COBBLESTONE, c => {
    fillNoisy(c, 115, 115, 115, 20);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = 'rgba(70,70,70,0.6)';
      c.fillRect((hash(i,1)*12)|0, (hash(i,2)*12)|0, 3, 2);
    }
  });
  drawTexture(ctx, TEX.MOSSY_COBBLESTONE, c => {
    fillNoisy(c, 115, 115, 115, 20);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = `rgba(${60+i*2},${100+i*3},${50+i},0.7)`;
      c.fillRect((hash(i,1)*14)|0, (hash(i,2)*14)|0, 2, 2);
    }
  });
  drawTexture(ctx, TEX.SNOWY_GRASS_TOP, c => fillNoisy(c, 250, 250, 255, 5));
  drawTexture(ctx, TEX.SNOWY_GRASS_SIDE, c => {
    fillNoisy(c, 134, 96, 67, 20);
    for (let py = 0; py < 6; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        c.fillStyle = `rgb(${245+(hash(px,py)-0.5)*5|0},${245+(hash(px,py)-0.5)*5|0},255)`;
        c.fillRect(px, py, 1, 1);
      }
    }
  });
  drawTexture(ctx, TEX.SNOW_BLOCK, c => fillNoisy(c, 252, 252, 255, 4));
  drawTexture(ctx, TEX.BIRCH_WOOD_SIDE, c => {
    fillNoisy(c, 230, 220, 200, 8);
    for (let px = 0; px < TEX_SIZE; px++) {
      if (hash(px, 777) > 0.7) {
        c.fillStyle = 'rgba(50,50,50,0.3)';
        c.fillRect(px, 0, 1, TEX_SIZE);
      }
    }
  });
  drawTexture(ctx, TEX.BIRCH_LEAVES, c => {
    for (let py = 0; py < TEX_SIZE; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        if (hash(px+70,py+70) > 0.2) {
          c.fillStyle = `rgb(${80+(hash(px,py)*30)|0},${180+(hash(px+1,py)*20)|0},${60+(hash(px,py+1)*20)|0})`;
          c.fillRect(px, py, 1, 1);
        }
      }
    }
  });
  drawTexture(ctx, TEX.SANDSTONE, c => {
    fillNoisy(c, 210, 180, 100, 15);
    for (let py = 0; py < TEX_SIZE; py += 4) {
      c.fillStyle = 'rgba(180,150,80,0.3)';
      c.fillRect(0, py, TEX_SIZE, 1);
    }
  });
  
  // 花朵纹理（简化版十字形状）
  drawTexture(ctx, TEX.POPPY, c => {
    c.fillStyle = '#404040';
    c.fillRect(7, 14, 2, 2);
    c.fillStyle = '#ff3030';
    c.fillRect(6, 5, 4, 4);
    c.fillRect(4, 7, 8, 2);
    c.fillRect(7, 4, 2, 1);
  });
  drawTexture(ctx, TEX.DANDELION, c => {
    c.fillStyle = '#404040';
    c.fillRect(7, 14, 2, 2);
    c.fillStyle = '#ffff30';
    c.fillRect(6, 6, 4, 4);
    c.fillRect(4, 8, 8, 1);
    c.fillRect(8, 5, 1, 1);
  });
  drawTexture(ctx, TEX.ALLIUM, c => {
    c.fillStyle = '#404040';
    c.fillRect(7, 14, 2, 2);
    c.fillStyle = '#aa55ff';
    c.fillRect(5, 5, 6, 5);
    c.fillRect(3, 7, 10, 2);
  });
  drawTexture(ctx, TEX.BLUE_ORCHID, c => {
    c.fillStyle = '#404040';
    c.fillRect(7, 14, 2, 2);
    c.fillStyle = '#5588ff';
    c.fillRect(6, 4, 4, 6);
    c.fillRect(4, 6, 8, 3);
  });
  
  // 玻璃（透明方块，用边框表示）
  drawTexture(ctx, TEX.GLASS, c => {
    c.fillStyle = 'rgba(200,220,255,0.3)';
    c.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    c.strokeStyle = 'rgba(150,180,220,0.8)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, TEX_SIZE-1, TEX_SIZE-1);
  });
  
  // 钻石块
  drawTexture(ctx, TEX.DIAMOND_BLOCK, c => {
    fillNoisy(c, 80, 200, 255, 10);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(50,150,200,0.5)';
      c.fillRect((hash(i,1)*10)|0, (hash(i,2)*10)|0, 4, 4);
    }
  });

  return canvas;
}

export function createBlockTexture() {
  const canvas = createAtlasCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return texture;
}

export function getBlockColor(type) {
  const colors = {
    [BlockType.GRASS]: '#5a9e32', [BlockType.DIRT]: '#866043',
    [BlockType.STONE]: '#808080', [BlockType.SAND]: '#dccc82',
    [BlockType.WOOD]: '#78503a', [BlockType.LEAVES]: '#2d6e1e',
    [BlockType.WATER]: '#3388dd', [BlockType.BILIBILI_PINK]: '#FB7299',
    [BlockType.COBBLESTONE]: '#7a7a7a', [BlockType.MOSSY_COBBLESTONE]: '#6a8a6a',
    [BlockType.SNOWY_GRASS]: '#f0f0ff', [BlockType.SNOW_BLOCK]: '#ffffff',
    [BlockType.BIRCH_WOOD]: '#e0d8c8', [BlockType.BIRCH_LEAVES]: '#70b060',
    [BlockType.SANDSTONE]: '#d4b864', [BlockType.GLASS]: '#a0c0e0',
    [BlockType.DIAMOND_BLOCK]: '#50c8ff', [BlockType.BRICK]: '#b06040',
  };
  return colors[type] || '#ff00ff';
}

function getTexUV(texIndex) {
  const col = texIndex % ATLAS_COLS;
  const row = Math.floor(texIndex / ATLAS_COLS);
  return {
    u0: col / ATLAS_COLS,
    u1: (col + 1) / ATLAS_COLS,
    v0: row / ATLAS_ROWS,
    v1: (row + 1) / ATLAS_ROWS,
  };
}

/* ============================================
   六个面的几何定义
   ============================================ */
const FACES = [
  { dir: [1, 0, 0], face: 'side', corners: [
    { pos: [1, 0, 0], uv: [0, 0] }, { pos: [1, 1, 0], uv: [0, 1] },
    { pos: [1, 1, 1], uv: [1, 1] }, { pos: [1, 0, 1], uv: [1, 0] },
  ]},
  { dir: [-1, 0, 0], face: 'side', corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [0, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [1, 0] },
  ]},
  { dir: [0, 1, 0], face: 'top', corners: [
    { pos: [0, 1, 0], uv: [0, 0] }, { pos: [0, 1, 1], uv: [0, 1] },
    { pos: [1, 1, 1], uv: [1, 1] }, { pos: [1, 1, 0], uv: [1, 0] },
  ]},
  { dir: [0, -1, 0], face: 'bottom', corners: [
    { pos: [0, 0, 1], uv: [0, 0] }, { pos: [0, 0, 0], uv: [0, 1] },
    { pos: [1, 0, 0], uv: [1, 1] }, { pos: [1, 0, 1], uv: [1, 0] },
  ]},
  { dir: [0, 0, 1], face: 'side', corners: [
    { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 1, 1], uv: [0, 1] },
    { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] },
  ]},
  { dir: [0, 0, -1], face: 'side', corners: [
    { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 1, 0], uv: [0, 1] },
    { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] },
  ]},
];

/* ============================================
   区块类 (Chunk)
   ============================================ */
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    this.mesh = null;
    this.waterMesh = null;
    this.flowerMesh = null;
    this.dirty = true;
  }

  getBlock(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) {
      return BlockType.AIR;
    }
    return this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE];
  }

  setBlock(lx, ly, lz, type) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
    this.blocks[lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE] = type;
    this.dirty = true;
  }

  buildMesh(getWorldBlock, material, waterMaterial, flowerMaterial) {
    let hasSolid = false;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== 0) { hasSolid = true; break; }
    }
    if (!hasSolid) {
      this._disposeMesh();
      this.dirty = false;
      return;
    }

    const wx0 = this.cx * CHUNK_SIZE;
    const wz0 = this.cz * CHUNK_SIZE;

    const sPositions = [], sNormals = [], sUvs = [], sIndices = [];
    const wPositions = [], wNormals = [], wUvs = [], wIndices = [];
    const fPositions = [], fNormals = [], fUvs = [], fIndices = [];
    let sVc = 0, wVc = 0, fVc = 0;

    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const blockType = this.getBlock(lx, ly, lz);
          if (blockType === BlockType.AIR) continue;

          const texMapping = BLOCK_TEXTURES[blockType];
          if (!texMapping) continue;

          const isWater = blockType === BlockType.WATER;
          const isFlower = [BlockType.POPPY, BlockType.DANDELION, BlockType.ALLIUM, BlockType.BLUE_ORCHID].includes(blockType);
          
          let positions, normals, uvs, indices, vertexCount;
          if (isWater) {
            positions = wPositions; normals = wNormals; uvs = wUvs; indices = wIndices; vertexCount = wVc;
          } else if (isFlower) {
            positions = fPositions; normals = fNormals; uvs = fUvs; indices = fIndices; vertexCount = fVc;
          } else {
            positions = sPositions; normals = sNormals; uvs = sUvs; indices = sIndices; vertexCount = sVc;
          }

          for (const face of FACES) {
            const nx = lx + face.dir[0];
            const ny = ly + face.dir[1];
            const nz = lz + face.dir[2];

            let neighborType;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT) {
              neighborType = this.getBlock(nx, ny, nz);
            } else {
              neighborType = getWorldBlock(wx0 + nx, ny, wz0 + nz);
            }

            // 花朵特殊处理：只渲染十字形状的面
            if (isFlower) {
              if (face.dir[1] !== 0) continue; // 只渲染侧面
              // 简化：渲染两个交叉的面
              if (face.dir[0] !== 0 || face.dir[2] !== 0) {
                const texIdx = texMapping[face.face];
                const { u0, v0, u1, v1 } = getTexUV(texIdx);
                
                for (const corner of face.corners) {
                  positions.push(lx + corner.pos[0], ly + corner.pos[1] * 0.5, lz + corner.pos[2]);
                  normals.push(face.dir[0], face.dir[1], face.dir[2]);
                  uvs.push(u0 + corner.uv[0] * (u1 - u0), v0 + corner.uv[1] * (v1 - v0));
                }
                indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
                vertexCount += 4;
              }
              continue;
            }

            if (neighborType !== BlockType.AIR && neighborType !== BlockType.WATER && 
                neighborType !== BlockType.POPPY && neighborType !== BlockType.DANDELION &&
                neighborType !== BlockType.ALLIUM && neighborType !== BlockType.BLUE_ORCHID) continue;

            const texIdx = texMapping[face.face];
            const { u0, v0, u1, v1 } = getTexUV(texIdx);

            for (const corner of face.corners) {
              positions.push(lx + corner.pos[0], ly + corner.pos[1], lz + corner.pos[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              uvs.push(u0 + corner.uv[0] * (u1 - u0), v0 + corner.uv[1] * (v1 - v0));
            }

            indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
            vertexCount += 4;
          }

          if (isWater) wVc = vertexCount;
          else if (isFlower) fVc = vertexCount;
          else sVc = vertexCount;
        }
      }
    }

    this._disposeMesh();

    if (sPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(sNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(sUvs, 2));
      geo.setIndex(sIndices);
      geo.computeBoundingSphere();
      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.position.set(wx0, 0, wz0);
    }

    if (wPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(wNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(wUvs, 2));
      geo.setIndex(wIndices);
      geo.computeBoundingSphere();
      this.waterMesh = new THREE.Mesh(geo, waterMaterial);
      this.waterMesh.position.set(wx0, 0, wz0);
    }

    if (fPositions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(fPositions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(fNormals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(fUvs, 2));
      geo.setIndex(fIndices);
      geo.computeBoundingSphere();
      this.flowerMesh = new THREE.Mesh(geo, flowerMaterial);
      this.flowerMesh.position.set(wx0, 0, wz0);
    }

    this.dirty = false;
  }

  _disposeMesh() {
    if (this.mesh) { this.mesh.geometry.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.mesh = null; }
    if (this.waterMesh) { this.waterMesh.geometry.dispose(); if (this.waterMesh.parent) this.waterMesh.parent.remove(this.waterMesh); this.waterMesh = null; }
    if (this.flowerMesh) { this.flowerMesh.geometry.dispose(); if (this.flowerMesh.parent) this.flowerMesh.parent.remove(this.flowerMesh); this.flowerMesh = null; }
  }

  dispose() { this._disposeMesh(); }
}

/* ============================================
   世界类 (World) - 含生物群系和增强地形生成
   ============================================ */
export class World {
  constructor(scene, seed = 12345) {
    this.scene = scene;
    this.seed = seed;
    this.noise = new SimplexNoise(seed);
    this.treeNoise = new SimplexNoise(seed + 777);
    this.biomeNoise = new SimplexNoise(seed + 333);
    this.flowerNoise = new SimplexNoise(seed + 555);
    this.chunks = new Map();
    this.material = null;
    this.waterMaterial = null;
    this.flowerMaterial = null;
    this.pendingChunks = [];
    this.renderDistance = RENDER_DISTANCE;
  }

  init() {
    const texture = createBlockTexture();
    this.material = new THREE.MeshLambertMaterial({
      map: texture, side: THREE.FrontSide, transparent: false, depthWrite: true,
    });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: texture, side: THREE.FrontSide, transparent: true, opacity: 0.7, depthWrite: false,
    });
    this.flowerMaterial = new THREE.MeshLambertMaterial({
      map: texture, side: THREE.DoubleSide, transparent: false, depthWrite: true,
    });
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockType.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return BlockType.AIR;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getBlock(lx, wy, lz);
  }

  setBlock(wx, wy, wz, type) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return;
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setBlock(lx, wy, lz, type);
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (chunk) chunk.dirty = true;
  }

  /** 获取生物群系类型 */
  _getBiome(wx, wz) {
    const scale = 0.008;
    const temp = this.biomeNoise.fbm(wx * scale, wz * scale, 3, 2.0, 0.5);
    const humid = this.biomeNoise.fbm(wx * scale + 1000, wz * scale + 1000, 3, 2.0, 0.5);
    
    if (temp > 0.6) return BiomeType.DESERT;
    if (temp < -0.3) return BiomeType.SNOWY_PLAINS;
    if (humid > 0.4) return BiomeType.FOREST;
    return BiomeType.PLAINS;
  }

  // ────────────── BILIBILI 文字立墙 ───────────────
  static LETTERS = {
    B: [[0,1,1,1,1,1,1,1,0],[1,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,1,1,0],[1,0,0,0,0,0,0,0,1],[1,0,0,0,0,0,0,0,1],[0,1,1,1,1,1,1,1,0]],
    I: [[0,0,1,1,1,1,1,0,0],[0,0,0,0,1,0,0,0,0],[0,0,0,0,1,0,0,0,0],[0,0,0,0,1,0,0,0,0],[0,0,0,0,1,0,0,0,0],[0,0,0,0,1,0,0,0,0],[0,0,1,1,1,1,1,0,0]],
    L: [[1,1,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,1,0],[0,0,0,0,0,0,0,1,0],[1,1,1,1,1,1,1,1,1]],
  };
  static WORD = ['B','I','L','I','B','I','L','I'];
  static LETTER_SIZE = 9;
  static GAP = 2;
  static TEXT_GROUND_Y = 18;
  static TEXT_FLAT_RADIUS_X = 50;
  static TEXT_FLAT_RADIUS_Z = 15;
  static TOTAL_W = 86;
  static TEXT_START_X = -43;
  static TEXT_BASE_Y = 19;
  static TEXT_WALL_Z = 0;
  static TEXT_WALL_DEPTH = 3;

  _getTextBlock(wx, wy, wz) {
    const wallMinZ = World.TEXT_WALL_Z - 1, wallMaxZ = World.TEXT_WALL_Z + 1;
    if (wz < wallMinZ || wz > wallMaxZ) return BlockType.AIR;
    if (wy < World.TEXT_BASE_Y || wy >= World.TEXT_BASE_Y + 7) return BlockType.AIR;
    const lx = wx - World.TEXT_START_X, ly = wy - World.TEXT_BASE_Y;
    if (lx < 0 || ly < 0 || ly >= 7) return BlockType.AIR;
    let off = 0;
    for (const ch of World.WORD) {
      if (lx >= off && lx < off + 9) {
        return World.LETTERS[ch][ly][lx - off] ? BlockType.BILIBILI_PINK : BlockType.AIR;
      }
      off += 9 + 2;
    }
    return BlockType.AIR;
  }

  _isInTextZone(cx, cz) {
    const x0 = cx * CHUNK_SIZE, x1 = x0 + 15;
    const z0 = cz * CHUNK_SIZE, z1 = z0 + 15;
    return x1 >= -World.TEXT_FLAT_RADIUS_X && x0 <= World.TEXT_FLAT_RADIUS_X &&
           z1 >= -World.TEXT_FLAT_RADIUS_Z && z0 <= World.TEXT_FLAT_RADIUS_Z;
  }

  generateChunkData(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    const GY = World.TEXT_GROUND_Y;

    if (this._isInTextZone(cx, cz)) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = wx0 + lx, wz = wz0 + lz;
          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            let b;
            if (y < GY - 5) b = BlockType.STONE;
            else if (y < GY) b = BlockType.DIRT;
            else if (y === GY) b = BlockType.SAND;
            else if (y >= World.TEXT_BASE_Y && y < World.TEXT_BASE_Y + 7) b = this._getTextBlock(wx, y, wz);
            else b = BlockType.AIR;
            chunk.setBlock(lx, y, lz, b);
          }
        }
      }
      return;
    }

    // === 正常地形：基于生物群系生成 ===
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this._getBiome(wx, wz);
        const config = BiomeConfig[biome];

        const scale = 0.02;
        const heightNoise = this.noise.fbm(wx * scale, wz * scale, 4, 2.0, 0.5);
        let height = Math.floor((heightNoise + 1) * 0.5 * 28 + 10);
        if (biome === BiomeType.DESERT) height = Math.min(height, 22);
        if (biome === BiomeType.SNOWY_PLAINS) height += 2;
        height = Math.max(1, Math.min(CHUNK_HEIGHT - 1, height));

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let blockType = BlockType.AIR;
          if (y <= height) {
            if (y === height) blockType = config.groundBlock;
            else if (y > height - 4) blockType = config.underBlock;
            else blockType = BlockType.STONE;
          }
          chunk.setBlock(lx, y, lz, blockType);
        }
      }
    }

    this._generateTrees(chunk);
    this._generateFlowers(chunk);
    this._generateStructures(chunk);
  }

  _generateTrees(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    for (let lz = 3; lz < CHUNK_SIZE - 3; lz++) {
      for (let lx = 3; lx < CHUNK_SIZE - 3; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this._getBiome(wx, wz);
        const config = BiomeConfig[biome];
        
        if (config.treeType === 'none') continue;
        
        const treeVal = this.treeNoise.noise2D(wx * 0.3, wz * 0.3);
        const threshold = 1 - config.treeChance * 2;
        if (treeVal < threshold) continue;

        let surfaceY = -1;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const b = chunk.getBlock(lx, y, lz);
          if (b === BlockType.GRASS || b === BlockType.SNOWY_GRASS) { surfaceY = y; break; }
        }
        if (surfaceY < 0 || surfaceY > CHUNK_HEIGHT - 12) continue;

        const trunkHeight = 4 + (hash(wx, wz) * 3 | 0);
        const isBirch = config.treeType === 'birch' || (biome === BiomeType.FOREST && hash(wx + 100, wz) > 0.6);
        const woodType = isBirch ? BlockType.BIRCH_WOOD : BlockType.WOOD;
        const leavesType = isBirch ? BlockType.BIRCH_LEAVES : BlockType.LEAVES;

        for (let ty = 1; ty <= trunkHeight; ty++) {
          chunk.setBlock(lx, surfaceY + ty, lz, woodType);
        }

        const canopyY = surfaceY + trunkHeight;
        for (let dy = 0; dy < 3; dy++) {
          const radius = dy === 2 ? 1 : 2;
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy < 2) continue;
              const bx = lx + dx, bz = lz + dz;
              if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE) {
                if (chunk.getBlock(bx, canopyY + dy, bz) === BlockType.AIR) {
                  chunk.setBlock(bx, canopyY + dy, bz, leavesType);
                }
              }
            }
          }
        }
      }
    }
  }

  _generateFlowers(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    const flowerTypes = [BlockType.POPPY, BlockType.DANDELION, BlockType.ALLIUM, BlockType.BLUE_ORCHID];

    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this._getBiome(wx, wz);
        const config = BiomeConfig[biome];
        
        if (config.flowerChance === 0) continue;
        
        const flowerVal = this.flowerNoise.noise2D(wx * 0.5, wz * 0.5);
        const threshold = 1 - config.flowerChance * 2;
        if (flowerVal < threshold) continue;

        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          if (chunk.getBlock(lx, y, lz) === BlockType.GRASS && chunk.getBlock(lx, y + 1, lz) === BlockType.AIR) {
            const flowerType = flowerTypes[(hash(wx + wz, y) * 4) | 0];
            chunk.setBlock(lx, y + 1, lz, flowerType);
            break;
          }
        }
      }
    }
  }

  _generateStructures(chunk) {
    const { cx, cz } = chunk;
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;

    // 沙漠中的沙岩结构
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const wx = wx0 + lx, wz = wz0 + lz;
        const biome = this._getBiome(wx, wz);
        
        if (biome !== BiomeType.DESERT) continue;
        
        if (hash(wx * 3, wz * 3) > 0.95) {
          let surfaceY = -1;
          for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            if (chunk.getBlock(lx, y, lz) === BlockType.SAND) { surfaceY = y; break; }
          }
          if (surfaceY > 0) {
            const height = 2 + (hash(wx, wz) * 2 | 0);
            for (let dy = 0; dy < height; dy++) {
              chunk.setBlock(lx, surfaceY + dy + 1, lz, BlockType.SANDSTONE);
            }
          }
        }
      }
    }
  }

  update(playerX, playerZ) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);

    const neededChunks = new Set();
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        if (dx * dx + dz * dz <= this.renderDistance * this.renderDistance) {
          neededChunks.add(this.chunkKey(pcx + dx, pcz + dz));
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!neededChunks.has(key)) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.remove(chunk.flowerMesh);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }

    for (const key of neededChunks) {
      if (!this.chunks.has(key) && !this.pendingChunks.some(c => this.chunkKey(c.cx, c.cz) === key)) {
        const [cx, cz] = key.split(',').map(Number);
        this.pendingChunks.push({ cx, cz });
      }
    }

    if (this.pendingChunks.length > 0) {
      const { cx, cz } = this.pendingChunks.shift();
      const chunk = new Chunk(cx, cz);
      this.generateChunkData(chunk);
      chunk.buildMesh(this.getBlock.bind(this), this.material, this.waterMaterial, this.flowerMaterial);
      this.chunks.set(this.chunkKey(cx, cz), chunk);
      if (chunk.mesh) this.scene.add(chunk.mesh);
      if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
      if (chunk.flowerMesh) this.scene.add(chunk.flowerMesh);
    }

    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.remove(chunk.flowerMesh);
        chunk.buildMesh(this.getBlock.bind(this), this.material, this.waterMaterial, this.flowerMaterial);
        if (chunk.mesh) this.scene.add(chunk.mesh);
        if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.add(chunk.flowerMesh);
      }
    }
  }

  rebuildDirtyChunks() {
    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.remove(chunk.flowerMesh);
        chunk.buildMesh(this.getBlock.bind(this), this.material, this.waterMaterial, this.flowerMaterial);
        if (chunk.mesh) this.scene.add(chunk.mesh);
        if (chunk.waterMesh) this.scene.add(chunk.waterMesh);
        if (chunk.flowerMesh) this.scene.add(chunk.flowerMesh);
      }
    }
  }
}