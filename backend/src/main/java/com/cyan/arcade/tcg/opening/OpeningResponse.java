package com.cyan.arcade.tcg.opening;

import java.time.Instant;
import java.util.List;

import com.cyan.arcade.tcg.card.CardResponse;
import com.cyan.arcade.tcg.pack.PackRef;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * One opened pack and what came out of it.
 *
 * @param cards the pulled cards, in the order they came out of the pack
 */
public record OpeningResponse(Long id, PackRef pack, Instant openedAt, List<PulledCard> cards) {

	/**
	 * @param position where in the pack the card was, from 1
	 * @param isNew whether the player did not own the card before this pull
	 */
	public record PulledCard(int position, CardResponse card, @JsonProperty("isNew") boolean isNew) {
	}

}
