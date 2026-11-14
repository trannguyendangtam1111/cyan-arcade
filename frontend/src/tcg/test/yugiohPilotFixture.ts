import type { Opening, Rarity, TcgCard, TcgGame, TcgPack, TcgSet } from '../api'

// A deterministic nine-card reveal covering all five rarity labels; not a random sample.
const rarities: Rarity[] = [
  { code: 'common', name: 'Common', tier: 1 },
  { code: 'super-rare', name: 'Super Rare', tier: 3 },
  { code: 'ultra-rare', name: 'Ultra Rare', tier: 4 },
  { code: 'secret-rare', name: 'Secret Rare', tier: 5 },
  { code: 'starlight-rare', name: 'Starlight Rare', tier: 5 },
]
export const pilotGame: TcgGame = {
  id: 7, slug: 'yugioh', name: 'Yu-Gi-Oh! Trading Card Game', description: 'Pilot only.',
  imageUrl: null, cardBackUrl: null, accentColor: '#7b4a12',
  attribution: 'Card data from YGOPRODeck. No card images are used. Not endorsed by Konami.',
  rarities, setCount: 1, cardCount: 127,
}
export const pilotSet: TcgSet = {
  id: 70, code: 'betb', name: 'Beyond the Brave', description: '', series: null,
  imageUrl: null, coverImageUrl: null, releasedOn: '2026-10-08', game: pilotGame, cardCount: 127, packCount: 1,
}
const printings: [string, string, number][] = [
  ['009', 'Akasuna the Battle Ashtra', 3], ['009', 'Akasuna the Battle Ashtra', 4],
  ['018', 'Ars Magna the Finite and the Infinite', 2], ['018', 'Ars Magna the Finite and the Infinite', 4],
  ['024', 'Adamancipator Conductor', 1], ['025', 'Adamancipator Crystal - Tiamite', 0], ['045', 'Crowned Siclavee', 0],
  ['049', 'Adamancipator Luminous', 1], ['063', 'Adamancipator Mates', 1],
]
export const pilotCards: TcgCard[] = printings.map(([number, name, rarity], index) => ({
  id: 701 + index, externalId: `betb:BETB-EN${number}:${rarities[rarity].code}`, number: `BETB-EN${number}`,
  name, rarity: rarities[rarity], imageUrl: null, thumbnailUrl: null, game: pilotGame, set: pilotSet,
  metadata: index === 2 ? {
    cardType: 'Effect Monster', attribute: 'EARTH', monsterType: 'Warrior', level: 8, atk: 1000, def: 2400,
    effect: 'You can banish this card from your hand; add 1 non-Warrior "Ars Magna" monster from your Deck to your hand.',
  } : {},
}))
export const pilotPack: TcgPack = {
  id: 80, code: 'arcade-pilot-booster', name: 'Beyond the Brave Arcade Pilot Pack',
  description: 'Nine text cards using Arcade Simulated Odds. Pilot only; no official artwork or slot layout.',
  imageUrl: null, setLogoUrl: null, coverImageUrl: null, accentColor: pilotGame.accentColor,
  game: pilotGame, set: pilotSet, cardsPerPack: 9, poolSize: 127,
  oddsNote: "Arcade Simulated Odds: each of 9 slots independently draws Common 80%, Super Rare 14%, Ultra Rare 5%, Secret Rare 0.99%, Starlight Rare 0.01%. These are not Konami's official pull rates or pack layout.",
  slots: Array.from({ length: 9 }, (_, index) => ({ slot: index + 1, odds: rarities.map((rarity, i) => ({
    rarity, percent: [80, 14, 5, 0.99, 0.01][i],
  })) })),
}
export const pilotOpening: Opening = {
  id: 800, pack: pilotPack, openedAt: '2026-11-14T03:00:00Z',
  cards: pilotCards.map((card, index) => ({ position: index + 1, card, isNew: true })),
}
