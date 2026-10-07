// garment_type in the database isn't consistent ("T-shirt" vs "t-shirt",
// "hoodie" vs "pullover hoodie"), so group it into a few shopper-friendly
// categories. Order matters: e.g. "quarter-zip pullover sweatshirt" must hit
// Quarter-Zips before anything else.

export const CATEGORIES = [
  'Hoodies',
  'Crewnecks',
  'T-Shirts',
  'Quarter-Zips',
  'Jackets & Fleece',
  'Long Sleeve',
] as const

export type Category = (typeof CATEGORIES)[number] | 'Other'

export function categoryOf(garmentType: string): Category {
  const g = garmentType.toLowerCase()
  if (g.includes('quarter-zip')) return 'Quarter-Zips'
  if (g.includes('hood')) return 'Hoodies'
  if (g.includes('jacket')) return 'Jackets & Fleece'
  if (g.includes('t-shirt')) return 'T-Shirts'
  if (g.includes('long-sleeve')) return 'Long Sleeve'
  if (g.includes('crewneck') || g.includes('mockneck')) return 'Crewnecks'
  return 'Other'
}
