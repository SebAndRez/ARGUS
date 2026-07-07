/**
 * Decodificador de polylines codificadas (Google/Valhalla). Sin dependencia
 * externa: Valhalla usa precision 6, Google Directions usa precision 5.
 */
export function decodePolyline(encoded: string, precision = 5): Array<[number, number]> {
  const factor = 10 ** precision;
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}
