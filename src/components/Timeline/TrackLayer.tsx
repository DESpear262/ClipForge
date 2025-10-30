import React, { useMemo } from "react";
import { Group, Rect, Text } from "react-konva";
import type { TrackDef, TimelineItem } from "../../context/TimelineContext";

/**
 * TrackLayer renders a single timeline track row's items.
 *
 * Layering model note:
 * - This component returns a Konva Group only (no Layers) to keep the Stage
 *   layer count low for performance. The track background band is drawn by the
 *   parent `Timeline` inside the static (listening=false) layer.
 * - All interactive item shapes live inside the parent content layer.
 *
 * Responsibilities:
 * - Render each item as a draggable rectangle with label
 * - Forward drag events to parent for snapping and cross-track moves
 */
interface TrackLayerProps {
  track: TrackDef;
  items: TimelineItem[];
  y: number;
  height: number;
  width: number;
  pxPerSecond: number;
  /** Left-edge time offset in seconds for viewport panning */
  viewOffsetSec?: number;
  selectedItemId?: string;
  onItemDragMove: (id: string, absX: number, absY: number) => void;
  onItemDragEnd: (id: string, absX: number, absY: number) => void;
  onItemMouseDown?: (id: string) => void;
}

const TrackLayer: React.FC<TrackLayerProps> = ({
  track,
  items,
  y,
  height,
  width: _width,
  pxPerSecond,
  viewOffsetSec = 0,
  selectedItemId,
  onItemDragMove,
  onItemDragEnd,
  onItemMouseDown,
}) => {
  const itemShapes = useMemo(() => {
    return items.map((it) => {
      const x = (it.start - viewOffsetSec) * pxPerSecond;
      const w = Math.max(2, (it.end - it.start) * pxPerSecond);
      return { id: it.id, x, y: y + 4, width: w, height: Math.max(1, height - 8) };
    });
  }, [items, pxPerSecond, y, height, viewOffsetSec]);

  return (
    <Group>
      {itemShapes.map((shape) => (
        <Group
          key={shape.id}
          draggable
          x={shape.x}
          y={shape.y}
          onDragMove={(e) => {
            // Prevent bubbling to Stage so timeline gate drag/seek does not trigger while dragging items
            // Konva supports stopping propagation via cancelBubble
            // See: https://konvajs.org/docs/events/Binding_Events.html
            (e as any).cancelBubble = true;
            const abs = e.target.getAbsolutePosition();
            onItemDragMove(shape.id, abs.x, abs.y);
          }}
          onDragEnd={(e) => {
            // Stop bubbling so Stage-level mouse handlers don’t process this drag end
            (e as any).cancelBubble = true;
            const abs = e.target.getAbsolutePosition();
            onItemDragEnd(shape.id, abs.x, abs.y);
          }}
          onMouseDown={(e) => {
            // Ensure clicking an item only selects/moves the item and does not start gate movement
            (e as any).cancelBubble = true;
            onItemMouseDown?.(shape.id);
          }}
        >
          <Rect
            x={0}
            y={0}
            width={shape.width}
            height={shape.height}
            fill={selectedItemId === shape.id ? "#3b82f6" : "#4b5563"}
            opacity={selectedItemId === shape.id ? 0.85 : 0.9}
            cornerRadius={6}
          />
          <Text
            x={8}
            y={8}
            text={`${track.id}`}
            fontSize={12}
            fill="#e5e7eb"
          />
        </Group>
      ))}
    </Group>
  );
};

export default TrackLayer;


