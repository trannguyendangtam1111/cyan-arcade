package com.cyan.arcade.tcg.opening;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.random.RandomGenerator;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.tcg.card.CardResponse;
import com.cyan.arcade.tcg.card.TcgCardService;
import com.cyan.arcade.tcg.collection.CollectionService;
import com.cyan.arcade.tcg.collection.CollectionService.Added;
import com.cyan.arcade.tcg.opening.OpeningResponse.PulledCard;
import com.cyan.arcade.tcg.opening.PackOpeningStore.OpeningCardRow;
import com.cyan.arcade.tcg.opening.PackOpeningStore.OpeningRow;
import com.cyan.arcade.tcg.opening.TcgOpeningConfig.OpeningProperties;
import com.cyan.arcade.tcg.pack.PackBlueprint;
import com.cyan.arcade.tcg.pack.PackRef;
import com.cyan.arcade.tcg.pack.TcgPackService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Opens packs. This is the only place where cards are handed out: the server decides what a pack
 * contains, records it, and puts the cards into the player's collection, all in one transaction.
 * The client says which pack and nothing more.
 */
@Service
public class PackOpeningService {

	public static final String PACK_NOT_AVAILABLE = "PACK_NOT_AVAILABLE";

	public static final String DAILY_PACK_LIMIT_REACHED = "DAILY_PACK_LIMIT_REACHED";

	private final TcgPackService packs;

	private final TcgCardService cards;

	private final CollectionService collections;

	private final PackOpeningStore openings;

	private final RandomGenerator random;

	private final OpeningProperties properties;

	private final Clock clock;

	PackOpeningService(TcgPackService packs, TcgCardService cards, CollectionService collections,
			PackOpeningStore openings, RandomGenerator random, OpeningProperties properties, Clock clock) {
		this.packs = packs;
		this.cards = cards;
		this.collections = collections;
		this.openings = openings;
		this.random = random;
		this.properties = properties;
		this.clock = clock;
	}

	/**
	 * Opens a pack for a player.
	 *
	 * <p>Either everything happens (the opening is recorded, every card is in the collection) or,
	 * if any step fails, nothing does.
	 */
	@Transactional
	public OpenPackResponse open(Long userId, Long packId) {
		PackBlueprint pack = this.packs.blueprint(packId);
		if (!pack.active()) {
			throw notAvailable("This pack can no longer be opened");
		}

		Instant now = this.clock.instant();
		if (this.properties.isLimited()) {
			// From here to the end of the transaction this player's openings happen one at a time,
			// so the count below cannot be out of date by the time the new opening is saved.
			this.openings.lockOpeningsOf(userId);
			if (allowanceAt(userId, now).usedUp()) {
				throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, DAILY_PACK_LIMIT_REACHED,
						"You have opened all %d of today's packs. More tomorrow!"
							.formatted(this.properties.dailyPackLimit()));
			}
		}

		List<Long> pulled;
		try {
			pulled = PackRoller.roll(pack, this.random);
		}
		catch (IllegalStateException ex) {
			// A pack without rules or without cards: a data problem, not something the player did.
			throw notAvailable("This pack cannot be opened right now");
		}

		Long openingId = this.openings.insert(userId, packId, now);
		List<Added> added = this.collections.add(userId, pulled, now);
		for (int index = 0; index < added.size(); index++) {
			this.openings.insertCard(openingId, index + 1, added.get(index).cardId(), added.get(index).isNew());
		}

		Map<Long, CardResponse> cardsById = this.cards.cardsById(new HashSet<>(pulled));
		List<PulledCard> pulledCards = new ArrayList<>(added.size());
		for (int index = 0; index < added.size(); index++) {
			Added card = added.get(index);
			pulledCards.add(new PulledCard(index + 1, cardsById.get(card.cardId()), card.isNew()));
		}
		OpeningResponse opening = new OpeningResponse(openingId, this.packs.refs(Set.of(packId)).get(packId), now,
				pulledCards);
		return new OpenPackResponse(opening, allowanceAt(userId, now));
	}

	@Transactional(readOnly = true)
	public AllowanceResponse allowanceOf(Long userId) {
		return allowanceAt(userId, this.clock.instant());
	}

	/** One page of a player's own opened packs, newest first. */
	@Transactional(readOnly = true)
	public OpeningHistoryResponse historyOf(Long userId, int page, int size) {
		List<OpeningRow> rows = this.openings.findPage(userId, page, size);
		long total = this.openings.countOf(userId);

		Map<Long, List<OpeningCardRow>> cardRows = this.openings.findCards(rows.stream().map(OpeningRow::id).toList())
			.stream()
			.collect(Collectors.groupingBy(OpeningCardRow::openingId));
		Map<Long, PackRef> packsById = this.packs
			.refs(rows.stream().map(OpeningRow::packId).collect(Collectors.toSet()));
		Map<Long, CardResponse> cardsById = this.cards.cardsById(cardRows.values()
			.stream()
			.flatMap(List::stream)
			.map(OpeningCardRow::cardId)
			.collect(Collectors.toSet()));

		List<OpeningResponse> entries = rows.stream()
			.map((opening) -> new OpeningResponse(opening.id(), packsById.get(opening.packId()), opening.openedAt(),
					cardRows.getOrDefault(opening.id(), List.of())
						.stream()
						.map((card) -> new PulledCard(card.position(), cardsById.get(card.cardId()), card.wasNew()))
						.toList()))
			.toList();
		return new OpeningHistoryResponse(entries, page, size, total, (int) Math.ceil((double) total / size));
	}

	/** The day that counts is the server's, in UTC, like everywhere else in the arcade. */
	private AllowanceResponse allowanceAt(Long userId, Instant now) {
		LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
		Instant startOfDay = today.atStartOfDay(ZoneOffset.UTC).toInstant();
		Instant resetsAt = today.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
		long openedToday = this.openings.countSince(userId, startOfDay);

		if (!this.properties.isLimited()) {
			return new AllowanceResponse(null, openedToday, null, resetsAt);
		}
		int limit = this.properties.dailyPackLimit();
		return new AllowanceResponse(limit, openedToday, (int) Math.max(0, limit - openedToday), resetsAt);
	}

	private static ApiException notAvailable(String message) {
		return new ApiException(HttpStatus.CONFLICT, PACK_NOT_AVAILABLE, message);
	}

}
