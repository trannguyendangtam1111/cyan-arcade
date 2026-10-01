package com.cyan.arcade.tcg.dataimport;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * One trading card game, complete: the format every dataset is imported from, whatever its source.
 *
 * <p>An adapter for an external source (an API, a spreadsheet, a data dump) only has to produce
 * this shape as JSON; importing it is the same for all of them. Things are identified by their own
 * codes (a game's slug, a set's code, a card's number), never by database ids, so importing the
 * same dataset again updates what is there instead of duplicating it.
 */
public record TcgDataset(@NotNull @Valid Game game, @NotEmpty List<@Valid @NotNull Rarity> rarities,
		@NotEmpty List<@Valid @NotNull CardSet> sets) {

	static final String CODE = "^[a-z0-9]+(-[a-z0-9]+)*$";

	/**
	 * @param slug identifies the game, in URLs too
	 * @param cardBackUrl the back of the game's cards; optional
	 */
	public record Game(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String slug,
			@NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
			@NotBlank @Size(max = 500) String imageUrl, @Size(max = 500) String cardBackUrl) {
	}

	/**
	 * @param code identifies the rarity within the game; cards and pack odds refer to it
	 * @param tier how special it is, from 1 (ordinary) to 5 (the rarest)
	 */
	public record Rarity(@NotBlank @Size(max = 40) String code, @NotBlank @Size(max = 60) String name,
			@Min(1) @Max(5) int tier) {
	}

	/** @param code identifies the set within the game */
	public record CardSet(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String code,
			@NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
			@NotBlank @Size(max = 500) String imageUrl, LocalDate releasedOn,
			@NotEmpty List<@Valid @NotNull Card> cards, List<@Valid @NotNull Pack> packs) {

		public CardSet {
			packs = (packs != null) ? packs : List.of();
		}

	}

	/**
	 * @param number the number printed on the card; identifies it within its set
	 * @param rarity the code of one of the game's rarities
	 * @param metadata anything else worth keeping about the card; stored and returned as it is
	 */
	public record Card(@NotBlank @Size(max = 20) String number, @NotBlank @Size(max = 120) String name,
			@NotBlank String rarity, @NotBlank @Size(max = 500) String imageUrl, Map<String, Object> metadata) {

		public Card {
			metadata = (metadata != null) ? metadata : Map.of();
		}

	}

	/**
	 * @param code identifies the pack within its set
	 * @param slots the pack's rarity rules, in the order the cards come out
	 * @param cards the numbers of the cards that can come out of the pack; leave it out for "every
	 * card of the set"
	 */
	public record Pack(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String code,
			@NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
			@NotBlank @Size(max = 500) String imageUrl, @NotEmpty List<@Valid @NotNull Slot> slots,
			List<@NotBlank String> cards) {
	}

	/**
	 * One or more cards of a pack that follow the same odds.
	 *
	 * @param count how many cards of the pack this describes
	 * @param odds rarity code to weight: {@code {"rare": 75, "epic": 20, "legendary": 5}}
	 */
	public record Slot(@Min(1) @Max(50) int count, @NotEmpty Map<@NotBlank String, @NotNull @Positive Integer> odds) {
	}

}
