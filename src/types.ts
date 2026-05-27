/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum GameMode {
  PRACTICE = 'PRACTICE',
  TWO_PLAYERS = 'TWO_PLAYERS',
  VS_AI = 'VS_AI',
}

export enum BallType {
  CUE = 'CUE',       // White ball
  SOLID = 'SOLID',   // Ball numbers 1-7
  EIGHT = 'EIGHT',   // Ball number 8
  STRIPE = 'STRIPE', // Ball numbers 9-15
}

export interface Ball {
  id: number;
  number: number;
  type: BallType;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isSunk: boolean;
  sinkingProgress: number; // For sinking animation (1 to 0 scale)
}

export interface Player {
  id: 1 | 2;
  name: string;
  ballType: BallType | null; // Sólidas (Solid) or Listradas (Stripe)
  sunkCount: number;
  isWinner: boolean;
}

export interface GameLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface PoolConfig {
  bgColor: 'green' | 'blue' | 'red' | 'dark';
  cuePowerMax: number;
  friction: number; // Rolling friction
  elasticity: number; // Ball and wall bounce coefficient
  soundVolume: number;
}
