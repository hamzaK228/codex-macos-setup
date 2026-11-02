import { AREA_DEFAULT_COLORS } from '../../constants.js';
import type { OfficeLayout } from '../types.js';
import { TileType } from '../types.js';

export const UNKNOWN_PROJECT = 'observer:unknown';
const WIDTH = 32;
const BASE_HEIGHT = 18;
const DESK_COLUMNS = 3;
const MIN_DESK_ROWS = 2;
const LOUNGE_COL = 22;
const GAP = 3;
const COLORS = AREA_DEFAULT_COLORS;
export interface ProjectRoomAgent { id: number; projectId?: string; projectName?: string; status?: string; activeToolCount?: number; parentAgentId?: number; lastEventAt?: number | string }
export interface RegisteredProjectRoom { projectId: string; projectName: string; status?: 'no-events' | 'events-received' }
export interface ProjectRoom {
  id: string; name: string; col: number; row: number; width: number; height: number;
  status: 'no-events' | 'events-received';
  color: string; seatIds: string[]; waitingSeatIds: string[];
  lounge: { col: number; row: number; width: number; height: number };
  exit: { col: number; row: number };
}
export interface ProjectOffice { layout: OfficeLayout; rooms: ProjectRoom[] }
export function projectIdentity(agent: Pick<ProjectRoomAgent, 'projectId'>): string {
  return agent.projectId?.trim() || UNKNOWN_PROJECT;
}

/** Append-only project order avoids moving existing rooms when snapshots reorder.
 * The generated layout is ephemeral: never pass it to layout persistence. */
export class ProjectRoomRegistry {
  private projects = new Map<string, { name: string; deskRows: number; status: 'no-events' | 'events-received' }>();
  private cached: ProjectOffice | null = null;
  update(agents: ProjectRoomAgent[], projects: RegisteredProjectRoom[] = []): ProjectOffice {
    const counts = new Map<string, number>();
    let changed = !this.cached;
    for (const source of projects) {
      if (!source.projectId.trim()) continue;
      const current = this.projects.get(source.projectId);
      const status = agents.some((agent) => projectIdentity(agent) === source.projectId) ? 'events-received' : source.status ?? 'no-events';
      if (!current) { this.projects.set(source.projectId, { name: source.projectName, deskRows: MIN_DESK_ROWS, status }); changed = true; }
      else if (current.name !== source.projectName || current.status !== status) { current.name = source.projectName; current.status = status; changed = true; }
    }
    for (const agent of agents) {
      const id = projectIdentity(agent);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      const name = agent.projectName?.trim() || (id === UNKNOWN_PROJECT ? 'Проект не указан' : id);
      const current = this.projects.get(id);
      if (!current) { this.projects.set(id, { name, deskRows: MIN_DESK_ROWS, status: 'events-received' }); changed = true; }
      else if (current.name !== name || current.status !== 'events-received') { current.name = name; current.status = 'events-received'; changed = true; }
    }
    for (const [id, count] of counts) {
      const project = this.projects.get(id)!;
      const rows = Math.max(MIN_DESK_ROWS, Math.ceil(count / DESK_COLUMNS));
      if (rows > project.deskRows) { project.deskRows = rows; changed = true; }
    }
    if (!changed && this.cached) return this.cached;
    const entries = [...this.projects];
    const columns = Math.min(2, Math.max(1, entries.length));
    const heights: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const band = Math.floor(i / 2);
      heights[band] = Math.max(heights[band] ?? BASE_HEIGHT, entries[i][1].deskRows * 5 + 8);
    }
    const rooms: ProjectRoom[] = entries.map(([id, project], i) => ({
      id, name: project.name, status: project.status, col: 1 + (i % 2) * (WIDTH + GAP),
      row: 1 + heights.slice(0, Math.floor(i / 2)).reduce((a, h) => a + h + GAP, 0),
      width: WIDTH, height: heights[Math.floor(i / 2)], color: COLORS[i % COLORS.length],
      seatIds: Array.from({ length: project.deskRows * DESK_COLUMNS }, (_, n) => `observer:${id}:seat:${n}`),
      waitingSeatIds: Array.from({ length: project.deskRows * DESK_COLUMNS }, (_, n) => `observer:${id}:waiting:${n}`),
      lounge: { col: 1 + (i % 2) * (WIDTH + GAP) + LOUNGE_COL, row: 1 + heights.slice(0, Math.floor(i / 2)).reduce((a, h) => a + h + GAP, 0) + 1, width: WIDTH - LOUNGE_COL - 1, height: heights[Math.floor(i / 2)] - 2 },
      exit: { col: 1 + (i % 2) * (WIDTH + GAP) + (i % 2 === 0 ? WIDTH : -1), row: 1 + heights.slice(0, Math.floor(i / 2)).reduce((a, h) => a + h + GAP, 0) + 3 },
    }));
    const cols = columns * WIDTH + (columns - 1) * GAP + 2;
    const rows = Math.max(BASE_HEIGHT + 2, heights.reduce((a, h) => a + h + GAP, 0) - GAP + 2);
    const layout: OfficeLayout = {
      version: 1, cols, rows, tiles: Array(cols * rows).fill(TileType.VOID), furniture: [],
      tileColors: Array(cols * rows).fill(null), areas: [], areaTiles: Array(cols * rows).fill(null), pets: [],
    };
    // A continuous central corridor joins project rooms, each with its own door.
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      layout.tiles[r * cols + c] = TileType.FLOOR_2;
      layout.tileColors![r * cols + c] = { h: 30, s: 24, b: -18, c: -10 };
    }
    rooms.forEach((room, i) => {
      layout.areas!.push({ label: room.id, color: room.color });
      for (let y = 0; y < room.height; y++) for (let x = 0; x < room.width; x++) {
        const index = (room.row + y) * cols + room.col + x;
        const wall = y === 0 || y === room.height - 1 || x === 0 || x === room.width - 1;
        layout.tiles[index] = wall ? TileType.WALL : TileType.FLOOR_7;
        layout.tileColors![index] = wall ? { h: 218, s: 28, b: -34, c: 10 } : { h: [32, 145, 210, 290, 48][i % 5], s: 32, b: 8, c: -12 };
        if (!wall) layout.areaTiles![index] = room.id;
      }
      const doorCol = room.col + (i % 2 === 0 ? room.width - 1 : 0);
      for (let y = 3; y <= 4; y++) layout.tiles[(room.row + y) * cols + doorCol] = TileType.FLOOR_2;
      layout.tiles[room.exit.row * cols + room.exit.col] = TileType.FLOOR_2;
      room.seatIds.forEach((uid, n) => {
        const col = room.col + 2 + n % DESK_COLUMNS * 6;
        const row = room.row + 4 + Math.floor(n / DESK_COLUMNS) * 5;
        layout.furniture.push(
          { uid: `${uid}:desk`, type: 'DESK_FRONT', col, row },
          { uid: `${uid}:pc`, type: 'PC_FRONT_ON_1', col: col + 1, row },
          { uid, type: 'CUSHIONED_CHAIR_BACK', col: col + 1, row: row + 2 },
        );
      });
      // A separate warm lounge has real chairs but no desks or computers.
      for (let y = 1; y < room.height - 1; y++) for (let x = LOUNGE_COL; x < room.width - 1; x++) {
        layout.tiles[(room.row + y) * cols + room.col + x] = TileType.FLOOR_2;
        layout.tileColors![(room.row + y) * cols + room.col + x] = { h: 31, s: 45, b: 14, c: -8 };
      }
      room.waitingSeatIds.forEach((uid, n) => layout.furniture.push({ uid, type: 'CUSHIONED_CHAIR_FRONT', col: room.col + LOUNGE_COL + 1 + n % DESK_COLUMNS * 3, row: room.row + 6 + Math.floor(n / DESK_COLUMNS) * 2 }));
      layout.furniture.push(
        { uid: `observer:${room.id}:coffee-table`, type: 'COFFEE_TABLE', col: room.col + LOUNGE_COL + 2, row: room.row + 1 },
        { uid: `observer:${room.id}:lounge-plant`, type: 'PLANT', col: room.col + WIDTH - 3, row: room.row + 1 },
      );
      layout.furniture.push({ uid: `observer:${room.id}:plant`, type: 'PLANT', col: room.col + 1, row: room.row + 1 });
    });
    this.cached = { layout, rooms };
    return this.cached;
  }
}
