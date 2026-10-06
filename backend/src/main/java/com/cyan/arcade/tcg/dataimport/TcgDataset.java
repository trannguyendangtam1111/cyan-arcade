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
 * <p>An adapter for an external source (an API, a data dump, a hand-written file) only has to
 * produce this shape; importing it is the same for all of them. Things are identified by their own
 * keys (a game's slug, a set's code, a card's external id), never by database ids, so importing the
 * same dataset again updates what is there instead of duplicating it.
 *
 * <p>Nothing in here is specific to one card game: what a game's cards know beyond a name, a number
 * and a rarity travels in {@link Card#metadata()}, and how its packs are made up is data too.
 */
public record TcgDataset(@NotNull @Valid Game game, @NotEmpty List<@Valid @NotNull Rarity> rarities,
		@NotEmpty List<@Valid @NotNull CardSet> sets) {

	static final String CODE = "^[a-z0-9]+(-[a-z0-9]+)*$";

	static final String COLOR = "^#[0-9a-f]{6}$";

	/**
	 * @param slug identifies the game, in URLs too
	 * @param imageUrl a picture for the game; optional
	 * @param cardBackUrl the back of the game's cards; optional
	 * @param accentColor the game's own color, {@code #rrggbb}; optional
	 * @param attribution where the data and images come from and whose they are, shown with the game
	 */
	public record Game(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String slug,
			@NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
			@Size(max = 500) String imageUrl, @Size(max = 500) String cardBackUrl,
			@Pattern(regexp = COLOR) String accentColor, @Size(max = 500) String attribution) {

		public Game(String slug, String name, String description, String imageUrl, String cardBackUrl) {
			this(slug, name, description, imageUrl, cardBackUrl, null, null);
		}

	}

	/**
	 * @param code identifies the rarity within the game; cards and pack odds refer to it
	 * @param tier how special it is, from 1 (ordinary) to 5 (the rarest)
	 */
	public record Rarity(@NotBlank @Size(max = 40) String code, @NotBlank @Size(max = 60) String name,
			@Min(1) @Max(5) int tier) {
	}

	/**
	 * @param code identifies the set within the game, in URLs too
	 * @param externalId the source's own id for the set; optional
	 * @param series the group of sets it belongs to, e.g. "Scarlet &amp; Violet"; optional
	 * @param imageUrl the set's logo; optional
	 * @param coverImageUrl one of the set's cards, to show for it when there is no logo; optional
	 * @param cards in the order the set lists them
	 */
	public record CardSet(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String code,
			@Size(max = 100) String externalId, @NotBlank @Size(max = 100) String name,
			@Size(max = 500) String description, @Size(max = 100) String series, @Size(max = 500) String imageUrl,
			@Size(max = 500) String coverImageUrl, LocalDate releasedOn, @NotEmpty List<@Valid @NotNull Card> cards,
			List<@Valid @NotNull Pack> packs) {

		public CardSet {
			packs = (packs != null) ? packs : List.of();
		}

		public CardSet(String code, String name, String description, String imageUrl, LocalDate releasedOn,
				List<Card> cards, List<Pack> packs) {
			this(code, null, name, description, null, imageUrl, null, releasedOn, cards, packs);
		}

		/** What identifies a card of this set across the whole game, in the database. */
		String externalIdOf(Card card) {
			return (card.externalId() != null) ? card.externalId() : this.code + "-" + card.number();
		}

	}

	/**
	 * @param externalId the source's own id for the card, unique within the game. Optional: a card
	 * without one is known by its set and number, which is enough when no two cards of a set share a
	 * number. Real sets print variants (alternate arts) under the same number, and need it.
	 * @param number the number printed on the card
	 * @param rarity the code of one of the game's rarities
	 * @param imageUrl the full-size image
	 * @param thumbnailUrl a smaller image for grids; optional
	 * @param metadata anything else worth keeping about the card; stored and returned as it is
	 */
	public record Card(@Size(max = 100) String externalId, @NotBlank @Size(max = 20) String number,
			@NotBlank @Size(max = 120) String name, @NotBlank String rarity, @NotBlank @Size(max = 500) String imageUrl,
			@Size(max = 500) String thumbnailUrl, Map<String, Object> metadata) {

		public Card {
			metadata = (metadata != null) ? metadata : Map.of();
		}

		public Card(String number, String name, String rarity, String imageUrl, Map<String, Object> metadata) {
			this(null, number, name, rarity, imageUrl, null, metadata);
		}

		/** How packs of the same set refer to the card: its external id, or its number when it has none. */
		public String key() {
			return (this.externalId != null) ? this.externalId : this.number;
		}

	}

	/**
	 * @param code identifies the pack within its set
	 * @param imageUrl the pack's artwork; optional, the arcade draws one from the set otherwise
	 * @param oddsNote where the odds come from, e.g. that they are a simulator's; optional
	 * @param slots the pack's rarity rules, in the order the cards come out
	 * @param cards the {@link Card#key() keys} of the cards that can come out of the pack; leave it
	 * out for "every card of the set"
	 */
	public record Pack(@NotNull @Pattern(regexp = CODE) @Size(max = 50) String code,
			@NotBlank @Size(max = 100) String name, @Size(max = 500) String description,
			@Size(max = 500) String imageUrl, @Size(max = 300) String oddsNote,
			@NotEmpty List<@Valid @NotNull Slot> slots, List<@NotBlank String> cards) {

		public Pack(String code, String name, String description, String imageUrl, List<Slot> slots,
				List<String> cards) {
			this(code, name, description, imageUrl, null, slots, cards);
		}

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
