package com.cyan.arcade.tcg.dataimport;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.dataimport.TcgDataset.Card;
import com.cyan.arcade.tcg.dataimport.TcgDataset.CardSet;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Pack;
import com.cyan.arcade.tcg.dataimport.TcgDataset.Slot;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;

import org.springframework.stereotype.Component;

/**
 * Checks a dataset before anything is written, and reports everything that is wrong with it at
 * once: first the shape of each part, then whether the parts fit together.
 */
@Component
class TcgDatasetValidator {

	private final Validator validator;

	TcgDatasetValidator(Validator validator) {
		this.validator = validator;
	}

	/** @return what is wrong with the dataset; empty when it can be imported */
	List<String> problemsOf(TcgDataset dataset) {
		List<String> shape = this.validator.validate(dataset)
			.stream()
			.map(TcgDatasetValidator::describe)
			.sorted()
			.toList();
		// Cross-references are only worth checking in a dataset whose parts are all there.
		return shape.isEmpty() ? crossReferenceProblems(dataset) : shape;
	}

	private static String describe(ConstraintViolation<TcgDataset> violation) {
		return "%s %s".formatted(violation.getPropertyPath(), violation.getMessage());
	}

	private static List<String> crossReferenceProblems(TcgDataset dataset) {
		List<String> problems = new ArrayList<>();
		Set<String> rarities = dataset.rarities().stream().map(TcgDataset.Rarity::code).collect(Collectors.toSet());

		duplicates(dataset.rarities(), TcgDataset.Rarity::code)
			.forEach((code) -> problems.add("rarity '%s' is defined more than once".formatted(code)));
		duplicates(dataset.sets(), CardSet::code)
			.forEach((code) -> problems.add("set '%s' is defined more than once".formatted(code)));

		for (CardSet set : dataset.sets()) {
			String where = "set '%s'".formatted(set.code());
			duplicates(set.cards(), Card::number)
				.forEach((number) -> problems.add("%s has more than one card numbered '%s'".formatted(where, number)));
			duplicates(set.packs(), Pack::code)
				.forEach((code) -> problems.add("%s has more than one pack '%s'".formatted(where, code)));

			for (Card card : set.cards()) {
				if (!rarities.contains(card.rarity())) {
					problems.add("%s card '%s' has the unknown rarity '%s'".formatted(where, card.number(),
							card.rarity()));
				}
			}
			for (Pack pack : set.packs()) {
				problems.addAll(packProblems(set, pack, rarities));
			}
		}
		return problems;
	}

	private static List<String> packProblems(CardSet set, Pack pack, Set<String> rarities) {
		List<String> problems = new ArrayList<>();
		String where = "set '%s' pack '%s'".formatted(set.code(), pack.code());
		Map<String, Card> cardsByNumber = set.cards()
			.stream()
			.collect(Collectors.toMap(Card::number, Function.identity(), (first, second) -> first));

		List<String> pool = poolOf(set, pack);
		if (pool.isEmpty()) {
			problems.add("%s has no cards in its pool".formatted(where));
		}
		duplicates(pool, Function.identity())
			.forEach((number) -> problems.add("%s lists card '%s' more than once".formatted(where, number)));
		pool.stream()
			.filter((number) -> !cardsByNumber.containsKey(number))
			.distinct()
			.forEach((number) -> problems.add("%s lists card '%s', which is not in the set".formatted(where, number)));

		// A rarity the pack promises must be one it can deliver.
		Set<String> raritiesInPool = pool.stream()
			.map(cardsByNumber::get)
			.filter((card) -> card != null)
			.map(Card::rarity)
			.collect(Collectors.toSet());
		Set<String> promised = new HashSet<>();
		for (Slot slot : pack.slots()) {
			promised.addAll(slot.odds().keySet());
		}
		for (String rarity : promised.stream().sorted().toList()) {
			if (!rarities.contains(rarity)) {
				problems.add("%s has odds for the unknown rarity '%s'".formatted(where, rarity));
			}
			else if (!raritiesInPool.contains(rarity)) {
				problems.add("%s has odds for '%s' but no card of that rarity in its pool".formatted(where, rarity));
			}
		}
		return problems;
	}

	/** The numbers of the cards a pack can contain: the listed ones, or the whole set when none are listed. */
	static List<String> poolOf(CardSet set, Pack pack) {
		return (pack.cards() != null) ? pack.cards() : set.cards().stream().map(Card::number).toList();
	}

	private static <T> List<String> duplicates(List<T> items, Function<T, String> key) {
		Set<String> seen = new HashSet<>();
		return items.stream().map(key).filter((value) -> !seen.add(value)).distinct().toList();
	}

}
