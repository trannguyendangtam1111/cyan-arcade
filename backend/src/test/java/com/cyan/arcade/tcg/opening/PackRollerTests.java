package com.cyan.arcade.tcg.opening;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.random.RandomGenerator;

import com.cyan.arcade.tcg.pack.PackBlueprint;
import com.cyan.arcade.tcg.pack.PackBlueprint.Odds;
import com.cyan.arcade.tcg.pack.PackBlueprint.Slot;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.within;

/** How the contents of a pack are decided: the rarity of each slot, then the card. */
class PackRollerTests {

	private static final long COMMON = 1L;

	private static final long RARE = 2L;

	private static final long LEGENDARY = 3L;

	/** Commons 101 to 105, rares 201 to 203, one legendary 301. */
	private static final Map<Long, List<Long>> POOL = Map.of(COMMON, List.of(101L, 102L, 103L, 104L, 105L), RARE,
			List.of(201L, 202L, 203L), LEGENDARY, List.of(301L));

	private static final Slot COMMON_SLOT = new Slot(1, List.of(new Odds(COMMON, 100)));

	/** Rare 75 %, legendary 25 %. */
	private static final Slot RARE_SLOT = new Slot(2, List.of(new Odds(RARE, 75), new Odds(LEGENDARY, 25)));

	@Test
	void givesOneCardPerSlotInSlotOrderEachOfTheSlotsRarity() {
		PackBlueprint pack = pack(POOL, slot(1, COMMON), slot(2, COMMON), slot(3, RARE), slot(4, LEGENDARY));

		List<Long> pulled = PackRoller.roll(pack, new Random(7));

		assertThat(pulled).hasSize(4);
		assertThat(pulled.subList(0, 2)).allMatch(POOL.get(COMMON)::contains);
		assertThat(pulled.get(2)).isIn(POOL.get(RARE));
		assertThat(pulled.get(3)).isEqualTo(301L);
	}

	@Test
	void theTicketDrawnDecidesTheRarityAccordingToTheWeights() {
		PackBlueprint pack = pack(POOL, RARE_SLOT);

		// Tickets 0 to 74 are rares, 75 to 99 legendaries. The second number picks the card.
		assertThat(PackRoller.roll(pack, scripted(0, 0))).containsExactly(201L);
		assertThat(PackRoller.roll(pack, scripted(74, 2))).containsExactly(203L);
		assertThat(PackRoller.roll(pack, scripted(75, 0))).containsExactly(301L);
		assertThat(PackRoller.roll(pack, scripted(99, 0))).containsExactly(301L);
	}

	@Test
	void everyCardOfTheDrawnRarityIsEquallyLikely() {
		PackBlueprint pack = pack(POOL, COMMON_SLOT);
		Random random = new Random(11);
		Map<Long, Integer> pulls = new HashMap<>();

		int packs = 50_000;
		for (int opened = 0; opened < packs; opened++) {
			pulls.merge(PackRoller.roll(pack, random).get(0), 1, Integer::sum);
		}

		assertThat(pulls.keySet()).containsExactlyInAnyOrderElementsOf(POOL.get(COMMON));
		// Five commons: each should come up in a fifth of the packs.
		assertThat(pulls.values()).allSatisfy((count) -> assertThat(count / (double) packs).isCloseTo(0.2, within(0.01)));
	}

	@Test
	void overManyPacksTheRaritiesComeUpAsOftenAsTheirWeightsSay() {
		Slot slot = new Slot(1, List.of(new Odds(COMMON, 70), new Odds(RARE, 25), new Odds(LEGENDARY, 5)));
		PackBlueprint pack = pack(POOL, slot);
		Random random = new Random(2026);
		Map<Long, Integer> byRarity = new HashMap<>();

		int packs = 100_000;
		for (int opened = 0; opened < packs; opened++) {
			Long cardId = PackRoller.roll(pack, random).get(0);
			byRarity.merge(cardId / 100, 1, Integer::sum);
		}

		assertThat(byRarity.get(COMMON) / (double) packs).isCloseTo(0.70, within(0.01));
		assertThat(byRarity.get(RARE) / (double) packs).isCloseTo(0.25, within(0.01));
		assertThat(byRarity.get(LEGENDARY) / (double) packs).isCloseTo(0.05, within(0.005));
	}

	@Test
	void aPackDoesNotContainTheSameCardTwiceWhileItsPoolHasOthers() {
		// Five slots for five commons: every pack must be all five.
		PackBlueprint pack = pack(POOL, slot(1, COMMON), slot(2, COMMON), slot(3, COMMON), slot(4, COMMON),
				slot(5, COMMON));
		Random random = new Random(3);

		for (int opened = 0; opened < 500; opened++) {
			assertThat(PackRoller.roll(pack, random)).containsExactlyInAnyOrderElementsOf(POOL.get(COMMON));
		}
	}

	@Test
	void aPoolTooSmallToAvoidItRepeatsACard() {
		PackBlueprint pack = pack(POOL, slot(1, LEGENDARY), slot(2, LEGENDARY));

		assertThat(PackRoller.roll(pack, new Random(5))).containsExactly(301L, 301L);
	}

	@Test
	void aRarityWithoutCardsInThePoolNeverComesUp() {
		// The slot promises legendaries, the pool has none: every pull must be a rare.
		PackBlueprint pack = pack(Map.of(RARE, POOL.get(RARE)), RARE_SLOT);
		Random random = new Random(9);

		for (int opened = 0; opened < 1_000; opened++) {
			assertThat(PackRoller.roll(pack, random).get(0)).isIn(POOL.get(RARE));
		}
	}

	@Test
	void aSlotThatCannotBeFilledIsAnErrorNotAnEmptySlot() {
		PackBlueprint noCardsForTheSlot = pack(Map.of(COMMON, POOL.get(COMMON)), COMMON_SLOT, slot(2, LEGENDARY));
		PackBlueprint noSlots = pack(POOL);

		assertThatIllegalStateException().isThrownBy(() -> PackRoller.roll(noCardsForTheSlot, new Random(1)))
			.withMessageContaining("Slot 2");
		assertThatIllegalStateException().isThrownBy(() -> PackRoller.roll(noSlots, new Random(1)));
	}

	@Test
	void theSameRandomNumbersAlwaysGiveTheSamePack() {
		PackBlueprint pack = pack(POOL, slot(1, COMMON), slot(2, COMMON), RARE_SLOT);

		assertThat(PackRoller.roll(pack, new Random(42))).isEqualTo(PackRoller.roll(pack, new Random(42)));
		// And different numbers give different packs sooner or later.
		Random random = new Random(42);
		assertThat(new HashSet<>(List.of(PackRoller.roll(pack, random), PackRoller.roll(pack, random),
				PackRoller.roll(pack, random), PackRoller.roll(pack, random))))
			.hasSizeGreaterThan(1);
	}

	private static Slot slot(int number, long rarityId) {
		return new Slot(number, List.of(new Odds(rarityId, 100)));
	}

	private static PackBlueprint pack(Map<Long, List<Long>> pool, Slot... slots) {
		return new PackBlueprint(1L, true, List.of(slots), pool);
	}

	/** A source of "random" numbers that returns exactly the given ones, in order. */
	private static RandomGenerator scripted(int... numbers) {
		Deque<Integer> queue = new ArrayDeque<>();
		for (int number : numbers) {
			queue.add(number);
		}
		return new RandomGenerator() {
			@Override
			public long nextLong() {
				throw new UnsupportedOperationException("The roller only asks for bounded ints");
			}

			@Override
			public int nextInt(int bound) {
				int next = queue.remove();
				assertThat(next).isLessThan(bound);
				return next;
			}
		};
	}

}
