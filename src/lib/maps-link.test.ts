import { describe, it, expect } from 'vitest';
import { parseMapsLink } from '@/components/expenses/location-field';

describe('parseMapsLink', () => {
  const url =
    'https://www.google.de/maps/place/White+Elephant+Thai+Restaurant+El-Gouna/@27.3963321,33.6732943,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d27.3963274!4d33.6758692!16s%2Fg%2F11cn5rnvcp?entry=ttu';

  it('reads name and the exact pin from a Google Maps place link', () => {
    expect(parseMapsLink(url)).toEqual({
      name: 'White Elephant Thai Restaurant El-Gouna',
      latitude: 27.3963274,
      longitude: 33.6758692,
    });
  });

  it('reads plain coordinates', () => {
    expect(parseMapsLink('27.3963, 33.6758')).toMatchObject({ latitude: 27.3963, longitude: 33.6758 });
  });

  it('ignores ordinary search text', () => {
    expect(parseMapsLink('White Elephant Thai Restaurant el gouna')).toBeNull();
    expect(parseMapsLink('https://example.com/page')).toBeNull();
  });
});
