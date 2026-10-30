import { ValidateBy, type ValidationOptions } from 'class-validator';

// Structural checks for GeoJSON Polygon coordinates. Geometric validity
// (self-intersection, overlapping rings) is checked later by PostGIS.
export function polygonCoordinatesError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return 'coordinates must be a non-empty array of linear rings';
  }
  for (const [ringIndex, ring] of value.entries()) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return `ring ${ringIndex} must have at least 4 positions`;
    }
    for (const position of ring) {
      if (!isValidPosition(position)) {
        return `ring ${ringIndex} contains an invalid [longitude, latitude] position`;
      }
    }
    const first = ring[0] as number[];
    const last = ring[ring.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return `ring ${ringIndex} must be closed (first and last positions equal)`;
    }
  }
  return null;
}

function isValidPosition(position: unknown): boolean {
  if (!Array.isArray(position) || position.length !== 2) return false;
  const [longitude, latitude] = position;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

export function IsPolygonCoordinates(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isPolygonCoordinates',
      validator: {
        validate: (value) => polygonCoordinatesError(value) === null,
        defaultMessage: (args) =>
          `${args?.property}: ${polygonCoordinatesError(args?.value)}`,
      },
    },
    options,
  );
}
