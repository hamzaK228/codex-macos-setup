import assert from 'node:assert/strict';

import { beforeAll, test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { ProjectRoomRegistry, UNKNOWN_PROJECT } from '../src/office/observer/projectRooms.js';
import { syncProjectOffice } from '../src/office/observer/syncProjectOffice.js';
import { CharacterState, TILE_SIZE, TileType } from '../src/office/types.js';

function agent(id: number, projectId?: string) {
  return { id, projectId, projectName: projectId, name: `Agent ${id}`, sourceSessionId: `${id}`, status: 'idle' as const, activeToolCount: 0, lastEventAt: 0, attribution: 'agent' };
}
beforeAll(() => {
  const definitions = [
    { id: 'DESK_FRONT', category: 'desks', footprintW: 3, footprintH: 2, backgroundTiles: 1, isDesk: true },
    { id: 'PC_FRONT_ON_1', category: 'electronics', footprintW: 1, footprintH: 2, backgroundTiles: 1, isDesk: false },
    { id: 'CUSHIONED_CHAIR_BACK', category: 'chairs', footprintW: 1, footprintH: 1, orientation: 'back', isDesk: false },
    { id: 'CUSHIONED_CHAIR_FRONT', category: 'chairs', footprintW: 1, footprintH: 1, orientation: 'front', isDesk: false },
    { id: 'COFFEE_TABLE', category: 'desks', footprintW: 2, footprintH: 2, isDesk: false },
    { id: 'PLANT', category: 'decor', footprintW: 1, footprintH: 2, isDesk: false },
  ];
  buildDynamicCatalog({ catalog: definitions.map((item) => ({ ...item, label: item.id, width: item.footprintW * 16, height: item.footprintH * 16 })), sprites: Object.fromEntries(definitions.map((item) => [item.id, [['black']]])) });
});

test('small project rooms provide six useful workstations and a compact separate lounge', () => {
  const office = new ProjectRoomRegistry().update([agent(1, 'small')]);
  const room = office.rooms[0];
  assert.equal(room.seatIds.length, 6);
  assert.equal(room.waitingSeatIds.length, 6);
  assert.equal(room.width, 32);
  assert.equal(room.height, 18);
  for (const uid of room.seatIds) {
    const desk = office.layout.furniture.find((item) => item.uid === `${uid}:desk`)!;
    assert.ok(desk.col + 3 < room.lounge.col);
  }
  for (const uid of room.waitingSeatIds) {
    const chair = office.layout.furniture.find((item) => item.uid === uid)!;
    assert.ok(chair.col >= room.lounge.col && chair.col < room.col + room.width - 1);
    assert.ok(chair.row > room.row && chair.row < room.row + room.height - 1);
  }
});

test('growing capacity preserves original desks and fits furniture inside the room', () => {
  const registry = new ProjectRoomRegistry();
  const small = registry.update([agent(1, 'growing')]);
  const original = small.layout.furniture.filter((item) => small.rooms[0].seatIds.some((uid) => item.uid === `${uid}:desk`));
  const larger = registry.update(Array.from({ length: 13 }, (_, i) => agent(i + 1, 'growing')));
  assert.equal(larger.rooms[0].seatIds.length, 15);
  for (const desk of original) assert.deepEqual(larger.layout.furniture.find((item) => item.uid === desk.uid), desk);
  const room = larger.rooms[0];
  for (const item of larger.layout.furniture) {
    assert.ok(item.col > room.col && item.col < room.col + room.width - 1);
    assert.ok(item.row > room.row && item.row < room.row + room.height - 1);
  }
});

test('source projects get separate walled rooms and unknown source gets an explicit fallback', () => {
  const { rooms, layout } = new ProjectRoomRegistry().update([agent(1, 'alpha'), agent(2, 'beta'), agent(3)]);
  assert.deepEqual(rooms.map((room) => room.id), ['alpha', 'beta', UNKNOWN_PROJECT]);
  for (const room of rooms) {
    assert.equal(layout.tiles[room.row * layout.cols + room.col], TileType.WALL);
    for (const id of room.seatIds) {
      const chair = layout.furniture.find((item) => item.uid === id)!;
      assert.equal(layout.areaTiles![chair.row * layout.cols + chair.col], room.id);
    }
    for (const other of rooms) if (other !== room) assert.ok(room.col + room.width <= other.col || other.col + other.width <= room.col || room.row + room.height <= other.row || other.row + other.height <= room.row);
  }
});

test('reordered status snapshots reuse the layout, new projects append without moving existing rooms', () => {
  const registry = new ProjectRoomRegistry();
  const initial = registry.update([agent(1, 'a'), agent(2, 'b')]);
  const reordered = [{ ...agent(2, 'b'), status: 'working' }, agent(1, 'a')];
  assert.equal(registry.update(reordered), initial);
  const expanded = registry.update([agent(3, 'c'), agent(2, 'b'), agent(1, 'a')]);
  assert.deepEqual(expanded.rooms.slice(0, 2), initial.rooms);
  assert.equal(expanded.rooms[2].id, 'c');
});

test('real agents including children stay in their own project seats and roam only within their room', () => {
  const registry = new ProjectRoomRegistry();
  const agents = [agent(1, 'a'), { ...agent(2, 'b'), parentAgentId: 1 }, { ...agent(3, 'a'), parentAgentId: 1 }];
  const office = registry.update(agents);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, agents);
  assert.equal(os.characters.size, agents.length);
  for (const source of agents) assert.equal(os.seatZone(os.characters.get(source.id)!.seatId!), source.projectId);
  for (let tick = 0; tick < 1200; tick++) os.update(0.1);
  for (const source of agents) {
    const ch = os.characters.get(source.id)!;
    const room = office.rooms.find((entry) => entry.id === source.projectId)!;
    assert.ok(ch.tileCol > room.col && ch.tileCol < room.col + room.width - 1);
    assert.ok(ch.tileRow > room.row && ch.tileRow < room.row + room.height - 1);
  }
});

test('adding a project preserves existing agent position, walk path, selection and camera follow', () => {
  const registry = new ProjectRoomRegistry();
  const agents = [agent(1, 'a')];
  const first = registry.update(agents);
  const os = new OfficeState(first.layout);
  syncProjectOffice(os, first, agents);
  const ch = os.characters.get(1)!;
  ch.state = CharacterState.WALK; ch.tileCol = 5; ch.tileRow = 8;
  ch.x = 5.5 * TILE_SIZE; ch.y = 8.5 * TILE_SIZE;
  ch.path = [{ col: 6, row: 8 }]; ch.moveProgress = 0.4;
  const expected = { x: ch.x, y: ch.y, seatId: ch.seatId, path: ch.path, moveProgress: ch.moveProgress };
  os.selectAndFollow(1);
  const next = [...agents, agent(2, 'b')];
  syncProjectOffice(os, registry.update(next), next);
  assert.deepEqual({ x: ch.x, y: ch.y, seatId: ch.seatId, path: ch.path, moveProgress: ch.moveProgress }, expected);
  assert.equal(os.selectedAgentId, 1); assert.equal(os.cameraFollowId, 1);
});

test('growing projects receive enough distinct seats and shrinking snapshots retain rooms', () => {
  const registry = new ProjectRoomRegistry();
  const agents = Array.from({ length: 53 }, (_, index) => ({ ...agent(index + 1, 'busy'), parentAgentId: 1000 }));
  const office = registry.update(agents);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, agents);
  assert.equal(new Set([...os.characters.values()].map((ch) => ch.seatId)).size, 53);
  for (const ch of os.characters.values()) assert.equal(os.seatZone(ch.seatId!), 'busy');
  assert.equal(registry.update([]), office);
});

test('observer manual seat and walk commands cannot move agents into another project; normal office commands still work', () => {
  const agents = [agent(1, 'a'), agent(2, 'b')];
  const office = new ProjectRoomRegistry().update(agents);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, agents);
  const ch = os.characters.get(1)!;
  const originalSeatId = ch.seatId!;
  const originalPath = ch.path;
  const otherRoom = office.rooms.find((room) => room.id === 'b')!;
  const targetSeat = otherRoom.seatIds.find((id) => !os.seats.get(id)!.assigned)!;
  os.reassignSeat(1, targetSeat);
  assert.equal(ch.seatId, originalSeatId);
  assert.equal(os.seats.get(originalSeatId)!.assigned, true);
  assert.equal(os.seats.get(targetSeat)!.assigned, false);
  const targetCol = otherRoom.col + 1;
  const targetRow = otherRoom.row + 3;
  assert.equal(os.walkToTile(1, targetCol, targetRow), false);
  assert.equal(ch.path, originalPath);
  // A regular office has no observer bounds and retains both manual commands.
  os.observerAgentRooms.clear();
  assert.equal(os.walkToTile(1, targetCol, targetRow), true);
  os.reassignSeat(1, targetSeat);
  assert.equal(ch.seatId, targetSeat);
  assert.equal(os.seats.get(targetSeat)!.assigned, true);
});

function tick(os: OfficeState, seconds = 8) {
  for (let time = 0; time < seconds; time += 0.05) os.update(0.05);
}

test('only working sources type at reserved desks; idle and permission wait motionless in the lounge', () => {
  const registry = new ProjectRoomRegistry();
  const sources = [{ ...agent(1, 'a'), status: 'working' }, { ...agent(2, 'a'), parentAgentId: 1 }, { ...agent(3, 'a'), parentAgentId: 1, status: 'permission' }];
  const office = registry.update(sources);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, sources);
  tick(os);
  const room = office.rooms[0];
  const worker = os.characters.get(1)!;
  assert.equal(worker.state, CharacterState.TYPE);
  assert.ok(room.seatIds.includes(worker.seatId!));
  for (const id of [2, 3]) {
    const waiting = os.characters.get(id)!;
    assert.equal(waiting.state, CharacterState.IDLE);
    assert.equal(waiting.isActive, false);
    assert.ok(room.waitingSeatIds.includes(waiting.seatId!));
    const position = [waiting.x, waiting.y];
    tick(os, 120);
    assert.deepEqual([waiting.x, waiting.y], position);
    assert.equal(waiting.state, CharacterState.IDLE);
  }
});

test('finished agents walk through their own doorway then disappear while source reports remain', () => {
  const registry = new ProjectRoomRegistry();
  const working = [{ ...agent(1, 'a'), parentAgentId: 1000, status: 'working', work: { done: '', current: 'Implement', next: '' } }];
  const office = registry.update(working);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, working);
  const originalSeat = os.characters.get(1)!.seatId;
  const stopped = [{ ...working[0], status: 'stopped', work: { done: 'Implemented', current: '', next: '' } }];
  syncProjectOffice(os, office, stopped);
  const departing = os.characters.get(1)!;
  assert.equal(departing.state, CharacterState.WALK);
  assert.deepEqual(departing.path.at(-1), office.rooms[0].exit);
  os.update(0.1);
  assert.ok(os.characters.has(1));
  // A native report refresh must not cancel or restart departure.
  const elapsed = os.observerPresence.get(1)!.elapsed;
  os.setAgentActive(1, false);
  os.removeAgent(1);
  syncProjectOffice(os, office, stopped);
  assert.equal(os.observerPresence.get(1)!.elapsed, elapsed);
  tick(os, 3.1);
  assert.equal(os.characters.has(1), false);
  assert.equal(stopped[0].work.done, 'Implemented');
  assert.equal(os.observerPresence.get(1)!.deskSeatId, originalSeat);
  syncProjectOffice(os, office, stopped);
  assert.equal(os.characters.has(1), false);
  syncProjectOffice(os, office, working);
  assert.ok(os.characters.has(1));
  tick(os);
  assert.equal(os.characters.get(1)!.seatId, originalSeat);
  assert.equal(os.characters.get(1)!.state, CharacterState.TYPE);
});

test('resuming during departure cancels removal and returns to the same desk', () => {
  const registry = new ProjectRoomRegistry();
  const working = [{ ...agent(1, 'a'), parentAgentId: 1000, status: 'working' }];
  const office = registry.update(working);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, working);
  const seatId = os.characters.get(1)!.seatId;
  syncProjectOffice(os, office, [{ ...working[0], status: 'ended' }]);
  os.update(0.5);
  syncProjectOffice(os, office, working);
  tick(os);
  assert.equal(os.characters.get(1)!.seatId, seatId);
  assert.equal(os.characters.get(1)!.state, CharacterState.TYPE);
});

test('historical terminal sessions never become idle NPCs; disconnected has no completion walk', () => {
  for (const status of ['stopped', 'ended', 'interrupted', 'disconnected']) {
    const sources = [{ ...agent(1, 'a'), parentAgentId: 1000, status }];
    const office = new ProjectRoomRegistry().update(sources);
    const os = new OfficeState(office.layout);
    // Native transport can materialize a source before spatial reconciliation.
    os.addAgent(1);
    syncProjectOffice(os, office, sources);
    assert.equal(os.characters.size, 0);
    tick(os);
    assert.equal(os.characters.size, 0);
  }
});

test('native report refreshes do not reset travel from the work desk into waiting', () => {
  const registry = new ProjectRoomRegistry();
  const working = [{ ...agent(1, 'a'), status: 'working' }];
  const office = registry.update(working);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, working);
  const waiting = [agent(1, 'a')];
  syncProjectOffice(os, office, waiting);
  for (let i = 0; i < 100; i++) {
    os.setAgentActive(1, false);
    syncProjectOffice(os, office, waiting);
    os.update(0.1);
  }
  assert.equal(os.characters.get(1)!.state, CharacterState.IDLE);
  assert.ok(office.rooms[0].waitingSeatIds.includes(os.characters.get(1)!.seatId!));
  assert.equal(os.characters.get(1)!.path.length, 0);
});

test('registered projects get truthful empty rooms without fabricated agents', () => {
  const registry = new ProjectRoomRegistry();
  const registered = [{ projectId: 'a', projectName: 'Alpha', status: 'no-events' as const }, { projectId: 'b', projectName: 'Beta', status: 'no-events' as const }];
  const office = registry.update([], registered);
  assert.deepEqual(office.rooms.map((room) => [room.id, room.status]), [['a', 'no-events'], ['b', 'no-events']]);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, []);
  assert.equal(os.characters.size, 0);
  const updated = registry.update([agent(1, 'b')], registered);
  assert.equal(updated.rooms[0].status, 'no-events');
  assert.equal(updated.rooms[1].status, 'events-received');
});

test('growing an upper project translates a lower room and its moving occupants together', () => {
  const registry = new ProjectRoomRegistry();
  const sources = [{ ...agent(1, 'a'), status: 'working' }, agent(2, 'b'), { ...agent(3, 'c'), status: 'working' }];
  const initial = registry.update(sources);
  const os = new OfficeState(initial.layout);
  syncProjectOffice(os, initial, sources);
  const waiting = sources.map((source) => source.id === 3 ? { ...source, status: 'idle' } : source);
  syncProjectOffice(os, initial, waiting);
  os.update(0.1);
  const before = { row: os.characters.get(3)!.tileRow, targetRow: os.observerPresence.get(3)!.target.row };
  const expanded = [...waiting, ...Array.from({ length: 35 }, (_, index) => agent(index + 4, 'a'))];
  const next = registry.update(expanded);
  syncProjectOffice(os, next, expanded);
  const delta = next.rooms[2].row - initial.rooms[2].row;
  assert.ok(delta > 0);
  assert.equal(os.characters.get(3)!.tileRow, before.row + delta);
  assert.equal(os.observerPresence.get(3)!.target.row, before.targetRow + delta);
  tick(os);
  const ch = os.characters.get(3)!;
  assert.equal(ch.tileRow, os.seats.get(ch.seatId!)!.seatRow);
  assert.equal(os.seatZone(ch.seatId!), 'c');
});

test('each project keeps exactly one genuine root resident despite multiple chat histories', () => {
  const registry = new ProjectRoomRegistry();
  const sources = [{ ...agent(1, 'a'), status: 'stopped', lastEventAt: 1 }, { ...agent(2, 'a'), status: 'working', lastEventAt: 2 }, { ...agent(3, 'a'), status: 'idle', lastEventAt: 3 }];
  const office = registry.update(sources);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, sources);
  assert.deepEqual([...os.characters.keys()], [2]);
  assert.equal(os.observerPresence.get(2)!.resident, true);
  assert.equal(os.observerPresence.get(1)!.resident, false);
  // A still-working coordinator is stable even when snapshots reorder and
  // another root produces a newer event.
  syncProjectOffice(os, office, [{ ...sources[2], status: 'working', lastEventAt: 4 }, sources[1], sources[0]]);
  assert.deepEqual([...os.characters.keys()], [2]);
  assert.equal(os.observerResidents.get('a'), 2);
  assert.deepEqual(sources.map((source) => source.status), ['stopped', 'working', 'idle']);
});

test('the resident remains in waiting after completion while real specialists leave', () => {
  const registry = new ProjectRoomRegistry();
  const sources = [{ ...agent(1, 'a'), status: 'working', lastEventAt: 1 }, { ...agent(2, 'a'), parentAgentId: 1, status: 'working', lastEventAt: 1 }];
  const office = registry.update(sources);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, sources);
  const finished = sources.map((source) => ({ ...source, status: 'stopped', lastEventAt: 2 }));
  syncProjectOffice(os, office, finished);
  tick(os, 10);
  assert.deepEqual([...os.characters.keys()], [1]);
  assert.equal(os.observerPresence.get(1)!.resident, true);
  assert.equal(os.observerPresence.get(1)!.mode, 'waiting');
  assert.equal(os.characters.get(1)!.isActive, false);
  assert.equal(os.characters.get(1)!.state, CharacterState.IDLE);
  assert.ok(office.rooms[0].waitingSeatIds.includes(os.characters.get(1)!.seatId!));
  assert.equal(finished[0].status, 'stopped');
  assert.equal(os.observerPresence.get(2)!.mode, 'exiting');
  assert.equal(os.observerPresence.get(2)!.resident, false);
  syncProjectOffice(os, office, finished);
  assert.deepEqual([...os.characters.keys()], [1]);
});

test('a later working root takes over an inactive coordinator without creating a second boss', () => {
  const registry = new ProjectRoomRegistry();
  const sources = [{ ...agent(1, 'a'), status: 'stopped', lastEventAt: 1 }, { ...agent(2, 'a'), status: 'idle', lastEventAt: 2 }];
  const office = registry.update(sources);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, sources);
  assert.deepEqual([...os.characters.keys()], [2]);
  syncProjectOffice(os, office, [{ ...sources[0], status: 'working', lastEventAt: 3 }, sources[1]]);
  assert.deepEqual([...os.characters.keys()], [1]);
  assert.equal(os.observerResidents.get('a'), 1);
  assert.equal(os.observerPresence.get(2)!.resident, false);
  assert.equal(os.observerPresence.get(2)!.mode, 'absent');
});

test('residency requires a real connected root and forgets removed sources', () => {
  const registry = new ProjectRoomRegistry();
  const projects = [{ projectId: 'a', projectName: 'Alpha', status: 'no-events' as const }];
  const office = registry.update([], projects);
  const os = new OfficeState(office.layout);
  syncProjectOffice(os, office, []);
  assert.equal(os.observerResidents.size, 0);
  assert.equal(os.characters.size, 0);
  syncProjectOffice(os, office, [{ ...agent(1, 'a'), status: 'stopped' }]);
  assert.equal(os.observerResidents.size, 1);
  assert.equal(os.characters.size, 1);
  syncProjectOffice(os, office, []);
  assert.equal(os.observerResidents.size, 0);
  assert.equal(os.observerPresence.size, 0);
  assert.equal(os.characters.size, 0);
  syncProjectOffice(os, office, [{ ...agent(1, 'a'), status: 'disconnected' }]);
  assert.equal(os.observerResidents.size, 0);
  assert.equal(os.characters.size, 0);
});
