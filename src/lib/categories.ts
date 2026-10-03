/** Emoji per expense category (matches the localized presets; unknown free-text categories get a tag). */
const CATEGORY_ICONS: Record<string, string> = {
  essen: '🍽️',
  food: '🍽️',
  getränke: '🍹',
  drinks: '🍹',
  unterkunft: '🏨',
  accommodation: '🏨',
  transport: '🚕',
  aktivitäten: '🏄',
  activities: '🏄',
  einkauf: '🛍️',
  shopping: '🛍️',
  sonstiges: '📌',
  other: '📌',
};

export function categoryIcon(category: string | null | undefined): string {
  return CATEGORY_ICONS[(category ?? '').trim().toLowerCase()] ?? '🏷️';
}

/**
 * OpenStreetMap filters for "places nearby" per category (Overpass QL tag filters).
 * Categories without an entry (e.g. free text) offer no nearby search.
 */
const NEARBY_FILTERS: Record<string, string[]> = {
  food: ['"amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"'],
  drinks: ['"amenity"~"^(bar|pub|cafe|biergarten)$"'],
  accommodation: ['"tourism"~"^(hotel|hostel|guest_house|apartment|resort|motel|chalet)$"'],
  transport: ['"amenity"~"^(taxi|fuel|car_rental|bus_station|ferry_terminal)$"', '"aeroway"="terminal"'],
  activities: [
    '"tourism"~"^(attraction|museum|viewpoint|theme_park|zoo|aquarium|gallery)$"',
    '"leisure"~"^(water_park|sports_centre|marina|fitness_centre)$"',
    '"sport"~"^(kitesurfing|surfing|diving|scuba_diving|swimming)$"',
    '"shop"="kite"',
  ],
  shopping: ['"shop"', '"amenity"="marketplace"'],
};

const ALIASES: Record<string, string> = {
  essen: 'food',
  getränke: 'drinks',
  unterkunft: 'accommodation',
  aktivitäten: 'activities',
  einkauf: 'shopping',
};

export function nearbyFilters(category: string | null | undefined): string[] | null {
  const key = (category ?? '').trim().toLowerCase();
  return NEARBY_FILTERS[ALIASES[key] ?? key] ?? null;
}
