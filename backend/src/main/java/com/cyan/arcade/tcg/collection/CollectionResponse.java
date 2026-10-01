package com.cyan.arcade.tcg.collection;

import java.time.Instant;
import java.util.List;

import com.cyan.arcade.tcg.card.CardResponse;
import com.cyan.arcade.tcg.game.GameRef;

/**
 * A player's collection: how complete it is, set by set, and one page of the cards they own.
 *
 * @param sets progress in every set, including the ones the player has nothing of yet
 * @param cards one page of owned cards, ordered by set and card number
 * @param page zero-based page number
 * @param totalEntries how many different cards match the filter
 */
public record CollectionResponse(Summary summary, List<SetProgress> sets, List<OwnedCard> cards, int page,
		int size, long totalEntries, int totalPages) {

	/**
	 * @param uniqueCards how many different cards the player owns
	 * @param totalCards how many cards the player owns, counting every copy
	 * @param availableCards how many different cards exist
	 * @param completionPercent {@code uniqueCards} out of {@code availableCards}, 0 to 100
	 */
	public record Summary(int uniqueCards, long totalCards, int availableCards, double completionPercent) {
	}

	/** @param completionPercent {@code ownedCards} out of {@code totalCards}, 0 to 100 */
	public record SetProgress(Long id, String code, String name, String imageUrl, GameRef game, int ownedCards,
			int totalCards, double completionPercent) {
	}

	/** @param quantity how many copies the player owns */
	public record OwnedCard(CardResponse card, int quantity, Instant firstObtainedAt, Instant lastObtainedAt) {
	}

}
