import { useObserverOverlayFrame } from '../../hooks/useObserverOverlayFrame.js';

import type { OfficeState } from '../engine/officeState.js';
import { overlayProjection } from '../projection.js';
import { TILE_SIZE } from '../types.js';
import type { ProjectRoom } from './projectRooms.js';

export function ProjectRoomLabels({ rooms, officeState, containerRef, zoom, panRef }: {
  rooms: ProjectRoom[]; officeState: OfficeState; containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number; panRef: React.RefObject<{ x: number; y: number }>;
}) {
  useObserverOverlayFrame();
  const element = containerRef.current;
  if (!element) return null;
  const dpr = window.devicePixelRatio || 1;
  const projection = overlayProjection(officeState.getLayout(), element.getBoundingClientRect(), zoom, panRef.current, dpr);
  return <div className="observer-room-labels" aria-hidden="true">{rooms.map((room) =>
    <div key={room.id} className="observer-room-label" style={{
      left: projection.toScreenX((room.col + room.width / 2) * TILE_SIZE),
      top: projection.toScreenY((room.row + 1.5) * TILE_SIZE),
      maxWidth: Math.max(64, (room.width - 2) * TILE_SIZE * zoom / dpr), borderColor: room.color,
    }}>{room.name}{room.status === 'no-events' ? ' · Ожидает подключения' : ''}</div>,
  )}{rooms.map((room) => <div key={`${room.id}:lounge`} className="observer-room-label" style={{
    left: projection.toScreenX((room.lounge.col + room.lounge.width / 2) * TILE_SIZE),
    top: projection.toScreenY((room.row + 4.5) * TILE_SIZE),
    maxWidth: Math.max(48, room.lounge.width * TILE_SIZE * zoom / dpr),
    borderColor: '#b98b59', fontSize: '10px',
  }}>Ожидание</div>)}</div>;
}
