package com.cyan.arcade.score;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import javax.sql.DataSource;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Uses only IntegrationTest's disposable PostgreSQL, never the development datasource. */
@IntegrationTest
class ScoreResultRecoveryTests {

	@Autowired private MockMvc mvc;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private DataSource dataSource;
	@Autowired private GameSessionService sessions;
	@Autowired private Clock clock;

	@Test
	void retrievalReturnsTheOriginalRewardsIncludingAchievementsAndChallengeAfterLaterPlay() throws Exception {
		Long challenge = this.jdbc.queryForObject("""
				INSERT INTO daily_challenges
				(challenge_date, game_id, title, description, goal, target, xp_reward, coin_reward, created_at)
				SELECT ?, id, 'Recovery reward', 'Finish a run', 'PLAY', 1, 30, 60, now()
				FROM games WHERE slug = 'snake'
				RETURNING id
				""", Long.class, LocalDate.ofInstant(this.clock.instant(), ZoneOffset.UTC));
		try {
			MockHttpSession owner = Players.register(this.mvc);
			String id = Players.startGame(this.mvc, owner, "snake");
			String original = Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isOk())
				.andExpect(jsonPath("$.rewards.achievements[0].code").value("FIRST_GAME"))
				.andExpect(jsonPath("$.rewards.bonuses[0].title").value("Recovery reward"))
				.andExpect(jsonPath("$.rewards.bonuses[0].reference").doesNotExist())
				.andReturn().getResponse().getContentAsString();
			assertSameResult(original, result(owner, id));
			Players.play(this.mvc, owner, "snake", 8);
			List<Object> before = rewardsOf(Players.userId(this.mvc, owner));
			assertSameResult(original, result(owner, id));
			assertSameResult(original, result(owner, id));
			assertThat(rewardsOf(Players.userId(this.mvc, owner))).isEqualTo(before);
		}
		finally {
			this.jdbc.update("DELETE FROM daily_challenge_completions WHERE daily_challenge_id = ?", challenge);
			this.jdbc.update("DELETE FROM daily_challenges WHERE id = ?", challenge);
		}
	}

	@Test
	void aLostFinishResponseIsRecoveredWithoutPayingOrSubmittingAgain() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		Long user = Players.userId(this.mvc, owner);
		String id = Players.startGame(this.mvc, owner, "snake");
		String lost = Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		List<Object> before = rewardsOf(user);
		Players.finishGame(this.mvc, owner, id, 100, Map.of()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		assertSameResult(lost, result(owner, id));
		assertThat(rewardsOf(user)).isEqualTo(before);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid",
				Integer.class, id)).isEqualTo(1);
	}

	@Test
	void concurrentFinishAndRecoveryOnlyCommitOneResultAndOneSetOfRewards() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		Long user = Players.userId(this.mvc, owner);
		String id = Players.startGame(this.mvc, owner, "snake");
		HonestRuns.playFor(id);
		CountDownLatch go = new CountDownLatch(1);
		List<Future<Integer>> finishes = new ArrayList<>();
		List<Future<Integer>> reads = new ArrayList<>();
		try (var pool = Executors.newFixedThreadPool(12)) {
			for (int i = 0; i < 6; i++) {
				finishes.add(pool.submit(() -> {
					go.await();
					try {
						this.sessions.finish(UUID.fromString(id), 7, Map.of("length", 10, "level", 2), user, null);
						return 200;
					}
					catch (com.cyan.arcade.common.error.ConflictException ex) {
						return 409;
					}
				}));
				reads.add(pool.submit(() -> {
					go.await();
					var response = result(owner, id).andReturn().getResponse();
					if (response.getStatus() == 200) {
						assertThat(JsonPath.<Integer>read(response.getContentAsString(), "$.rewards.xpEarned"))
							.isEqualTo(85);
					}
					return response.getStatus();
				}));
			}
			go.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (var finish : finishes) statuses.add(finish.get());
			assertThat(statuses).containsOnlyOnce(200).filteredOn((value) -> value != 200).containsOnly(409);
			for (var read : reads) assertThat(read.get()).isIn(200, 409);
		}
		result(owner, id).andExpect(status().isOk()).andExpect(jsonPath("$.rewards.xpEarned").value(85))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(120));
		assertThat(rewardsOf(user)).isEqualTo(List.of(85, 120L, 1L, 3L, 1L, 0L));
	}

	@Test
	void onlyTheAuthenticatedAccountOwnerCanRetrieveAResult() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		String id = Players.startGame(this.mvc, owner, "snake");
		Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isOk());
		this.mvc.perform(get("/api/game-sessions/{id}/result", id)).andExpect(status().isUnauthorized());
		result(Players.register(this.mvc), id).andExpect(status().isNotFound());
		result(Players.signInAsAdmin(this.mvc), id).andExpect(status().isNotFound());
		result(owner, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		String unfinished = Players.startGame(this.mvc, owner, "snake");
		result(owner, unfinished).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_NOT_FINISHED"));
		result(Players.register(this.mvc), unfinished).andExpect(status().isNotFound());
	}

	@Test
	void guestIdentityCannotAuthorizeRecoveryEvenAfterSigningIn() throws Exception {
		String id = Players.startGame(this.mvc, null, "snake");
		Players.finishGame(this.mvc, null, id, 7, Map.of()).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards").isEmpty());
		this.mvc.perform(get("/api/game-sessions/{id}/result", id).header("X-Player-Id", UUID.randomUUID()))
			.andExpect(status().isUnauthorized());
		result(Players.register(this.mvc), id).andExpect(status().isNotFound());
	}

	@Test
	void legacyCompletedScoresReturnRecordedFieldsWithoutInventingRewards() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		String id = Players.startGame(this.mvc, owner, "snake");
		String original = Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		this.jdbc.update("UPDATE scores SET result_snapshot = NULL WHERE game_session_id = ?::uuid", id);
		List<Object> before = rewardsOf(Players.userId(this.mvc, owner));
		Map<String, Object> expected = JsonPath.read(original, "$");
		expected.put("rewards", null);
		// Legacy rows use PostgreSQL's stored (microsecond-precision) timestamp, not an invented snapshot.
		expected.put("recordedAt", this.jdbc.queryForObject(
				"SELECT created_at FROM scores WHERE game_session_id = ?::uuid", java.sql.Timestamp.class, id)
			.toInstant().toString());
		String recovered = result(owner, id).andExpect(status().isOk()).andExpect(jsonPath("$.rewards").isEmpty())
			.andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<Object>read(recovered, "$")).isEqualTo(expected);
		assertThat(rewardsOf(Players.userId(this.mvc, owner))).isEqualTo(before);
	}

	@Test
	void snapshotFailureRollsBackTheEntireFinish() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		Long user = Players.userId(this.mvc, owner);
		String id = Players.startGame(this.mvc, owner, "snake");
		// A score-local constraint rejects snapshot persistence after the rewards have been calculated.
		String constraint = "recovery_failure_" + UUID.randomUUID().toString().replace("-", "");
		this.jdbc.execute("ALTER TABLE scores ADD CONSTRAINT " + constraint
				+ " CHECK (game_session_id <> '" + id + "'::uuid OR result_snapshot IS NULL)");
		try {
			Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isInternalServerError());
			assertThat(rewardsOf(user)).isEqualTo(List.of(0, 0L, 0L, 0L, 0L, 0L));
			result(owner, id).andExpect(status().isConflict());
		}
		finally {
			this.jdbc.execute("ALTER TABLE scores DROP CONSTRAINT " + constraint);
		}
		Players.finishGame(this.mvc, owner, id, 7, Map.of()).andExpect(status().isOk());
		result(owner, id).andExpect(status().isOk());
	}

	@Test
	void migrationPreservesExistingScoresWithNoSnapshot() {
		String schema = "result_upgrade_" + UUID.randomUUID().toString().replace("-", "");
		try {
			Flyway.configure().dataSource(this.dataSource).schemas(schema).defaultSchema(schema).target("35").load().migrate();
			UUID id = UUID.randomUUID();
			this.jdbc.update("INSERT INTO " + schema + ".game_sessions (id, game_id, started_at, finished_at) "
					+ "SELECT ?, id, now(), now() FROM " + schema + ".games WHERE slug = 'snake'", id);
			this.jdbc.update("INSERT INTO " + schema + ".scores (game_session_id, game_id, score, duration_ms, created_at) "
					+ "SELECT id, game_id, 7, 5000, now() FROM " + schema + ".game_sessions WHERE id = ?", id);
			Flyway.configure().dataSource(this.dataSource).schemas(schema).defaultSchema(schema).load().migrate();
			assertThat(this.jdbc.queryForMap("SELECT score, result_snapshot FROM " + schema + ".scores WHERE game_session_id = ?", id))
				.containsEntry("score", 7).containsEntry("result_snapshot", null);
		}
		finally {
			this.jdbc.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
		}
	}

	private ResultActions result(MockHttpSession owner, String id) throws Exception {
		return this.mvc.perform(get("/api/game-sessions/{id}/result", id).session(owner));
	}

	private void assertSameResult(String original, ResultActions recovered) throws Exception {
		assertThat(JsonPath.<Object>read(recovered.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$"))
			.isEqualTo(JsonPath.<Object>read(original, "$"));
	}

	private List<Object> rewardsOf(Long user) {
		return List.of(this.jdbc.queryForObject("SELECT xp FROM users WHERE id = ?", Integer.class, user),
				this.jdbc.queryForObject("SELECT coalesce(sum(amount), 0) FROM coin_transactions WHERE user_id = ?", Long.class, user),
				this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE user_id = ?", Long.class, user),
				this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ?", Long.class, user),
				this.jdbc.queryForObject("SELECT count(*) FROM user_achievements WHERE user_id = ?", Long.class, user),
				this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions WHERE user_id = ?", Long.class, user));
	}
}
