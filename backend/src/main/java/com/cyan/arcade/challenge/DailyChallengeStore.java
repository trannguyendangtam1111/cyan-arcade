package com.cyan.arcade.challenge;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The challenges of each day and who completed them. Backed by {@code daily_challenges} and its completions. */
@Repository
class DailyChallengeStore {

	private final JdbcClient jdbc;

	DailyChallengeStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Gives a game its challenge for a day.
	 * @return {@code false} when the game already has one that day, which is then left as it is
	 */
	boolean insertIfAbsent(LocalDate date, Long gameId, String title, String description, ChallengeGoal goal,
			String detail, int target, int xpReward, Instant now) {
		int inserted = this.jdbc.sql("""
				INSERT INTO daily_challenges
				    (challenge_date, game_id, title, description, goal, detail, target, xp_reward, created_at)
				VALUES (:date, :gameId, :title, :description, :goal, :detail, :target, :xpReward, :createdAt)
				ON CONFLICT (challenge_date, game_id) DO NOTHING
				""")
			.param("date", date)
			.param("gameId", gameId)
			.param("title", title)
			.param("description", description)
			.param("goal", goal.name())
			.param("detail", detail, Types.VARCHAR)
			.param("target", target)
			.param("xpReward", xpReward)
			.param("createdAt", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.update();
		return inserted == 1;
	}

	/** A day's challenges, in the order they were created, which is the order of the game catalog. */
	List<DailyChallenge> findByDate(LocalDate date) {
		return this.jdbc.sql("""
				SELECT id, challenge_date, game_id, title, description, goal, detail, target, xp_reward
				FROM daily_challenges
				WHERE challenge_date = :date
				ORDER BY id
				""").param("date", date).query(DailyChallengeStore::toChallenge).list();
	}

	/**
	 * Records that a player completed a challenge.
	 * @return {@code false} when they already had, so it is never rewarded twice, even if two of
	 * their runs finish at the same moment
	 */
	boolean complete(Long userId, Long challengeId, Instant now) {
		int inserted = this.jdbc.sql("""
				INSERT INTO daily_challenge_completions (user_id, daily_challenge_id, completed_at)
				VALUES (:userId, :challengeId, :completedAt)
				ON CONFLICT DO NOTHING
				""")
			.param("userId", userId)
			.param("challengeId", challengeId)
			.param("completedAt", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.update();
		return inserted == 1;
	}

	/** When a player completed each of a day's challenges, by challenge id. Uncompleted ones are absent. */
	Map<Long, Instant> completionsOf(Long userId, LocalDate date) {
		return this.jdbc.sql("""
				SELECT done.daily_challenge_id, done.completed_at
				FROM daily_challenge_completions done
				JOIN daily_challenges challenge ON challenge.id = done.daily_challenge_id
				WHERE done.user_id = :userId AND challenge.challenge_date = :date
				""")
			.param("userId", userId)
			.param("date", date)
			.query((row, index) -> Map.entry(row.getLong("daily_challenge_id"),
					row.getObject("completed_at", OffsetDateTime.class).toInstant()))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	private static DailyChallenge toChallenge(ResultSet row, int index) throws SQLException {
		return new DailyChallenge(row.getLong("id"), row.getObject("challenge_date", LocalDate.class),
				row.getLong("game_id"), row.getString("title"), row.getString("description"),
				ChallengeGoal.valueOf(row.getString("goal")), row.getString("detail"), row.getInt("target"),
				row.getInt("xp_reward"));
	}

}
