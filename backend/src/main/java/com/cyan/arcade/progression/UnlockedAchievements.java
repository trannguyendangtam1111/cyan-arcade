package com.cyan.arcade.progression;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Which achievements each player has unlocked, and when. Backed by {@code user_achievements}. */
@Repository
class UnlockedAchievements {

	private final JdbcClient jdbc;

	UnlockedAchievements(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Records an unlock.
	 * @return {@code false} when the player already had it, so it is never rewarded twice, even if
	 * two of their runs finish at the same moment
	 */
	boolean unlock(Long userId, String code, Instant now) {
		int inserted = this.jdbc.sql("""
				INSERT INTO user_achievements (user_id, achievement_code, unlocked_at)
				VALUES (:userId, :code, :unlockedAt)
				ON CONFLICT DO NOTHING
				""")
			.param("userId", userId)
			.param("code", code)
			.param("unlockedAt", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.update();
		return inserted == 1;
	}

	/** Unlock times by achievement code. */
	Map<String, Instant> of(Long userId) {
		return this.jdbc.sql("SELECT achievement_code, unlocked_at FROM user_achievements WHERE user_id = :userId")
			.param("userId", userId)
			.query((row, index) -> Map.entry(row.getString("achievement_code"),
					row.getObject("unlocked_at", OffsetDateTime.class).toInstant()))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

}
