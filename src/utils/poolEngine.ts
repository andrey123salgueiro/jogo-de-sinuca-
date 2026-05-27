/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ball, BallType, GameMode, GameLog } from '../types';
import { playBallCollisionSound, playWallBounceSound, playPocketDropSound } from './audio';

// Table dimensions
export const TABLE_WIDTH = 800;
export const TABLE_HEIGHT = 400;

// Pocket centers
export const POCKETS = [
  { x: 0, y: 0, r: 24, name: 'Canto Superior Esquerdo' },
  { x: TABLE_WIDTH / 2, y: -4, r: 22, name: 'Meio Superior' },
  { x: TABLE_WIDTH, y: 0, r: 24, name: 'Canto Superior Direito' },
  { x: 0, y: TABLE_HEIGHT, r: 24, name: 'Canto Inferior Esquerdo' },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + 4, r: 22, name: 'Meio Inferior' },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT, r: 24, name: 'Canto Inferior Direito' },
];

// Cushion boundaries for bumper collision segments
const CUSHIONS = [
  { axis: 'y', val: 0, minX: 24, maxX: 376, normalY: 1 },         // Top-Left
  { axis: 'y', val: 0, minX: 424, maxX: 776, normalY: 1 },        // Top-Right
  { axis: 'y', val: TABLE_HEIGHT, minX: 24, maxX: 376, normalY: -1 }, // Bottom-Left
  { axis: 'y', val: TABLE_HEIGHT, minX: 424, maxX: 776, normalY: -1 },// Bottom-Right
  { axis: 'x', val: 0, minY: 24, maxY: 376, normalX: 1 },         // Left
  { axis: 'x', val: TABLE_WIDTH, minY: 24, maxY: 376, normalX: -1 },  // Right
];

// Bumper corners/tips that act as small rounded spikes
const BUMPER_TIPS = [
  { x: 24, y: 0 }, { x: 376, y: 0 },
  { x: 424, y: 0 }, { x: 776, y: 0 },
  { x: 24, y: TABLE_HEIGHT }, { x: 376, y: TABLE_HEIGHT },
  { x: 424, y: TABLE_HEIGHT }, { x: 776, y: TABLE_HEIGHT },
  { x: 0, y: 24 }, { x: 0, y: 376 },
  { x: TABLE_WIDTH, y: 24 }, { x: TABLE_WIDTH, y: 376 }
];

export function initializeBalls(width: number, height: number): Ball[] {
  const radius = 11; // Standard size fitting 800x400 playing field nicely
  const balls: Ball[] = [];

  // 1. Cue Ball (White) on the left side of the table (Head String)
  balls.push({
    id: 0,
    number: 0,
    type: BallType.CUE,
    color: '#FAFAF9', // Chalky white
    x: width * 0.26,
    y: height * 0.5,
    vx: 0,
    vy: 0,
    radius,
    isSunk: false,
    sinkingProgress: 1.0,
  });

  // Triangle Rack positioning around 71% width
  const rackX = width * 0.70;
  const rackY = height * 0.5;
  const dx = radius * 1.732; // sqrt(3) * r (perfect triangle packing)
  const dy = radius + 0.3;   // Standard gap helper

  // 8-Ball must be in center (Row 3, pos 2)
  // Corner of last row must be different patterns (stripe + solid)
  // Deliberate placement layout
  const rackNumbers = [
    1,            // Apex (Solid)
    9, 2,         // Row 2
    3, 8, 10,     // Row 3 (8-ball exactly in center)
    11, 4, 12, 5, // Row 4
    6, 13, 7, 14, 15 // Row 5
  ];

  const colors = [
    '#F59E0B', // 1 Yellow
    '#2563EB', // 2 Blue
    '#DC2626', // 3 Red
    '#7C3AED', // 4 Purple
    '#EA580C', // 5 Orange
    '#16A34A', // 6 Green
    '#7F1D1D', // 7 Maroon
    '#111827', // 8 Black
    '#F59E0B', // 9 Stripe Yellow
    '#2563EB', // 10 Stripe Blue
    '#DC2626', // 11 Stripe Red
    '#7C3AED', // 12 Stripe Purple
    '#EA580C', // 13 Stripe Orange
    '#16A34A', // 14 Stripe Green
    '#7F1D1D', // 15 Stripe Maroon
  ];

  let rackIdx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const num = rackNumbers[rackIdx];
      const type = num === 8 ? BallType.EIGHT : (num <= 7 ? BallType.SOLID : BallType.STRIPE);
      const color = colors[num - 1];

      const bx = rackX + row * dx;
      const by = rackY + (col - row / 2) * (dy * 2);

      balls.push({
        id: num,
        number: num,
        type,
        color,
        x: bx,
        y: by,
        vx: 0,
        vy: 0,
        radius,
        isSunk: false,
        sinkingProgress: 1.0,
      });

      rackIdx++;
    }
  }

  return balls;
}

// Check if a point is inside any pocket region
export function isNearPocket(x: number, y: number, r: number = 20): boolean {
  return POCKETS.some(p => {
    const dist = Math.hypot(x - p.x, y - p.y);
    return dist < p.r + r;
  });
}

// Find a valid spot to place Cue Ball in (used for cue ball in hand or foul resets)
export function findSafeCueBallSpot(balls: Ball[]): { x: number, y: number } {
  let attempts = 0;
  const radius = 11;
  const defaultX = TABLE_WIDTH * 0.25;
  const defaultY = TABLE_HEIGHT * 0.5;

  while (attempts < 200) {
    const rx = attempts === 0 ? defaultX : 50 + Math.random() * (TABLE_WIDTH * 0.4);
    const ry = attempts === 0 ? defaultY : 50 + Math.random() * (TABLE_HEIGHT - 100);

    // Check overlaps with existing active balls and pockets
    const colliding = balls.some(b => {
      if (b.id === 0 || b.isSunk) return false;
      const dist = Math.hypot(b.x - rx, b.y - ry);
      return dist < (b.radius + radius + 10); // leave extra breathing room
    });

    const isNearPock = isNearPocket(rx, ry, radius + 15);

    if (!colliding && !isNearPock) {
      return { x: rx, y: ry };
    }
    attempts++;
  }

  return { x: defaultX, y: defaultY };
}

// Physics simulation step
export function updatePhysics(
  balls: Ball[],
  friction: number,
  elasticity: number,
  onPocketSink: (ball: Ball) => void
): boolean {
  let anyMoving = false;

  // 1. Move and update positions / cushion bounces / pocket checks
  for (const b of balls) {
    if (b.isSunk) continue;

    // A. Handle sinking animate progress
    if (b.sinkingProgress < 1.0) {
      b.sinkingProgress -= 0.05;
      b.vx *= 0.5;
      b.vy *= 0.5;
      
      // Pull towards pocket center
      const pocketIdx = POCKETS.findIndex(p => Math.hypot(b.x - p.x, b.y - p.y) < p.r + 20);
      if (pocketIdx !== -1) {
        const p = POCKETS[pocketIdx];
        b.x += (p.x - b.x) * 0.15;
        b.y += (p.y - b.y) * 0.15;
      }

      if (b.sinkingProgress <= 0) {
        b.sinkingProgress = 0;
        b.isSunk = true;
        b.vx = 0;
        b.vy = 0;
        onPocketSink(b);
      }
      anyMoving = true;
      continue;
    }

    // B. Standard moving
    if (Math.abs(b.vx) > 0.005 || Math.abs(b.vy) > 0.005) {
      b.x += b.vx;
      b.y += b.vy;

      // Apply rolling friction
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - friction);
        b.vx = (b.vx / speed) * newSpeed;
        b.vy = (b.vy / speed) * newSpeed;
      }

      anyMoving = true;
    } else {
      b.vx = 0;
      b.vy = 0;
    }

    // C. Pocket triggers
    for (const p of POCKETS) {
      const distToPocket = Math.hypot(b.x - p.x, b.y - p.y);
      if (distToPocket < p.r - 2) {
        b.sinkingProgress = 0.95; // Begin animated sinking
        playPocketDropSound();
        break;
      }
    }

    // D. Cushion bounce logic
    for (const c of CUSHIONS) {
      if (c.axis === 'y') {
        const dist = Math.abs(b.y - c.val);
        if (dist < b.radius && b.x >= c.minX && b.x <= c.maxX) {
          if (c.val === 0 && b.vy < 0) {
            b.vy = -b.vy * elasticity;
            b.y = b.radius;
            playWallBounceSound(Math.abs(b.vy));
          } else if (c.val === TABLE_HEIGHT && b.vy > 0) {
            b.vy = -b.vy * elasticity;
            b.y = TABLE_HEIGHT - b.radius;
            playWallBounceSound(Math.abs(b.vy));
          }
        }
      } else {
        const dist = Math.abs(b.x - c.val);
        if (dist < b.radius && b.y >= c.minY && b.y <= c.maxY) {
          if (c.val === 0 && b.vx < 0) {
            b.vx = -b.vx * elasticity;
            b.x = b.radius;
            playWallBounceSound(Math.abs(b.vx));
          } else if (c.val === TABLE_WIDTH && b.vx > 0) {
            b.vx = -b.vx * elasticity;
            b.x = TABLE_WIDTH - b.radius;
            playWallBounceSound(Math.abs(b.vx));
          }
        }
      }
    }

    // E. Rounded Bumper Tips bounces
    for (const p of BUMPER_TIPS) {
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist < b.radius) {
        const nX = (b.x - p.x) / dist;
        const nY = (b.y - p.y) / dist;
        const vNormal = b.vx * nX + b.vy * nY;

        if (vNormal < 0) { // Moving towards tip
          b.vx -= (1 + elasticity) * vNormal * nX;
          b.vy -= (1 + elasticity) * vNormal * nY;

          // Reposition away
          b.x = p.x + nX * b.radius;
          b.y = p.y + nY * b.radius;
          playWallBounceSound(Math.hypot(b.vx, b.vy));
        }
      }
    }
  }

  // 2. Resolve Ball to Ball collisions
  for (let i = 0; i < balls.length; i++) {
    const b1 = balls[i];
    if (b1.isSunk || b1.sinkingProgress < 1) continue;

    for (let j = i + 1; j < balls.length; j++) {
      const b2 = balls[j];
      if (b2.isSunk || b2.sinkingProgress < 1) continue;

      const dx = b2.x - b1.x;
      const dy = b2.y - b1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = b1.radius + b2.radius;

      if (dist < minDist) {
        const nX = dx / dist;
        const nY = dy / dist;

        // Resolve overlap
        const overlap = minDist - dist;
        b1.x -= nX * overlap * 0.51; // slightly over 0.5 to prevent lock-in jitter
        b1.y -= nY * overlap * 0.51;
        b2.x += nX * overlap * 0.51;
        b2.y += nY * overlap * 0.51;

        // Relative velocity along collision normal
        const rVx = b2.vx - b1.vx;
        const rVy = b2.vy - b1.vy;
        const velAlongNormal = rVx * nX + rVy * nY;

        if (velAlongNormal < 0) { // Moving towards each other
          const restitution = 0.97; // High elastic bounce for pool balls
          const impulseScalar = -(1 + restitution) * velAlongNormal / 2; // identical mass

          b1.vx -= impulseScalar * nX;
          b1.vy -= impulseScalar * nY;
          b2.vx += impulseScalar * nX;
          b2.vy += impulseScalar * nY;

          playBallCollisionSound(Math.hypot(b1.vx - b2.vx, b1.vy - b2.vy));
        }
      }
    }
  }

  return anyMoving;
}

// Raycast to calculate predictive line
export interface BallPrediction {
  targetBall: Ball;
  collisionX: number;
  collisionY: number;
  targetVx: number;
  targetVy: number;
  cueVx: number;
  cueVy: number;
  dist: number;
}

export function calculateAimGuideline(balls: Ball[], angle: number): BallPrediction | null {
  const cue = balls[0];
  if (cue.isSunk) return null;

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  let firstCollision: BallPrediction | null = null;
  let minDist = Infinity;

  // Let's raycast against all active balls
  for (const b of balls) {
    if (b.id === 0 || b.isSunk) continue;

    // Vector from cue center to ball center
    const cx = b.x - cue.x;
    const cy = b.y - cue.y;
    const projection = cx * dx + cy * dy;

    if (projection <= 0) continue; // behind the shot

    const closestPointX = cue.x + dx * projection;
    const closestPointY = cue.y + dy * projection;

    const distToCenterSq = Math.hypot(b.x - closestPointX, b.y - closestPointY);
    const colDist = cue.radius + b.radius;

    if (distToCenterSq < colDist) {
      // Find actual contact point along ray
      const offset = Math.sqrt(colDist * colDist - distToCenterSq * distToCenterSq);
      const contactDist = projection - offset;

      if (contactDist > 0 && contactDist < minDist) {
        minDist = contactDist;

        // Calculate velocities upon collision
        const collisionX = cue.x + dx * contactDist;
        const collisionY = cue.y + dy * contactDist;

        // Vector from collision spot to target ball center
        const tX = b.x - collisionX;
        const tY = b.y - collisionY;
        const h = Math.hypot(tX, tY);
        const normTX = h > 0 ? tX / h : 1;
        const normTY = h > 0 ? tY / h : 0;

        // Cue redirect direction is orthogonal
        const normCX = -normTY;
        const normCY = normTX;

        // Calculate split velocities based on geometric impact cut angle
        const dotImpact = dx * normTX + dy * normTY; // how straight the shot is

        firstCollision = {
          targetBall: b,
          collisionX,
          collisionY,
          targetVx: normTX * dotImpact * 4,
          targetVy: normTY * dotImpact * 4,
          cueVx: normCX * (1 - Math.abs(dotImpact)) * 4 * (dx * normCX + dy * normCY >= 0 ? 1 : -1),
          cueVy: normCY * (1 - Math.abs(dotImpact)) * 4 * (dx * normCX + dy * normCY >= 0 ? 1 : -1),
          dist: contactDist
        };
      }
    }
  }

  return firstCollision;
}

// Draw the pool table frame, cushions, pockets, and cards
export function drawTableBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  themeConfig: 'green' | 'blue' | 'red' | 'dark'
) {
  // 1. Theme configuration colors
  let feltColor = '#065F46'; // Green
  let borderWood = '#78350F'; // Rich Brown Wooden Rim
  let cushionDark = '#064E3B';

  if (themeConfig === 'blue') {
    feltColor = '#1D4ED8';
    borderWood = '#475569';
    cushionDark = '#1E3A8A';
  } else if (themeConfig === 'red') {
    feltColor = '#991B1B';
    borderWood = '#451A03';
    cushionDark = '#7F1D1D';
  } else if (themeConfig === 'dark') {
    feltColor = '#1F2937';
    borderWood = '#111827';
    cushionDark = '#111827';
  }

  // Draw Wood Border Frame (slightly offset outside TABLE_WIDTH x TABLE_HEIGHT)
  const borderWidth = 22;
  ctx.fillStyle = borderWood;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(
    -borderWidth,
    -borderWidth,
    width + borderWidth * 2,
    height + borderWidth * 2,
    14
  );
  ctx.fill();

  // Highlight thin ring inside wood border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw Diamonds (billiard guides) along the wood frames
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  const drawDiamond = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  // Place diamonds periodically
  for (let i = 1; i < 8; i++) {
    drawDiamond((width / 8) * i, -borderWidth / 2); // Top
    drawDiamond((width / 8) * i, height + borderWidth / 2); // Bottom
  }
  for (let i = 1; i < 4; i++) {
    drawDiamond(-borderWidth / 2, (height / 4) * i); // Left
    drawDiamond(width + borderWidth / 2, (height / 4) * i); // Right
  }

  // Draw Table Felt Canvas
  ctx.fillStyle = feltColor;
  ctx.fillRect(0, 0, width, height);

  // Draw Head String Line on the table
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;

  // Head String (Line on left quadrant)
  ctx.beginPath();
  ctx.moveTo(width * 0.25, 0);
  ctx.lineTo(width * 0.25, height);
  ctx.stroke();

  // Little head string dot
  ctx.beginPath();
  ctx.arc(width * 0.25, height * 0.5, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fill();

  // Draw Cushions (Beveled borders)
  ctx.fillStyle = cushionDark;
  
  // Custom design for cushion polygons to look 3D and fit pocket entries
  CUSHIONS.forEach(c => {
    ctx.beginPath();
    const bevel = 6;
    if (c.axis === 'y') {
      const y0 = c.val;
      const y1 = c.val === 0 ? bevel : TABLE_HEIGHT - bevel;
      ctx.moveTo(c.minX + bevel, y0);
      ctx.lineTo(c.maxX - bevel, y0);
      ctx.lineTo(c.maxX, y1);
      ctx.lineTo(c.minX, y1);
    } else {
      const x0 = c.val;
      const x1 = c.val === 0 ? bevel : TABLE_WIDTH - bevel;
      ctx.moveTo(x0, c.minY + bevel);
      ctx.lineTo(x0, c.maxY - bevel);
      ctx.lineTo(x1, c.maxY);
      ctx.lineTo(x1, c.minY);
    }
    ctx.fill();
  });

  // Draw pockets (Deep holes with gold/chrome ring rims)
  POCKETS.forEach(p => {
    // 1. Draw Pocket Rim
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)'; // Dark rim
    ctx.fill();
    
    // Shiny gold circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#D97706'; // Gold rim
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 2. Deep Black Hole
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#090D16';
    ctx.fill();

    // Shadowing inside the pocket
    const innerGrad = ctx.createRadialGradient(p.x, p.y, p.r * 0.4, p.x, p.y, p.r);
    innerGrad.addColorStop(0, 'rgba(0,0,0,0)');
    innerGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = innerGrad;
    ctx.fill();
  });
}

// Draw individual custom ball with 3D gloss effects
export function drawBall(ctx: CanvasRenderingContext2D, ball: Ball) {
  if (ball.isSunk) return;

  const radius = ball.radius * ball.sinkingProgress; // Shrunk visual if falling in

  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
  ctx.clip();

  // Base background fill
  ctx.fillStyle = ball.color;
  ctx.fill();

  // If Stripe: draw the white caps at left/right (or top/bottom) we draw background white, and a colored stripe
  if (ball.type === BallType.STRIPE) {
    ctx.fillStyle = '#FAFAF9'; // base white
    ctx.fillRect(ball.x - radius, ball.y - radius, radius * 2, radius * 2);

    // Draw stripe across center (width ~60% of vertical diameter)
    ctx.fillStyle = ball.color;
    ctx.fillRect(ball.x - radius, ball.y - radius * 0.55, radius * 2, radius * 1.1);
  }

  // Draw the small white center circle for numbers 1 to 15
  if (ball.type !== BallType.CUE) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = '#FAFAF9';
    ctx.fill();

    // Draw standard digit number
    ctx.fillStyle = '#1F2937';
    ctx.font = `bold ${Math.round(radius * 0.55)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ball.number.toString(), ball.x, ball.y + 0.5);
  } else {
    // Cue ball can have a tiny red/blue spot to assist tracking rotation spin (aesthetic)
    ctx.beginPath();
    ctx.arc(ball.x + radius * 0.2, ball.y - radius * 0.2, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#991B1B';
    ctx.fill();
  }

  // Draw 3D Spherical Shading Shadow Overlay
  const shadingGrad = ctx.createRadialGradient(
    ball.x - radius * 0.3,
    ball.y - radius * 0.3,
    0,
    ball.x,
    ball.y,
    radius
  );
  shadingGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  shadingGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  shadingGrad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = shadingGrad;
  ctx.fill();

  ctx.restore();

  // Beautiful subtle drop shadow on the felt cloth below the ball
  ctx.beginPath();
  ctx.ellipse(
    ball.x,
    ball.y + radius * 0.9,
    radius * 0.85,
    radius * 0.22,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
}

// Render dynamic guideline
export function drawGuidelines(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  angle: number,
  powerRatio: number
) {
  const cue = balls[0];
  if (cue.isSunk) return;

  const prediction = calculateAimGuideline(balls, angle);
  const cosAng = Math.cos(angle);
  const sinAng = Math.sin(angle);

  ctx.save();

  if (prediction) {
    // Draw line from cue center to point of collision
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(prediction.collisionX, prediction.collisionY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw phantom cue ball landing visual ring
    ctx.beginPath();
    ctx.arc(prediction.collisionX, prediction.collisionY, cue.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw split trajectory arrows
    // 1. Target Ball vector
    ctx.beginPath();
    ctx.moveTo(prediction.targetBall.x, prediction.targetBall.y);
    ctx.lineTo(
      prediction.targetBall.x + prediction.targetVx * 10,
      prediction.targetBall.y + prediction.targetVy * 10
    );
    ctx.strokeStyle = '#FBBF24'; // Yellow target path
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Small arrow tip for target ball
    const targetPathAng = Math.atan2(prediction.targetVy, prediction.targetVx);
    const arrowLen = 5;
    ctx.beginPath();
    ctx.moveTo(
      prediction.targetBall.x + prediction.targetVx * 10,
      prediction.targetBall.y + prediction.targetVy * 10
    );
    ctx.lineTo(
      prediction.targetBall.x + prediction.targetVx * 10 - arrowLen * Math.cos(targetPathAng - Math.PI / 6),
      prediction.targetBall.y + prediction.targetVy * 10 - arrowLen * Math.sin(targetPathAng - Math.PI / 6)
    );
    ctx.lineTo(
      prediction.targetBall.x + prediction.targetVx * 10 - arrowLen * Math.cos(targetPathAng + Math.PI / 6),
      prediction.targetBall.y + prediction.targetVy * 10 - arrowLen * Math.sin(targetPathAng + Math.PI / 6)
    );
    ctx.fillStyle = '#FBBF24';
    ctx.fill();

    // 2. Cue Ball rebound vector
    ctx.beginPath();
    ctx.moveTo(prediction.collisionX, prediction.collisionY);
    ctx.lineTo(
      prediction.collisionX + prediction.cueVx * 8,
      prediction.collisionY + prediction.cueVy * 8
    );
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; // White cue path
    ctx.lineWidth = 1.5;
    ctx.stroke();

  } else {
    // If no target collision, simply cast a line to cushions or table bounds
    let edgeX = cue.x + cosAng * 900;
    let edgeY = cue.y + sinAng * 900;

    // clip inside borders
    if (edgeX < 11) edgeX = 11;
    if (edgeX > TABLE_WIDTH - 11) edgeX = TABLE_WIDTH - 11;
    if (edgeY < 11) edgeY = 11;
    if (edgeY > TABLE_HEIGHT - 11) edgeY = TABLE_HEIGHT - 11;

    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(edgeX, edgeY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// Draw wooden cue stick at appropriate pullback spacing
export function drawCueStick(
  ctx: CanvasRenderingContext2D,
  balls: Ball[],
  angle: number,
  powerRatio: number
) {
  const cue = balls[0];
  if (cue.isSunk) return;

  const pullBackDist = 11 + powerRatio * 55; // visual pull-back width
  const cosAng = Math.cos(angle);
  const sinAng = Math.sin(angle);

  // Cue Stick dimensions
  const cueLength = 260;
  const tipWidth = 3;
  const buttWidth = 7.5;

  ctx.save();
  // Translate to white ball and spin stick in opposite direction
  ctx.translate(cue.x, cue.y);
  ctx.rotate(angle + Math.PI); // facing opposite direction

  // Create wood gradient for tactical cue stick representation
  const stickGrad = ctx.createLinearGradient(pullBackDist, 0, pullBackDist + cueLength, 0);
  stickGrad.addColorStop(0, '#FEF3C7'); // Ivory white plastic joint tip
  stickGrad.addColorStop(0.02, '#B45309'); // Amber wood shaft
  stickGrad.addColorStop(0.75, '#78350F'); // Dark walnut butt
  stickGrad.addColorStop(0.95, '#1F2937'); // Black rubber bumper end

  // Draw cue trapezoid
  ctx.beginPath();
  ctx.moveTo(pullBackDist, -tipWidth / 2);
  ctx.lineTo(pullBackDist + cueLength, -buttWidth / 2);
  ctx.lineTo(pullBackDist + cueLength, buttWidth / 2);
  ctx.lineTo(pullBackDist, tipWidth / 2);
  ctx.closePath();

  ctx.fillStyle = stickGrad;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 3;
  ctx.fill();

  ctx.restore();
}

/**
 * AI Tactics Engine
 * Evaluates possible shots, ranks them based on alignment and obstacle clearance,
 * and outputs the ideal angle/intensity.
 */
export interface AIShot {
  targetBall: Ball;
  selectedPocket: typeof POCKETS[0];
  angle: number;
  power: number;
  score: number;
}

export function calcBestAIShot(balls: Ball[], allowedType: BallType | null): AIShot | null {
  const cue = balls[0];
  if (cue.isSunk) return null;

  // 1. Identify which balls can be selected
  let targetBalls = balls.filter(b => {
    if (b.id === 0 || b.isSunk) return false;
    
    // If client is restricted to a pattern
    if (allowedType === BallType.SOLID) return b.type === BallType.SOLID;
    if (allowedType === BallType.STRIPE) return b.type === BallType.STRIPE;
    
    // If open table: can shoot Solids or Stripes, but not the 8-Ball
    if (allowedType === null) return b.type === BallType.SOLID || b.type === BallType.STRIPE;

    return false;
  });

  // If all player target balls are sunk, the AI is legally allowed to target and pocket the 8-ball
  if (targetBalls.length === 0) {
    const eightBall = balls.find(b => b.type === BallType.EIGHT && !b.isSunk);
    if (eightBall) targetBalls = [eightBall];
  }

  if (targetBalls.length === 0) return null;

  const validShots: AIShot[] = [];

  for (const b of targetBalls) {
    for (const pocket of POCKETS) {
      // Vector pocket to target ball
      const dxPocketTarget = b.x - pocket.x;
      const dyPocketTarget = b.y - pocket.y;
      const distPocketTarget = Math.hypot(dxPocketTarget, dyPocketTarget);

      if (distPocketTarget < 1) continue;

      // Contact Point: the opposite point in relation to pocket at distance 2 * Radius
      const contactDist = cue.radius + b.radius;
      const cpX = b.x + (dxPocketTarget / distPocketTarget) * contactDist;
      const cpY = b.y + (dyPocketTarget / distPocketTarget) * contactDist;

      // Cue position to Contact point
      const dxCueCP = cpX - cue.x;
      const dyCueCP = cpY - cue.y;
      const distCueCP = Math.hypot(dxCueCP, dyCueCP);

      if (distCueCP < 5) continue;

      const angle = Math.atan2(dyCueCP, dxCueCP);

      // Scoring factors:
      let score = 2000;

      // Factor A: Clean straight shot (alignment of cue-target with pocket-target)
      // Vector direction cue->CP
      const cueDirX = dxCueCP / distCueCP;
      const cueDirY = dyCueCP / distCueCP;

      // Vector target->pocket
      const tgtDirX = -dxPocketTarget / distPocketTarget;
      const tgtDirY = -dyPocketTarget / distPocketTarget;

      const alignment = cueDirX * tgtDirX + cueDirY * tgtDirY; // -1 to 1 dot product
      if (alignment < 0) {
        // Cut is over 90 degrees (impossible or backward cut)
        continue;
      }

      score += alignment * 1200; // Prefer straight alignment shots

      // Factor B: Distance of target to the pocket (shorter is easier)
      score -= distPocketTarget * 1.5;

      // Factor C: Distance of Cue to target (shorter is easier)
      score -= distCueCP * 0.5;

      // Factor D: Check obstacles! (If any ball collides with our paths, penalize heavily)
      let obstaclePenalty = 0;
      
      for (const other of balls) {
        if (other.isSunk || other.id === cue.id || other.id === b.id) continue;

        // Path 1 collision: Cue Ball to Contact point (represented by raycast check)
        const d1 = distToSegment(other.x, other.y, cue.x, cue.y, cpX, cpY);
        if (d1 < cue.radius + other.radius + 3) {
          obstaclePenalty += 1500; // high penalty
        }

        // Path 2 collision: Target to pocket
        const d2 = distToSegment(other.x, other.y, b.x, b.y, pocket.x, pocket.y);
        if (d2 < b.radius + other.radius + 3) {
          obstaclePenalty += 1200;
        }
      }

      score -= obstaclePenalty;

      // Power calculation: proportional to distance, capped appropriately
      const power = Math.max(2.5, Math.min(9.5, distCueCP * 0.015 + distPocketTarget * 0.008 + 2));

      validShots.push({
        targetBall: b,
        selectedPocket: pocket,
        angle,
        power,
        score
      });
    }
  }

  if (validShots.length === 0) return null;

  // Return highest score shot
  validShots.sort((x, y) => y.score - x.score);
  return validShots[0];
}

// Distance helper from point (px, py) to line segment (x1, y1) --- (x2, y2)
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}
