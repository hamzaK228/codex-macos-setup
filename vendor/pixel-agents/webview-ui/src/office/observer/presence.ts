import { findPath } from '../layout/tileMap.js';
import type { Character, Seat, TileType } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';

export type PresenceMode = 'working' | 'waiting' | 'exiting' | 'absent';
type Tile = { col: number; row: number };
export interface ObserverPresence {
  mode: PresenceMode;
  resident: boolean;
  projectId: string;
  deskSeatId: string;
  waitingSeatId: string;
  target: Tile;
  path: Tile[];
  progress: number;
  elapsed: number;
  travelDuration: number;
  removed: boolean;
}
const characterPresence = new WeakMap<Character, ObserverPresence>();
export function registerObserverCharacter(ch: Character, presence: ObserverPresence): void { characterPresence.set(ch, presence); }
export function isObserverWaitingSeated(ch: Character): boolean {
  const presence = characterPresence.get(ch);
  return presence?.mode === 'waiting' && !presence.path.length && ch.tileCol === presence.target.col && ch.tileRow === presence.target.row;
}
export function presenceMode(status?: string): PresenceMode {
  if (status === 'working') return 'working';
  if (status === 'stopped' || status === 'ended' || status === 'interrupted') return 'exiting';
  if (status === 'disconnected') return 'absent';
  return 'waiting';
}

export function planPresencePath(ch: Character, presence: ObserverPresence, tileMap: TileType[][], blockedTiles: Set<string>): void {
  const blocked = new Set(blockedTiles);
  blocked.delete(`${ch.tileCol},${ch.tileRow}`);
  blocked.delete(`${presence.target.col},${presence.target.row}`);
  presence.path = findPath(ch.tileCol, ch.tileRow, presence.target.col, presence.target.row, tileMap, blocked);
  presence.progress = 0;
  presence.elapsed = 0;
  // Exit always completes in a bounded time, even from the farthest desk.
  presence.travelDuration = presence.mode === 'exiting' ? 2.4 : Math.max(0.15, presence.path.length * 0.09);
  ch.path = presence.path;
  ch.moveProgress = 0;
}

/** Observer animation never runs the NPC wander/type FSM. Native snapshots can
 * refresh tools and reports without taking ownership of spatial transitions. */
export function updateObserverPresence(ch: Character, presence: ObserverPresence, dt: number, seats: Map<string, Seat>): boolean {
  if (presence.removed || presence.mode === 'absent') return true;
  presence.elapsed += dt;
  ch.isActive = presence.mode === 'working';
  ch.matrixEffect = null;
  ch.path = presence.path;
  const seatId = presence.mode === 'working' ? presence.deskSeatId : presence.mode === 'waiting' ? presence.waitingSeatId : null;
  ch.seatId = seatId;
  if (presence.path.length > 0) {
    ch.state = CharacterState.WALK;
    const speed = Math.max(1, (presence.path.length + presence.progress) / Math.max(0.02, presence.travelDuration - presence.elapsed + dt));
    presence.progress += dt * speed;
    while (presence.progress >= 1 && presence.path.length) {
      const next = presence.path.shift()!;
      ch.dir = next.col > ch.tileCol ? Direction.RIGHT : next.col < ch.tileCol ? Direction.LEFT : next.row > ch.tileRow ? Direction.DOWN : Direction.UP;
      ch.tileCol = next.col; ch.tileRow = next.row;
      presence.progress -= 1;
    }
    const next = presence.path[0];
    if (next) ch.dir = next.col > ch.tileCol ? Direction.RIGHT : next.col < ch.tileCol ? Direction.LEFT : next.row > ch.tileRow ? Direction.DOWN : Direction.UP;
    ch.x = (ch.tileCol + 0.5 + (next ? (next.col - ch.tileCol) * presence.progress : 0)) * TILE_SIZE;
    ch.y = (ch.tileRow + 0.5 + (next ? (next.row - ch.tileRow) * presence.progress : 0)) * TILE_SIZE;
    ch.moveProgress = presence.progress;
    ch.frameTimer += dt;
    ch.frame = Math.floor(ch.frameTimer / 0.1) % 4;
  }
  if (!presence.path.length) {
    if (presence.mode === 'exiting') return true;
    const seat = seatId ? seats.get(seatId) : undefined;
    const arrived = ch.tileCol === presence.target.col && ch.tileRow === presence.target.row;
    ch.state = presence.mode === 'working' && arrived ? CharacterState.TYPE : CharacterState.IDLE;
    ch.dir = seat?.facingDir ?? Direction.DOWN;
    ch.frameTimer += dt;
    ch.frame = ch.state === CharacterState.TYPE ? Math.floor(ch.frameTimer / 0.3) % 2 : 0;
  }
  return presence.mode === 'exiting' && presence.elapsed >= 3;
}
