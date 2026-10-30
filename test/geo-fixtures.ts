// GeoJSON order is [longitude, latitude]; rings are closed.
export const square = (minLon: number, minLat: number, size: number) => [
  [
    [minLon, minLat],
    [minLon + size, minLat],
    [minLon + size, minLat + size],
    [minLon, minLat + size],
    [minLon, minLat],
  ],
];

export const polygon = (coordinates: unknown) => ({
  type: 'Polygon',
  coordinates,
});
