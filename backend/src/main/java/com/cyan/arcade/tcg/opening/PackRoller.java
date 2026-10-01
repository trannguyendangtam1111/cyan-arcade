package com.cyan.arcade.tcg.opening;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.random.RandomGenerator;

import com.cyan.arcade.tcg.pack.PackBlueprint;
import com.cyan.arcade.tcg.pack.PackBlueprint.Odds;
import com.cyan.arcade.tcg.pack.PackBlueprint.Slot;

/**
 * Decides which cards come out of a pack. Pure: the same blueprint and the same random numbers
 * always give the same cards, which is what makes the odds testable.
 *
 * <p>For every slot of the pack, in order:
 * <ol>
 * <li>a rarity is drawn according to the slot's weights, among the rarities the pool has cards of;
 * <li>a card of that rarity is drawn from the pool, every card being equally likely. A card already
 * pulled from this pack is left out while the rarity has others to offer, so one pack does not
 * contain the same card twice unless its pool is too small to avoid it.
 * </ol>
 */
final class PackRoller {

	private PackRoller() {
	}

	/**
	 * @return the ids of the pulled cards, one per slot, in slot order
	 * @throws IllegalStateException when a slot cannot be filled from the pool
	 */
	static List<Long> roll(PackBlueprint pack, RandomGenerator random) {
		if (pack.slots().isEmpty()) {
			throw new IllegalStateException("Pack %d has no slots".formatted(pack.packId()));
		}
		List<Long> pulled = new ArrayList<>(pack.slots().size());
		Set<Long> alreadyPulled = new HashSet<>();
		for (Slot slot : pack.slots()) {
			Long rarityId = drawRarity(pack, slot, random);
			Long cardId = drawCard(pack.cardIdsByRarity().get(rarityId), alreadyPulled, random);
			pulled.add(cardId);
			alreadyPulled.add(cardId);
		}
		return pulled;
	}

	private static Long drawRarity(PackBlueprint pack, Slot slot, RandomGenerator random) {
		// A rarity with no cards in the pool cannot come up; the others share its weight proportionally.
		List<Odds> possible = slot.odds()
			.stream()
			.filter((odds) -> !pack.cardIdsByRarity().getOrDefault(odds.rarityId(), List.of()).isEmpty())
			.toList();
		int totalWeight = possible.stream().mapToInt(Odds::weight).sum();
		if (totalWeight <= 0) {
			throw new IllegalStateException(
					"Slot %d of pack %d has no rarity with cards in the pool".formatted(slot.number(), pack.packId()));
		}

		int ticket = random.nextInt(totalWeight);
		for (Odds odds : possible) {
			ticket -= odds.weight();
			if (ticket < 0) {
				return odds.rarityId();
			}
		}
		throw new AssertionError("A ticket below the total weight always lands on a rarity");
	}

	private static Long drawCard(List<Long> cardsOfRarity, Set<Long> alreadyPulled, RandomGenerator random) {
		List<Long> fresh = cardsOfRarity.stream().filter((cardId) -> !alreadyPulled.contains(cardId)).toList();
		List<Long> candidates = fresh.isEmpty() ? cardsOfRarity : fresh;
		return candidates.get(random.nextInt(candidates.size()));
	}

}
