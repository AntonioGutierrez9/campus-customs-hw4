// Curated collections for the home page, defined by rules on real catalogue
// fields (product names), not hand-picked product lists. Each one also works
// as a filter on the Products page: /products?collection=game-day

import type { CardProduct } from './api'

const RESIDENTIAL_COLLEGES = [
  'benjamin franklin', 'berkeley', 'branford', 'davenport', 'ezra stiles', 'grace hopper',
  'jonathan edwards', 'morse', 'pauli murray', 'pierson', 'saybrook', 'silliman',
  'timothy dwight', 'trumbull',
]

const GAME_DAY_WORDS = [
  'football', 'hockey', 'baseball', 'basketball', 'soccer', 'lacrosse', 'tennis', 'squash', 'golf',
  'crew', 'sailing', 'fencing', 'diving', 'swimming', 'volleyball', 'track', 'harvard', 'bowl', 'sports',
]

const CLASSIC_WORDS = ['big yale', 'boola', 'reverse weave', 'vintage', 'arched yale', 'felt y', 'yale bowl']

const hasWord = (name: string, word: string) => new RegExp(`\\b${word}\\b`).test(name.toLowerCase())

export interface Collection {
  id: string
  title: string
  kicker: string
  blurb: string
  matches: (p: CardProduct) => boolean
}

export const COLLECTIONS: Collection[] = [
  {
    id: 'classics',
    title: 'Yale Classics',
    kicker: 'Heritage pieces',
    blurb: 'Big YALE lettering, vintage bulldogs, and the Boola Boola tee. The designs that never go out of style.',
    matches: (p) => CLASSIC_WORDS.some((w) => p.name.toLowerCase().includes(w)),
  },
  {
    id: 'colleges',
    title: 'Rep Your College',
    kicker: 'Residential colleges',
    blurb: 'Crests and quarter-zips for Pierson, Saybrook, Davenport, Morse, and more. Wear your home within Yale.',
    matches: (p) => RESIDENTIAL_COLLEGES.some((c) => p.name.toLowerCase().includes(c)),
  },
  {
    id: 'game-day',
    title: 'Game Day',
    kicker: 'Bulldog athletics',
    blurb: 'From The Game against Harvard to hockey, crew, and squash: gear for cheering on the Bulldogs.',
    matches: (p) => GAME_DAY_WORDS.some((w) => hasWord(p.name, w)),
  },
]

export const collectionById = (id: string | null) => COLLECTIONS.find((c) => c.id === id) ?? null
