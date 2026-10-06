package com.cyan.arcade.dailylogin;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Claimed daily login rewards. Backed by {@code daily_logins}. */
@Repository
class DailyLoginStore {

	private final JdbcClient jdbc;

	DailyLoginStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	record Claim(LocalDate date, int streak, int coins) {
	}

	/**
	 * Records a claim.
	 * @return {@code false} when that day was already claimed, by this request or another at the same
	 * moment: the primary key decides
	 */
	boolean insert(Long userId, LocalDate date, int streak, int coins, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO daily_logins (user_id, login_date, streak, coins, claimed_at)
				VALUES (:userId, :date, :streak, :coins, :now)
				ON CONFLICT DO NOTHING
				""")
			.param("userId", userId)
			.param("date", date)
			.param("streak", streak)
			.param("coins", coins)
			.param("now", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.update() == 1;
	}

	Optional<Claim> find(Long userId, LocalDate date) {
		return this.jdbc.sql("SELECT login_date, streak, coins FROM daily_logins WHERE user_id = :userId AND login_date = :date")
			.param("userId", userId)
			.param("date", date)
			.query((row, index) -> new Claim(row.getObject("login_date", LocalDate.class), row.getInt("streak"),
					row.getInt("coins")))
			.optional();
	}

}
