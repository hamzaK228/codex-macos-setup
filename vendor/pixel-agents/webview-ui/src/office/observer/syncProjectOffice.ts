import type { OfficeState } from '../engine/officeState.js';
import { CharacterState, TILE_SIZE } from '../types.js';
import { planPresencePath, presenceMode, registerObserverCharacter } from './presence.js';
import { isSpecialist, reconcileResidents } from './residents.js';
import { projectIdentity, type ProjectOffice, type ProjectRoomAgent } from './projectRooms.js';

/** Source snapshots own activity. This reconciler owns observer-only placement
 * and removal; removing a sprite never removes the source report/history. */
export function syncProjectOffice(os: OfficeState, office: ProjectOffice, agents: ProjectRoomAgent[]): void {
  const changed = os.getLayout() !== office.layout;
  const previous = new Map([...os.characters].map(([id, ch]) => [id, {
    seatId: ch.seatId, x: ch.x, y: ch.y, tileCol: ch.tileCol, tileRow: ch.tileRow,
    path: ch.path, moveProgress: ch.moveProgress, dir: ch.dir, state: ch.state,
  }]));
  if (changed) os.rebuildFromLayout(office.layout);
  os.observerResidents = reconcileResidents(os.observerResidents, agents);
  const rooms = new Map(office.rooms.map((room) => [room.id, room]));
  const ids = new Set(agents.map((agent) => agent.id));
  for (const [id] of os.observerPresence) if (!ids.has(id)) {
    os.characters.delete(id); os.observerPresence.delete(id); os.observerAgentRooms.delete(id);
  }
  // Reservations survive visual exits, giving a resumed agent its own desk.
  const reserved = new Set([...os.observerPresence.values()].map((presence) => presence.deskSeatId));
  for (const seat of os.seats.values()) seat.assigned = false;
  for (const agent of agents) {
    const room = rooms.get(projectIdentity(agent));
    if (!room) continue;
    let presence = os.observerPresence.get(agent.id);
    const resident = os.observerResidents.get(room.id) === agent.id;
    const sourceMode = presenceMode(agent.status);
    const mode = !resident && !isSpecialist(agent) ? 'absent' : resident && sourceMode === 'exiting' ? 'waiting' : sourceMode;
    const newProject = presence?.projectId !== room.id;
    if (!presence || newProject) {
      const deskSeatId = room.seatIds.find((id) => !reserved.has(id));
      if (!deskSeatId) continue;
      reserved.add(deskSeatId);
      presence = { mode, resident, projectId: room.id, deskSeatId, waitingSeatId: room.waitingSeatIds[room.seatIds.indexOf(deskSeatId)], target: room.exit, path: [], progress: 0, elapsed: 0, travelDuration: 0, removed: mode === 'exiting' || mode === 'absent' };
      os.observerPresence.set(agent.id, presence);
    }
    const previousBounds = os.observerAgentRooms.get(agent.id);
    if (changed || newProject || !previousBounds) os.observerAgentRooms.set(agent.id, { col: room.col + 1, row: room.row + 1, width: room.width - 2, height: room.height - 2, walkableTiles: os.walkableTiles.filter((tile) => tile.col > room.col && tile.col < room.col + room.width - 1 && tile.row > room.row && tile.row < room.row + room.height - 1) });
    const transition = presence.mode !== mode;
    presence.mode = mode;
    presence.resident = resident;
    if (mode === 'absent' || (presence.removed && mode === 'exiting')) {
      os.characters.delete(agent.id);
      presence.removed = true;
      if (os.selectedAgentId === agent.id) os.selectedAgentId = null;
      if (os.cameraFollowId === agent.id) os.cameraFollowId = null;
      continue;
    }
    let ch = os.characters.get(agent.id);
    const created = !ch;
    if (!ch) {
      os.addAgent(agent.id, undefined, undefined, presence.deskSeatId, true);
      ch = os.characters.get(agent.id);
    }
    if (!ch) continue;
    registerObserverCharacter(ch, presence);
    if (changed && previous.has(agent.id) && !newProject) {
      Object.assign(ch, previous.get(agent.id));
      const dc = previousBounds ? room.col + 1 - previousBounds.col : 0;
      const dr = previousBounds ? room.row + 1 - previousBounds.row : 0;
      if (dc || dr) {
        ch.tileCol += dc; ch.tileRow += dr;
        ch.x += dc * TILE_SIZE; ch.y += dr * TILE_SIZE;
        presence.path = presence.path.map((tile) => ({ col: tile.col + dc, row: tile.row + dr }));
        ch.path = presence.path;
      }
    }
    const seatId = mode === 'working' ? presence.deskSeatId : mode === 'waiting' ? presence.waitingSeatId : null;
    const seat = seatId ? os.seats.get(seatId) : undefined;
    const desk = os.seats.get(presence.deskSeatId);
    const lounge = os.seats.get(presence.waitingSeatId);
    if (desk) desk.assigned = true;
    if (lounge) lounge.assigned = true;
    ch.seatId = seatId; ch.isActive = mode === 'working'; ch.matrixEffect = null;
    if (transition || created || newProject || changed) {
      presence.removed = false;
      presence.target = seat ? { col: seat.seatCol, row: seat.seatRow } : room.exit;
      if (created || newProject) {
        const start = presence.elapsed > 0 ? { col: room.exit.col + (room.exit.col < room.col ? 1 : -1), row: room.exit.row } : presence.target;
        ch.tileCol = start.col; ch.tileRow = start.row;
        ch.x = (start.col + 0.5) * TILE_SIZE; ch.y = (start.row + 0.5) * TILE_SIZE;
      }
      // Preserve an in-flight path on harmless map expansion.
      if (!(changed && !transition && !created && !newProject)) planPresencePath(ch, presence, os.tileMap, os.blockedTiles);
      ch.state = presence.path.length ? CharacterState.WALK : mode === 'working' ? CharacterState.TYPE : CharacterState.IDLE;
      if (seat && !presence.path.length) ch.dir = seat.facingDir;
    }
  }
}
