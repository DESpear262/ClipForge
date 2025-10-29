import React, { useMemo } from "react";
import { Layer, Group, Rect, Text } from "react-konva";
import type { TrackDef, TimelineItem } from "../../context/TimelineContext";

/**
 * TrackLayer renders a single timeline track row and its items.
 *
 * Responsibilities:
 * - Draw track background band
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
  width,
  pxPerSecond,
  selectedItemId,
  onItemDragMove,
  onItemDragEnd,
  onItemMouseDown,
}) => {
  const itemShapes = useMemo(() => {
    return items.map((it) => {
      const x = it.start * pxPerSecond;
      const w = Math.max(2, (it.end - it.start) * pxPerSecond);
      return { id: it.id, x, y: y + 4, width: w, height: Math.max(1, height - 8) };
    });
  }, [items, pxPerSecond, y, height]);

  return (
    <>
      <Layer listening={false}>
        {/* Track background band */}
        <Rect x={0} y={y} width={width} height={height} fill="#111827" opacity={0.6} />
      </Layer>
      <Layer>
        <Group>
          {itemShapes.map((shape) => (
            <Group
              key={shape.id}
              draggable
              x={shape.x}
              y={shape.y}
              onDragMove={(e) => {
                const abs = e.target.getAbsolutePosition();
                onItemDragMove(shape.id, abs.x, abs.y);
              }}
              onDragEnd={(e) => {
                const abs = e.target.getAbsolutePosition();
                onItemDragEnd(shape.id, abs.x, abs.y);
              }}
              onMouseDown={() => onItemMouseDown?.(shape.id)}
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
      </Layer>
    </>
  );
};

export default TrackLayer;


