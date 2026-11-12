import type { TcgCard } from './api'

/** What kind of card a text card is, for its emblem. */
export type TextCardKind = 'monster' | 'spell' | 'trap' | 'other'

/**
 * What a card without a picture shows, read from its metadata. Only what the card's source says:
 * a field that is missing, blank or of an unexpected type is left out, never guessed.
 */
export interface TextCardDetails {
  kind: TextCardKind
  /** "Warrior / Effect Monster", "Normal / Spell Card". */
  typeLine: string | null
  /** "EARTH". */
  attribute: string | null
  /** "Level 8", "Rank 3", "Link 2". */
  levelLabel: string | null
  /** "ATK 1000 / DEF 2400", "ATK 1800 / LINK-2". */
  stats: string | null
  effect: string | null
}

function text(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function count(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function kindOf(frameType: string | null, cardType: string | null, hasStats: boolean): TextCardKind {
  const frame = frameType?.toLowerCase() ?? ''
  const type = cardType?.toLowerCase() ?? ''
  if (frame === 'spell' || type.includes('spell')) return 'spell'
  if (frame === 'trap' || type.includes('trap')) return 'trap'
  if (hasStats || type.includes('monster')) return 'monster'
  return 'other'
}

export function textCardDetails(card: Pick<TcgCard, 'metadata'>): TextCardDetails {
  const metadata = card.metadata ?? {}
  const cardType = text(metadata, 'cardType')
  const atk = count(metadata, 'atk')
  const def = count(metadata, 'def')
  const level = count(metadata, 'level')
  const rank = count(metadata, 'rank')
  const link = count(metadata, 'linkRating')
  const kind = kindOf(text(metadata, 'frameType'), cardType, atk !== null || def !== null)

  // A monster's type comes before its card type; a Spell's or Trap's property (Quick-Play, Normal) too.
  const subtype = kind === 'monster' ? text(metadata, 'monsterType') : text(metadata, 'property')
  const typeLine = [subtype, cardType].filter((part): part is string => part !== null).join(' / ') || null

  const levelLabel =
    rank !== null ? `Rank ${rank}` : link !== null ? `Link ${link}` : level !== null ? `Level ${level}` : null

  const stats: string[] = []
  if (atk !== null) stats.push(`ATK ${atk}`)
  if (link !== null) stats.push(`LINK-${link}`)
  else if (def !== null) stats.push(`DEF ${def}`)

  return {
    kind,
    typeLine,
    attribute: text(metadata, 'attribute'),
    levelLabel,
    stats: stats.length > 0 ? stats.join(' / ') : null,
    effect: text(metadata, 'effect'),
  }
}

/** Each franchise's text frame. Yu-Gi-Oh! gets gold; any other game shown as text, the arcade's cyan. */
export function textCardFrame(gameSlug: string): string {
  return gameSlug === 'yugioh'
    ? 'from-amber-200 via-yellow-500 to-amber-700'
    : 'from-cyan-200 via-cyan-500 to-cyan-700'
}
