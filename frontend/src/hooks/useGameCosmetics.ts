import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useSession } from '@/api/auth'
import { economyKeys, useEquip, useShop, type ShopItem, type ShopResponse } from '@/api/economy'
import type { GameCosmetics, GameModule, GameSkin } from '@/games/types'

function toSkin(item: ShopItem): GameSkin {
  const owned = (item.owned ?? 0) > 0
  return {
    itemId: item.id,
    slot: item.slot ?? '',
    skinId: item.icon,
    name: item.name,
    price: item.price,
    minLevel: item.minLevel,
    owned,
    wearable: item.wearable ?? owned,
    equipped: item.equipped === true,
    unlocked: item.unlocked,
  }
}

/**
 * A game's skins, for a module that declares `cosmetics`: what the shop sells for it, what the
 * player owns and wears, and a way to wear one. Everything comes from the ordinary shop and
 * inventory; the game gets no way to buy or grant anything, and the server checks every change.
 * A game without skins gets `undefined`, and nothing is loaded for it.
 */
export function useGameCosmetics(gameModule: GameModule): GameCosmetics | undefined {
  const hasSkins = gameModule.cosmetics !== undefined
  const { slug } = gameModule
  const { user } = useSession()
  const shop = useShop(hasSkins)
  const equip = useEquip()
  const queryClient = useQueryClient()
  // What the player just picked, shown straight away while the server saves it.
  const [choice, setChoice] = useState<{ slot: string; itemId: number | null } | null>(null)

  const items = shop.data?.items
  const skins = useMemo(() => {
    if (!items) return null
    return items
      .filter((item) => item.type === 'GAME_SKIN' && item.gameSlug === slug && item.slot)
      .map(toSkin)
      .map((skin) => (choice && skin.slot === choice.slot ? { ...skin, equipped: skin.itemId === choice.itemId } : skin))
  }, [items, slug, choice])

  const { mutate } = equip
  const wear = useCallback(
    (slot: string, itemId: number | null) => {
      if (!user || !skins) return
      // Going back to the game's own look takes off what is worn there.
      const target =
        itemId === null
          ? skins.find((skin) => skin.slot === slot && skin.equipped)
          : skins.find((skin) => skin.itemId === itemId && (skin.wearable ?? skin.owned))
      if (!target) return
      setChoice({ slot, itemId })
      mutate(
        { itemId: target.itemId, equipped: itemId !== null },
        {
          // The answer says what is worn now: show it at once, before the shop is read again.
          onSuccess: (inventory) =>
            queryClient.setQueryData<ShopResponse>(economyKeys.shop(true), (current) =>
              current && {
                ...current,
                items: current.items.map((item) => {
                  const entry = inventory.items.find((owned) => owned.itemId === item.id)
                  if (entry) return { ...item, equipped: entry.equipped }
                  // A skin worn without being owned is not in the inventory: in its slot, it is the one chosen.
                  if (item.type === 'GAME_SKIN' && item.gameSlug === slug && item.slot === slot) {
                    return { ...item, equipped: itemId !== null && item.id === target.itemId }
                  }
                  return item
                }),
              },
            ),
          onSettled: () => setChoice(null),
        },
      )
    },
    [user, skins, mutate, queryClient, slug],
  )

  if (!hasSkins) return undefined
  return {
    signedIn: user !== null,
    skins,
    equip: wear,
    saving: equip.isPending,
    shopPath: '/shop?category=skins',
    loginPath: `/login?redirect=${encodeURIComponent(`/games/${slug}`)}`,
  }
}
