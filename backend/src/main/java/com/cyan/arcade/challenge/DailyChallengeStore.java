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

import com.cyan.arcade.challenge.ChallengeTemplates.Activity;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The challenges of each day, who completed them, and how far players have got with the counted
 * ones. Backed by {@code daily_challenges}, its completions and its progress.
 */
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
	boolean insertIfAbsent(LocalDate date, Long gameId, ChallengeTemplate template, String description, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO daily_challenges
				    (challenge_date, game_id, title, description, goal, detail, target, xp_reward, coin_reward,
				     created_at)
				VALUES (:date, :gameId, :title, :description, :goal, :detail, :target, :xpReward, :coinReward,
				        :createdAt)
				ON CONFLICT (challenge_date, game_id) DO NOTHING
				""")
			.param("date", date)
			.param("gameId", gameId)
			.param("title", template.title())
			.param("description", description)
			.param("goal", template.goal().name())
			.param("detail", template.detail(), Types.VARCHAR)
			.param("target", template.target())
			.param("xpReward", template.xpReward())
			.param("coinReward", template.coinReward())
			.param("createdAt", at(now))
			.update() == 1;
	}

	/**
	 * Gives an activity its challenge for a day.
	 * @return {@code false} when the activity already has one that day, which is then left as it is
	 */
	boolean insertIfAbsent(LocalDate date, Activity activity, ChallengeTemplate template, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO daily_challenges
				    (challenge_date, activity, activity_name, title, description, goal, target, xp_reward,
				     coin_reward, created_at)
				VALUES (:date, :activity, :activityName, :title, :description, :goal, :target, :xpReward,
				        :coinReward, :createdAt)
				ON CONFLICT (challenge_date, activity) WHERE activity IS NOT NULL DO NOTHING
				""")
			.param("date", date)
			.param("activity", activity.code())
			.param("activityName", activity.name())
			.param("title", template.title())
			.param("description", template.description())
			.param("goal", template.goal().name())
			.param("target", template.target())
			.param("xpReward", template.xpReward())
			.param("coinReward", template.coinReward())
			.param("createdAt", at(now))
			.update() == 1;
	}

	/**
	 * A day's challenges: the games' in the order they were created (the order of the game catalog),
	 * then the activities'.
	 */
	List<DailyChallenge> findByDate(LocalDate date) {
		return this.jdbc.sql("""
				SELECT id, challenge_date, game_id, activity, activity_name, title, description, goal, detail,
				       target, xp_reward, coin_reward
				FROM daily_challenges
				WHERE challenge_date = :date
				ORDER BY activity NULLS FIRST, id
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
			.param("completedAt", at(now))
			.update();
		return inserted == 1;
	}

	/**
	 * Counts one more towards a counted challenge, atomically, so two activities at the same moment
	 * both count.
	 * @return the player's progress afterwards
	 */
	int addProgress(Long userId, Long challengeId, Instant now) {
		return this.jdbc.sql("""
				INSERT INTO daily_challenge_progress (user_id, daily_challenge_id, progress, updated_at)
				VALUES (:userId, :challengeId, 1, :now)
				ON CONFLICT (user_id, daily_challenge_id)
				DO UPDATE SET progress = daily_challenge_progress.progress + 1, updated_at = :now
				RETURNING progress
				""")
			.param("userId", userId)
			.param("challengeId", challengeId)
			.param("now", at(now))
			.query(Integer.class)
			.single();
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

	/** A player's progress with each of a day's counted challenges, by challenge id. Untouched ones are absent. */
	Map<Long, Integer> progressOf(Long userId, LocalDate date) {
		return this.jdbc.sql("""
				SELECT progress.daily_challenge_id, progress.progress
				FROM daily_challenge_progress progress
				JOIN daily_challenges challenge ON challenge.id = progress.daily_challenge_id
				WHERE progress.user_id = :userId AND challenge.challenge_date = :date
				""")
			.param("userId", userId)
			.param("date", date)
			.query((row, index) -> Map.entry(row.getLong("daily_challenge_id"), row.getInt("progress")))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	private static DailyChallenge toChallenge(ResultSet row, int index) throws SQLException {
		return new DailyChallenge(row.getLong("id"), row.getObject("challenge_date", LocalDate.class),
				row.getObject("game_id", Long.class), row.getString("activity"), row.getString("activity_name"),
				row.getString("title"), row.getString("description"), ChallengeGoal.valueOf(row.getString("goal")),
				row.getString("detail"), row.getInt("target"), row.getInt("xp_reward"), row.getInt("coin_reward"));
	}

	private static OffsetDateTime at(Instant instant) {
		return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
	}

}
