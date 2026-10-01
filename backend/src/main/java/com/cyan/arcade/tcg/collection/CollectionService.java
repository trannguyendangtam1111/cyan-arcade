package com.cyan.arcade.tcg.collection;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.card.CardResponse;
import com.cyan.arcade.tcg.card.TcgCardService;
import com.cyan.arcade.tcg.collection.CollectionResponse.OwnedCard;
import com.cyan.arcade.tcg.collection.CollectionResponse.SetProgress;
import com.cyan.arcade.tcg.collection.CollectionResponse.Summary;
import com.cyan.arcade.tcg.collection.CollectionStore.OwnedRow;
import com.cyan.arcade.tcg.collection.CollectionStore.SetRow;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Players' card collections.
 *
 * <p>Cards only ever enter a collection through {@link #add}, which is called by the pack opening
 * and by nothing else: no endpoint takes a card from the client and puts it in a collection.
 */
@Service
@Transactional(readOnly = true)
public class CollectionService {

	private final CollectionStore collections;

	private final TcgCardService cards;

	CollectionService(CollectionStore collections, TcgCardService cards) {
		this.collections = collections;
		this.cards = cards;
	}

	/**
	 * What adding one card did.
	 * @param quantity how many copies the player owns now
	 * @param isNew whether the player did not own the card before
	 */
	public record Added(Long cardId, int quantity, boolean isNew) {
	}

	/**
	 * Adds cards to a player's collection, one copy for every time a card is listed. Must run inside
	 * the transaction of whatever gave the cards out, so both happen or neither does.
	 * @return the outcome for each card, in the order given
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public List<Added> add(Long userId, List<Long> cardIds, Instant now) {
		List<Added> added = new ArrayList<>(cardIds.size());
		for (Long cardId : cardIds) {
			int quantity = this.collections.addCopy(userId, cardId, now);
			added.add(new Added(cardId, quantity, quantity == 1));
		}
		return added;
	}

	/**
	 * @param gameSlug only this game, or {@code null} for every game
	 * @param setId narrows the list of cards (not the statistics) to one set, or {@code null}
	 */
	public CollectionResponse collectionOf(Long userId, String gameSlug, Long setId, int page, int size) {
		List<SetRow> progress = this.collections.findProgress(userId, gameSlug);
		List<OwnedRow> owned = this.collections.findOwned(userId, gameSlug, setId, page, size);
		long totalEntries = this.collections.countOwned(userId, gameSlug, setId);
		Map<Long, CardResponse> cardsById = this.cards.cardsById(owned.stream().map(OwnedRow::cardId).toList());

		int unique = progress.stream().mapToInt(SetRow::ownedCards).sum();
		int available = progress.stream().mapToInt(SetRow::totalCards).sum();
		long copies = progress.stream().mapToLong(SetRow::copies).sum();

		return new CollectionResponse(new Summary(unique, copies, available, percent(unique, available)),
				progress.stream()
					.map((set) -> new SetProgress(set.id(), set.code(), set.name(), set.imageUrl(), set.game(),
							set.ownedCards(), set.totalCards(), percent(set.ownedCards(), set.totalCards())))
					.toList(),
				owned.stream()
					.map((row) -> new OwnedCard(cardsById.get(row.cardId()), row.quantity(), row.firstObtainedAt(),
							row.lastObtainedAt()))
					.toList(),
				page, size, totalEntries, (int) Math.ceil((double) totalEntries / size));
	}

	/** {@code part} out of {@code whole} as a percentage with one decimal; 0 when there is nothing to own. */
	static double percent(int part, int whole) {
		return (whole == 0) ? 0.0 : Math.round(part * 1000.0 / whole) / 10.0;
	}

}
