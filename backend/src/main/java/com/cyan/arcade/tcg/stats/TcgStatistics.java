package com.cyan.arcade.tcg.stats;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import com.cyan.arcade.common.platform.ActivityStatistics;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The card game's numbers, for the platform's profile and admin dashboard: packs opened and cards
 * collected. Each is one indexed aggregate over the module's own tables.
 */
@Component
@Transactional(readOnly = true)
class TcgStatistics implements ActivityStatistics {

	static final String PACKS_OPENED = "tcg.packsOpened";

	static final String CARDS_COLLECTED = "tcg.cardsCollected";

	static final String UNIQUE_CARDS = "tcg.uniqueCards";

	private final JdbcClient jdbc;

	TcgStatistics(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public List<Statistic> forPlayer(Long userId) {
		long packs = this.jdbc.sql("SELECT count(*) FROM tcg_pack_openings WHERE user_id = :userId")
			.param("userId", userId)
			.query(Long.class)
			.single();
		Long[] cards = this.jdbc
			.sql("SELECT coalesce(sum(quantity), 0), count(*) FROM tcg_user_cards WHERE user_id = :userId")
			.param("userId", userId)
			.query((row, index) -> new Long[] { row.getLong(1), row.getLong(2) })
			.single();
		return List.of(new Statistic(PACKS_OPENED, "Packs opened", packs, null),
				new Statistic(CARDS_COLLECTED, "Cards collected", cards[0], null),
				new Statistic(UNIQUE_CARDS, "Different cards", cards[1], null));
	}

	@Override
	public List<Statistic> overall(Instant startOfToday) {
		OffsetDateTime since = OffsetDateTime.ofInstant(startOfToday, ZoneOffset.UTC);
		long packs = this.jdbc.sql("SELECT count(*) FROM tcg_pack_openings").query(Long.class).single();
		long packsToday = this.jdbc.sql("SELECT count(*) FROM tcg_pack_openings WHERE opened_at >= :since")
			.param("since", since)
			.query(Long.class)
			.single();
		long cards = this.jdbc.sql("SELECT coalesce(sum(quantity), 0) FROM tcg_user_cards").query(Long.class).single();
		long cardsToday = this.jdbc.sql("""
				SELECT count(*) FROM tcg_pack_opening_cards c
				JOIN tcg_pack_openings o ON o.id = c.opening_id
				WHERE o.opened_at >= :since
				""").param("since", since).query(Long.class).single();
		return List.of(new Statistic(PACKS_OPENED, "Packs opened", packs, packsToday),
				new Statistic(CARDS_COLLECTED, "Cards collected", cards, cardsToday));
	}

}
