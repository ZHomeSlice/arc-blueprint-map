const radians = degrees => degrees * Math.PI / 180;

function lineCrosses(a, b, c, d) {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const first = turn(a, b, c) * turn(a, b, d);
  const second = turn(c, d, a) * turn(c, d, b);
  return first < -0.01 && second < -0.01;
}

export function crossingCount(groups, placements) {
  let crossings = 0;
  for (let first = 0; first < groups.length; first++) {
    for (let second = first + 1; second < groups.length; second++) {
      for (const firstOrigin of groups[first].origins) for (const secondOrigin of groups[second].origins) {
        if (lineCrosses(firstOrigin, placements[first], secondOrigin, placements[second])) crossings++;
      }
    }
  }
  return crossings;
}

function lineLength(groups, placements) {
  return groups.reduce((sum, group, index) => sum + group.origins.reduce((length, origin) =>
    length + Math.hypot(origin.x - placements[index].x, origin.y - placements[index].y), 0), 0);
}

function placeSide(groups, indices, side, viewport, anchor, placements) {
  if (!indices.length) return;
  indices.sort((first, second) => groups[first].center.y - groups[second].center.y);
  const count = indices.length;
  const angle = radians(count === 1 ? 0 : Math.min(60, 8 + (count - 1) * 16));
  const radius = Math.max(78, count === 1 ? 78 : (count - 1) * 35 / (2 * Math.sin(angle)));
  const spanY = radius * Math.sin(angle);
  const centerY = Math.max(20 + spanY, Math.min(viewport.height - 20 - spanY, anchor.y));
  const labelWidth = Math.max(...indices.map(index => groups[index].labelWidth));
  const centerX = side === 'right'
    ? Math.max(18 - radius * Math.cos(angle), Math.min(anchor.x, viewport.width - labelWidth - radius - 28))
    : Math.min(viewport.width - 18 + radius * Math.cos(angle), Math.max(anchor.x, labelWidth + radius + 28));
  for (const [slot, index] of indices.entries()) {
    const theta = count === 1 ? 0 : -angle + slot * 2 * angle / (count - 1);
    placements[index] = { x: centerX + (side === 'right' ? 1 : -1) * radius * Math.cos(theta),
      y: centerY + radius * Math.sin(theta), side };
  }
}

export function layoutSpiderGroups(groups, viewport, anchor) {
  if (!groups.length) return [];
  const rightCapacity = Math.min(8, Math.max(1, Math.floor((viewport.height - 40) / 35) + 1));
  const ordered = groups.map((_, index) => index).sort((first, second) => groups[second].center.x - groups[first].center.x);
  const right = ordered.slice(0, rightCapacity);
  const left = ordered.slice(rightCapacity);
  const placements = new Array(groups.length);
  placeSide(groups, right, 'right', viewport, anchor, placements);
  placeSide(groups, left, 'left', viewport, anchor, placements);

  // Swap assignments, including between sides, when that reduces crossings.
  // The number of right and left positions stays the same.
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let first = 0; first < groups.length; first++) {
      for (let second = first + 1; second < groups.length; second++) {
        const a = first, b = second;
        const currentCrossings = crossingCount(groups, placements);
        const currentLength = lineLength(groups, placements);
        [placements[a], placements[b]] = [placements[b], placements[a]];
        const nextCrossings = crossingCount(groups, placements);
        const nextLength = lineLength(groups, placements);
        if (nextCrossings < currentCrossings || (nextCrossings === currentCrossings && nextLength + 0.1 < currentLength)) changed = true;
        else [placements[a], placements[b]] = [placements[b], placements[a]];
      }
    }
    if (!changed) break;
  }
  return placements;
}
