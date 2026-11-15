package com.cyan.arcade.tcg.opening;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.IntStream;

import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohPackFixture;
import com.cyan.arcade.tcg.pack.PackBlueprint;
import com.cyan.arcade.tcg.pack.PackBlueprint.Odds;
import com.cyan.arcade.tcg.pack.PackBlueprint.Slot;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Exercises the shipped pilot's actual weights and complete printing pools with deterministic randomness. */
class YugiohPackRollerTests {

	private static final TcgDataset DATA = YugiohPackFixture.dataset("yugioh");

	private static final PackBlueprint PACK = blueprint();

	@Test
	void allNineSlotsHaveTheExactSimulatedOddsAndTheWholePrintingPool() {
		assertThat(DATA.sets().getFirst().cards()).hasSize(127);
		assertThat(DATA.sets().getFirst().cards().stream().map((card) -> card.metadata().get("passcode")).distinct())
			.hasSize(100);
		assertThat(PACK.slots()).hasSize(9);
		assertThat(PACK.cardIdsByRarity().values()).extracting(List::size).containsExactly(50, 26, 16, 10, 25);
		assertThat(PACK.slots()).allSatisfy((slot) -> assertThat(slot.odds()).extracting(Odds::weight)
			.containsExactly(8000, 1400, 500, 99, 1));
	}

	@Test
	void everyRarityBoundaryCanBeDrawnWithoutLuckyOutcomes() {
		int[] tickets = { 0, 7999, 8000, 9399, 9400, 9899, 9900, 9998, 9999 };
		List<Long> expected = List.of(1L, 1L, 2L, 2L, 3L, 3L, 4L, 4L, 5L);
		ArrayDeque<Integer> draws = new ArrayDeque<>();
		for (int ticket : tickets) {
			draws.add(ticket);
			draws.add(0); // Choose the first fresh printing of the rarity.
		}
		Random scripted = new Random(0) {
			@Override
			public int nextInt(int bound) {
				int value = draws.removeFirst();
				assertThat(value).isBetween(0, bound - 1);
				return value;
			}
		};
		List<Long> pulled = PackRoller.roll(PACK, scripted);
		assertThat(pulled.stream().map(YugiohPackRollerTests::rarityOf)).containsExactlyElementsOf(expected);
		assertThat(pulled).doesNotHaveDuplicates();
		assertThat(draws).isEmpty();
	}

	@Test
	void aSeededSimulationMatchesTheConfiguredProbabilitiesWithoutReweighting() {
		Random random = new Random(8008);
		Map<Long, Integer> observed = new HashMap<>();
		int packs = 100_000;
		for (int index = 0; index < packs; index++) {
			List<Long> cards = PackRoller.roll(PACK, random);
			assertThat(cards).hasSize(9).doesNotHaveDuplicates();
			for (Long card : cards) {
				observed.merge(rarityOf(card), 1, Integer::sum);
			}
		}
		for (Odds odds : PACK.slots().getFirst().odds()) {
			double probability = odds.weight() / 10_000.0;
			double expected = packs * 9 * probability;
			double sixSigma = 6 * Math.sqrt(packs * 9 * probability * (1 - probability));
			assertThat(observed.get(odds.rarityId()).doubleValue()).isBetween(expected - sixSigma, expected + sixSigma);
		}
		System.out.println("TCG-008 seeded simulation (900000 slots): " + observed);
	}

	private static Long rarityOf(Long cardId) {
		return PACK.cardIdsByRarity().entrySet().stream().filter((entry) -> entry.getValue().contains(cardId))
			.map(Map.Entry::getKey).findFirst().orElseThrow();
	}

	private static PackBlueprint blueprint() {
		var set = DATA.sets().getFirst();
		Map<Long, List<Long>> pools = new LinkedHashMap<>();
		Map<String, Long> rarityIds = new HashMap<>();
		for (int i = 0; i < DATA.rarities().size(); i++) {
			String rarity = DATA.rarities().get(i).code();
			rarityIds.put(rarity, (long) i + 1);
			pools.put((long) i + 1, IntStream.range(0, set.cards().size())
				.filter((index) -> set.cards().get(index).rarity().equals(rarity)).mapToObj((index) -> (long) index + 1).toList());
		}
		var rule = set.packs().getFirst().slots().getFirst();
		List<Odds> odds = DATA.rarities().stream().map((rarity) -> new Odds(rarityIds.get(rarity.code()),
				rule.odds().get(rarity.code()))).toList();
		return new PackBlueprint(8L, true, IntStream.rangeClosed(1, rule.count()).mapToObj((slot) -> new Slot(slot, odds)).toList(), pools);
	}
}
