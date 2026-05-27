/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Ball, BallType, GameMode } from '../types';
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  drawTableBackground,
  drawBall,
  drawGuidelines,
  drawCueStick,
  updatePhysics,
  calcBestAIShot,
  findSafeCueBallSpot
} from '../utils/poolEngine';
import { playStrikeSound } from '../utils/audio';
import { Play, RotateCcw, AlertCircle, Eye } from 'lucide-react';

interface PoolTableProps {
  balls: Ball[];
  setBalls: React.Dispatch<React.SetStateAction<Ball[]>>;
  mode: GameMode;
  currentPlayer: 1 | 2;
  allowedType: BallType | null;
  cueBallInHand: boolean;
  setCueBallInHand: (val: boolean) => void;
  onTurnFinished: (sunkThisTurn: Ball[], collidedFirstWith: number | null) => void;
  themeColor: 'green' | 'blue' | 'red' | 'dark';
  soundVolume: number;
}

export default function PoolTable({
  balls,
  setBalls,
  mode,
  currentPlayer,
  allowedType,
  cueBallInHand,
  setCueBallInHand,
  onTurnFinished,
  themeColor,
  soundVolume
}: PoolTableProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction States
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [cuePowerRatio, setCuePowerRatio] = useState<number>(0); // 0.0 to 1.0
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isDragAiming, setIsDragAiming] = useState<boolean>(false);
  const [isHandDragging, setIsHandDragging] = useState<boolean>(false);

  // Tracking shot information
  const firstCollisionRef = useRef<number | null>(null);
  const sunkThisTurnRef = useRef<Ball[]>([]);

  // AI Aiming / Shoot simulation states
  const [aiAimState, setAiAimState] = useState<{
    active: boolean;
    targetAngle: number;
    currentAngle: number;
    targetPower: number;
    currentPower: number;
    phase: 'aiming' | 'pulling' | 'releasing';
  }>({
    active: false,
    targetAngle: 0,
    currentAngle: 0,
    targetPower: 0,
    currentPower: 0,
    phase: 'aiming',
  });

  const isAITurn = mode === GameMode.VS_AI && currentPlayer === 2;

  // Render Frame function
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const frame = () => {
      // Clear whole area
      ctx.clearRect(-100, -100, canvas.width + 200, canvas.height + 200);

      // Save context state in normal table bounds
      ctx.save();
      ctx.translate(22, 22); // table offset frame margin 22px

      // 1. Draw table felt, borders, pockets, guides
      drawTableBackground(ctx, TABLE_WIDTH, TABLE_HEIGHT, themeColor);

      // 2. Physics ticking if active
      if (isSimulating) {
        const stillMoving = updatePhysics(balls, 0.024, 0.94, (sunkBall) => {
          // Inside a pocket Net
          // Register sunk ball
          const alreadyTracked = sunkThisTurnRef.current.some(b => b.id === sunkBall.id);
          if (!alreadyTracked) {
            sunkThisTurnRef.current.push(sunkBall);
          }
        });

        // Track first collision if cue is currently moving and intersects something
        const cue = balls[0];
        if (!stillMoving) {
          // Physics stopped rolling! Finish turn:
          setIsSimulating(false);
          const sunk = [...sunkThisTurnRef.current];
          const collisionFirst = firstCollisionRef.current;

          // Clear refs
          sunkThisTurnRef.current = [];
          firstCollisionRef.current = null;

          onTurnFinished(sunk, collisionFirst);
        } else {
          // Detect first ball to touch cue ball
          if (firstCollisionRef.current === null && (Math.abs(cue.vx) > 0.01 || Math.abs(cue.vy) > 0.01)) {
            // Find if overlapping any ball
            for (const b of balls) {
              if (b.id !== 0 && !b.isSunk) {
                const dist = Math.hypot(b.x - cue.x, b.y - cue.y);
                if (dist < (cue.radius + b.radius + 1.5)) {
                  firstCollisionRef.current = b.id;
                  break;
                }
              }
            }
          }
        }
      }

      // 3. Draw active balls
      balls.forEach(b => {
        drawBall(ctx, b);
      });

      // 4. Draw interactive overlay (Cues & Guides) if static
      if (!isSimulating && !isHandDragging) {
        if (isAITurn && aiAimState.active) {
          // AI visual cue drawing
          drawGuidelines(ctx, balls, aiAimState.currentAngle, aiAimState.currentPower / 10);
          drawCueStick(ctx, balls, aiAimState.currentAngle, aiAimState.currentPower / 10);
        } else if (!isAITurn && !cueBallInHand) {
          // Player manual cue drawing
          drawGuidelines(ctx, balls, aimAngle, cuePowerRatio);
          drawCueStick(ctx, balls, aimAngle, cuePowerRatio);
        }
      }

      // 5. Draw Head String boundary indicator specifically in ball-in-hand placement
      if (cueBallInHand && !isSimulating) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(4, 4, TABLE_WIDTH * 0.25 - 4, TABLE_HEIGHT - 8);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(239, 68, 68, 0.03)';
        ctx.fillRect(4, 4, TABLE_WIDTH * 0.25 - 4, TABLE_HEIGHT - 8);
      }

      ctx.restore();

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [balls, isSimulating, aimAngle, cuePowerRatio, cueBallInHand, isHandDragging, aiAimState, isAITurn, themeColor]);

  // AI Turn triggering & cycle handling
  useEffect(() => {
    if (isAITurn && !isSimulating && !aiAimState.active) {
      // Initiate AI plan
      const shot = calcBestAIShot(balls, allowedType);
      if (shot) {
        setAiAimState({
          active: true,
          targetAngle: shot.angle,
          currentAngle: aimAngle, // start visual slide from current aim
          targetPower: shot.power,
          currentPower: 0,
          phase: 'aiming',
        });
      } else {
        // Fallback: random nudge if stuck
        const randAngle = Math.random() * Math.PI * 2;
        setAiAimState({
          active: true,
          targetAngle: randAngle,
          currentAngle: aimAngle,
          targetPower: 4.5,
          currentPower: 0,
          phase: 'aiming',
        });
      }
    }
  }, [isAITurn, isSimulating]);

  // Step-by-step AI Aiming simulation loop
  useEffect(() => {
    if (!aiAimState.active) return;

    let timeoutId: any;
    
    const simulateAITurn = () => {
      setAiAimState(prev => {
        if (!prev.active) return prev;

        const updated = { ...prev };

        if (prev.phase === 'aiming') {
          // Rotate pointer
          let angleDiff = prev.targetAngle - prev.currentAngle;
          angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

          if (Math.abs(angleDiff) < 0.03) {
            updated.currentAngle = prev.targetAngle;
            updated.phase = 'pulling';
          } else {
            updated.currentAngle += Math.sign(angleDiff) * 0.04; // rotation speed
          }
        } else if (prev.phase === 'pulling') {
          // Slide pullback backwards
          if (prev.currentPower < prev.targetPower) {
            updated.currentPower += 0.2; // pull speed
          } else {
            updated.phase = 'releasing';
          }
        } else if (prev.phase === 'releasing') {
          // Shoot mechanics!
          triggerBallShot(prev.targetAngle, prev.targetPower);
          return {
            active: false,
            targetAngle: 0,
            currentAngle: prev.targetAngle,
            targetPower: 0,
            currentPower: 0,
            phase: 'aiming'
          };
        }

        return updated;
      });

      timeoutId = setTimeout(simulateAITurn, 20); // ticks
    };

    simulateAITurn();
    return () => clearTimeout(timeoutId);
  }, [aiAimState.active]);

  // Execute actual velocity impact to cue ball
  const triggerBallShot = (angle: number, power: number) => {
    if (isSimulating) return;

    // Reset collision lists
    firstCollisionRef.current = null;
    sunkThisTurnRef.current = [];

    // Apply impulse velocity to Cue Ball (index 0)
    setBalls(prev => {
      const copy = [...prev];
      const cue = { ...copy[0] };
      
      const vx = Math.cos(angle) * power;
      const vy = Math.sin(angle) * power;
      
      cue.vx = vx;
      cue.vy = vy;
      
      copy[0] = cue;
      return copy;
    });

    // Sound
    playStrikeSound(power / 10);

    // Enter rolling state
    setIsSimulating(true);
    setCuePowerRatio(0);
  };

  // Convert click/touch coordinates to Canvas coordinate frame
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    // Scale client coordinate matches
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * canvas.width - 22; // remove wood wood frame margins
    const y = ((clientY - rect.top) / rect.height) * canvas.height - 22;

    return { x, y };
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> & { touches?: undefined } | React.TouchEvent<HTMLCanvasElement>) => {
    if (isSimulating || isAITurn) return;

    const coords = getCanvasCoords(e);
    const cue = balls[0];

    // Check click near Cue Ball to pick up or click inside allowed zone to place (In-hand drag placement)
    if (cueBallInHand) {
      const buffer = cue.radius + 2;
      // If clicked inside the allowed left quadrant of the table (D-zone/kitchen)
      if (coords.x >= 0 && coords.x <= TABLE_WIDTH * 0.25) {
        let targetX = Math.max(buffer, Math.min(TABLE_WIDTH * 0.25 - buffer, coords.x));
        let targetY = Math.max(buffer, Math.min(TABLE_HEIGHT - buffer, coords.y));

        const overlaps = balls.some(b => {
          if (b.id === 0 || b.isSunk) return false;
          return Math.hypot(b.x - targetX, b.y - targetY) < (b.radius + cue.radius + 3);
        });

        if (!overlaps) {
          setBalls(prev => {
            const list = [...prev];
            list[0] = { ...list[0], x: targetX, y: targetY };
            return list;
          });
        }
        setIsHandDragging(true);
      } else {
        const dist = Math.hypot(coords.x - cue.x, coords.y - cue.y);
        if (dist < cue.radius + 15) {
          setIsHandDragging(true);
        }
      }
      return;
    }

    // Checking if click is near Cue Ball for aiming-pullback sequence
    const distToCue = Math.hypot(coords.x - cue.x, coords.y - cue.y);
    if (distToCue < cue.radius + 30) {
      setIsDragAiming(true);
    } else {
      // Just adjust the angle pointing towards clicked spot
      const angle = Math.atan2(coords.y - cue.y, coords.x - cue.x);
      setAimAngle(angle);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isSimulating || isAITurn) return;

    const coords = getCanvasCoords(e);
    const cue = balls[0];

    // Cue ball in hand dragging
    if (cueBallInHand && isHandDragging) {
      // Bound inside the white Head String line (x: index 0 to TABLE_WIDTH * 0.25)
      const buffer = cue.radius + 2;
      let targetX = Math.max(buffer, Math.min(TABLE_WIDTH * 0.25 - buffer, coords.x));
      let targetY = Math.max(buffer, Math.min(TABLE_HEIGHT - buffer, coords.y));

      // Overlap checks to avoid embedding on other active table balls
      const overlaps = balls.some(b => {
        if (b.id === 0 || b.isSunk) return false;
        return Math.hypot(b.x - targetX, b.y - targetY) < (b.radius + cue.radius + 3);
      });

      if (!overlaps) {
        setBalls(prev => {
          const list = [...prev];
          list[0] = { ...list[0], x: targetX, y: targetY };
          return list;
        });
      }
      return;
    }

    // Drag-aiming pullback sliding intensity
    if (isDragAiming) {
      // Calculate pull vector away from Cue ball center
      const diffX = coords.x - cue.x;
      const diffY = coords.y - cue.y;
      
      const distance = Math.hypot(diffX, diffY);
      
      // Pull angle is opposite to drag
      const angle = Math.atan2(-diffY, -diffX);
      setAimAngle(angle);

      // Power scales from 15px out to 130px drag back
      const ratio = Math.max(0, Math.min(1.0, (distance - 10) / 110));
      setCuePowerRatio(ratio);
    } else {
      // Hover/drag anywhere rotates the cue too
      if ('touches' in e === false && e.buttons === 1) {
        const angle = Math.atan2(coords.y - cue.y, coords.x - cue.x);
        setAimAngle(angle);
      }
    }
  };

  const handleMouseUp = () => {
    if (isHandDragging) {
      setIsHandDragging(false);
      return;
    }

    if (isDragAiming) {
      setIsDragAiming(false);
      // Trigger shot if power ratio is high enough
      if (cuePowerRatio > 0.04) {
        const shotPower = 1.0 + cuePowerRatio * 9.0; // scale power 1 to 10
        triggerBallShot(aimAngle, shotPower);
      } else {
        setCuePowerRatio(0);
      }
    }
  };

  // Accessibility Control Panel inputs
  const handleAngleSlider = (val: number) => {
    // degrees to radians
    setAimAngle((val * Math.PI) / 180);
  };

  const handleManualShoot = () => {
    if (cuePowerRatio <= 0.04) {
      setCuePowerRatio(0.3); // default kick of 30% power if not preset
    }
    const shotPower = 1.0 + (cuePowerRatio || 0.3) * 9.0;
    triggerBallShot(aimAngle, shotPower);
  };

  return (
    <div id="canvas-game-viewport" className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
      
      {/* 2D Canvas Table Area with border woods */}
      <div className="relative w-full aspect-[2/1] rounded-2xl bg-zinc-950 p-1 md:p-3 select-none flex items-center justify-center shadow-2xl border border-zinc-800">
        <canvas
          id="pool-game-canvas"
          ref={canvasRef}
          width={TABLE_WIDTH + 44} // Width + Wood frame borders
          height={TABLE_HEIGHT + 44} // Height + Wood frame borders
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          className="w-full h-auto cursor-crosshair rounded-xl block touch-none"
        />

        {/* Informative Floating Overlays */}
        {cueBallInHand && !isSimulating && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-rose-950/95 backdrop-blur border border-rose-500/30 text-rose-200 px-5 py-2.5 rounded-full flex flex-col sm:flex-row items-center gap-3 text-xs font-medium md:text-sm shadow-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Bola na mão! Arraste a bola branca para o lado esquerdo</span>
            </div>
          </div>
        )}

        {/* Dynamic Glowing Power Bar HUD */}
        {!isSimulating && !isAITurn && !cueBallInHand && (
          <div className="absolute bottom-5 left-5 bg-zinc-950/92 backdrop-blur border border-zinc-800 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xl max-w-xs w-52 md:w-60">
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex justify-between text-[11px] font-bold text-zinc-300">
                <span className="uppercase tracking-wider">FORÇA</span>
                <span className="font-mono text-emerald-400">{Math.round(cuePowerRatio * 100)}%</span>
              </div>
              <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 h-full rounded-full transition-all duration-75"
                  style={{ width: `${cuePowerRatio * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Floating action button to confirm ball-in-hand placement */}
        {!isSimulating && !isAITurn && cueBallInHand && (
          <button
            onClick={() => setCueBallInHand(false)}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-6 py-2.5 rounded-full flex items-center gap-2 text-xs md:text-sm shadow-2xl transition-all hover:scale-105 active:scale-95 duration-100 cursor-pointer border border-amber-300/30"
          >
            CONFIRMAR POSIÇÃO
          </button>
        )}

        {isSimulating && (
          <div className="absolute bottom-5 right-5 bg-zinc-900/85 backdrop-blur border border-zinc-700/50 text-zinc-300 px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-mono tracking-wider shadow">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>SIMULANDO FÍSICA CLÁSSICA...</span>
          </div>
        )}

        {isAITurn && !isSimulating && (
          <div className="absolute top-5 right-5 bg-indigo-950/92 backdrop-blur border border-indigo-500/30 text-indigo-200 px-4 py-2 rounded-full flex items-center gap-2 text-xs md:text-sm font-medium shadow-lg">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </span>
            <span>Computador está calculando e jogando...</span>
          </div>
        )}
      </div>

      {/* Cue Ball In-Hand Placement confirmation bottom block bar */}
      {!isSimulating && !isAITurn && cueBallInHand && (
        <div id="table-placement-controls" className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl mt-4 p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-300 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Posicione a bola branca à esquerda e confirme para preparar a tacada.</span>
          </div>
          <button
            id="btn-confirm-position"
            onClick={() => setCueBallInHand(false)}
            className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 rounded-lg font-bold text-sm shadow-lg shadow-amber-950/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            CONFIRMAR POSIÇÃO
          </button>
        </div>
      )}

      {/* Manual Fine-tuning Panel (Accessible sliders, especially handy for precise aiming!) */}
      {!isSimulating && !isAITurn && !cueBallInHand && (
        <div id="table-accessible-controls" className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl mt-4 p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          
          {/* Aim Angle slider */}
          <div className="w-full md:w-5/12 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-zinc-500" /> Ajustar Ângulo fino</span>
              <span className="font-mono text-amber-500">{Math.round((aimAngle * 180) / Math.PI)}°</span>
            </div>
            <input
              id="slider-angle"
              type="range"
              min="-180"
              max="180"
              value={Math.round((aimAngle * 180) / Math.PI)}
              onChange={(e) => handleAngleSlider(Number(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-850 rounded-lg h-1.5 cursor-pointer appearance-none"
            />
          </div>

          {/* Shot Power slider */}
          <div className="w-full md:w-4/12 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span>Força da Tacada</span>
              <span className="font-mono text-emerald-400">{Math.round(cuePowerRatio * 100)}%</span>
            </div>
            <input
              id="slider-power"
              type="range"
              min="2"
              max="100"
              value={Math.round(cuePowerRatio * 100)}
              onChange={(e) => setCuePowerRatio(Number(e.target.value) / 100)}
              className="w-full accent-emerald-500 bg-zinc-850 rounded-lg h-1.5 cursor-pointer appearance-none"
            />
          </div>

          {/* Shoot Button */}
          <button
            id="btn-shoot-action"
            onClick={handleManualShoot}
            disabled={isSimulating}
            className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 active:scale-[0.98] transition-all shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>DAR TACADA</span>
          </button>
        </div>
      )}

      {/* Manual Cue Stick Power Indicator Legend */}
      {!isSimulating && !isAITurn && !cueBallInHand && (
        <p className="text-zinc-500 text-[11px] mt-2 text-center leading-relaxed">
          💡 <strong>Dica de controle:</strong> Clique no feltro para mirar, ou <strong>arraste o taco do meio da bola branca</strong> para dar impulso e ajustar a força com precisão antes de soltar!
        </p>
      )}
    </div>
  );
}
