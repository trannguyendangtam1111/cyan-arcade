package com.cyan.arcade.score;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What a client cannot make the server believe. Runs here are sent as raw requests, with exactly
 * the time and details under test: who may finish a run, how long it may stay open, what each
 * game's runs can look like, and that a refused or repeated run earns nothing and never reaches a
 * leaderboard.
 */
@IntegrationTest
class ScoreIntegrityTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	// --- Whose run it is -----------------------------------------------------------------------------

	@Test
	void onlyThePlayerWhoStartedARunCanFinishIt() throws Exception {
		MockHttpSession owner = Players.register(this.mockMvc);
		MockHttpSession someoneElse = Players.register(this.mockMvc);
		String run = start(owner, "snake", null);
		playedFor(run, Duration.ofMinutes(1));

		finish(run, 5, snake(5), someoneElse, null).andExpect(status().isForbidden());
		finish(run, 5, snake(5), null, null).andExpect(status().isForbidden());
		assertThat(scoreCount(run)).isZero();

		finish(run, 5, snake(5), owner, null).andExpect(status().isOk());
	}

	@Test
	void aGuestsRunNeedsTheBrowserThatStartedIt() throws Exception {
		UUID browser = UUID.randomUUID();
		String run = start(null, "snake", browser);
		playedFor(run, Duration.ofMinutes(1));

		// Knowing the run's id is not enough.
		finish(run, 6, snake(6), null, null).andExpect(status().isForbidden());
		finish(run, 6, snake(6), null, UUID.randomUUID()).andExpect(status().isForbidden());
		assertThat(scoreCount(run)).isZero();

		finish(run, 6, snake(6), null, browser).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		// Once is all: a guest's run cannot be finished twice either.
		finish(run, 60, snake(60), null, browser).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
		assertThat(scoreCount(run)).isEqualTo(1);
	}

	@Test
	void aRunLeftOpenTooLongCanNoLongerBeFinished() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "snake", null);
		playedFor(run, Duration.ofHours(25));

		finish(run, 3, snake(3), player, null).andExpect(status().isGone())
			.andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
		assertThat(scoreCount(run)).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
	}

	// --- What a run can look like --------------------------------------------------------------------

	@Test
	void honestRunsOfEveryGameAreAccepted() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// A full board of Snake, which takes at least 253 moves of 70 ms.
		String snake = start(player, "snake", null);
		playedFor(snake, Duration.ofSeconds(30));
		finish(snake, 253, snake(253), player, null).andExpect(status().isOk());

		// The 2048 tile after a thousand moves: a strong game, but a real one.
		String game2048 = start(player, "2048", null);
		playedFor(game2048, Duration.ofMinutes(8));
		finish(game2048, 20_480, "{\"highestTile\":2048,\"moves\":1000}", player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", org.hamcrest.Matchers.hasItem("REACH_2048")));

		// Forty lines of Tetris, many of them cleared several at a time.
		String tetris = start(player, "tetris", null);
		playedFor(tetris, Duration.ofMinutes(5));
		finish(tetris, 15_000, "{\"lines\":40,\"level\":5,\"pieces\":110}", player, null).andExpect(status().isOk());
	}

	@Test
	void aRunMissingItsGamesDetailsIsRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "tetris", null);
		playedFor(run, Duration.ofMinutes(5));

		finish(run, 1000, "{}", player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		finish(run, 1000, "{\"lines\":6,\"level\":1}", player, null).andExpect(status().isBadRequest());
		assertThat(scoreCount(run)).isZero();
	}

	@Test
	void detailsThatDoNotMatchTheScoreAreRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String snake = start(player, "snake", null);
		String game2048 = start(player, "2048", null);
		String tetris = start(player, "tetris", null);
		for (String run : List.of(snake, game2048, tetris)) {
			playedFor(run, Duration.ofMinutes(10));
		}

		// A snake longer than its apples make it.
		finish(snake, 20, "{\"length\":40,\"level\":5}", player, null).andExpect(status().isBadRequest());
		// The 2048 tile with no score to show for it: what would unlock the achievement for free.
		finish(game2048, 0, "{\"highestTile\":2048,\"moves\":5}", player, null).andExpect(status().isBadRequest());
		// No 2048 tile adds up to an odd score.
		finish(game2048, 1002, "{\"highestTile\":128,\"moves\":200}", player, null).andExpect(status().isBadRequest());
		// Forty lines are worth far more than 100 points, and need more than ten pieces.
		finish(tetris, 100, "{\"lines\":40,\"level\":5,\"pieces\":110}", player, null)
			.andExpect(status().isBadRequest());
		finish(tetris, 15_000, "{\"lines\":40,\"level\":5,\"pieces\":10}", player, null)
			.andExpect(status().isBadRequest());

		// Nothing was recorded, and nothing was earned: no XP, no coins, no achievement.
		for (String run : List.of(snake, game2048, tetris)) {
			assertThat(scoreCount(run)).isZero();
		}
		this.mockMvc.perform(get("/api/users/me").session(player))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.coins").value(0))
			.andExpect(jsonPath("$.achievementsUnlocked").value(0));
	}

	@Test
	void aScoreFasterThanTheGameCanBePlayedIsRejectedUntilEnoughTimeHasPassed() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "snake", null);

		// A hundred apples take at least a hundred moves of 70 ms: seven seconds, not one.
		playedFor(run, Duration.ofSeconds(1));
		finish(run, 100, snake(100), player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			// The player is told no, and nothing about why or where the line is.
			.andExpect(jsonPath("$.detail").value("Score submission rejected."))
			.andExpect(content().string(not(containsString("70"))));
		assertThat(scoreCount(run)).isZero();

		// The run stays open, and once it really could have been played it is accepted.
		playedFor(run, Duration.ofSeconds(7));
		finish(run, 100, snake(100), player, null).andExpect(status().isOk());
	}

	@Test
	void movesAndPiecesFasterThanAPersonCanPlayAreRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String game2048 = start(player, "2048", null);
		String tetris = start(player, "tetris", null);
		playedFor(game2048, Duration.ofSeconds(5));
		playedFor(tetris, Duration.ofSeconds(5));

		// The same runs as in honestRunsOfEveryGameAreAccepted, but in five seconds: a thousand moves,
		// a hundred and ten pieces.
		finish(game2048, 20_480, "{\"highestTile\":2048,\"moves\":1000}", player, null)
			.andExpect(status().isBadRequest());
		finish(tetris, 15_000, "{\"lines\":40,\"level\":5,\"pieces\":110}", player, null)
			.andExpect(status().isBadRequest());
		assertThat(scoreCount(game2048) + scoreCount(tetris)).isZero();
	}

	@Test
	void detailsAGameDoesNotReportAreIgnored() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "snake", null);
		playedFor(run, Duration.ofMinutes(1));

		// Snake has no lines: claiming forty must not unlock the Tetris "Marathon".
		finish(run, 2, "{\"length\":5,\"level\":1,\"lines\":40,\"highestTile\":2048}", player, null)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(org.hamcrest.Matchers.hasItem("TETRIS_40_LINES"))))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(org.hamcrest.Matchers.hasItem("REACH_2048"))));
	}

	@Test
	void anAdminsRunsAreCheckedLikeEveryoneElses() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		String run = start(admin, "snake", null);
		playedFor(run, Duration.ofSeconds(1));

		finish(run, 200, snake(200), admin, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(scoreCount(run)).isZero();
	}

	// --- Rewards, once ------------------------------------------------------------------------------

	@Test
	void aRepeatedSubmissionEarnsNothingMore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "snake", null);
		playedFor(run, Duration.ofMinutes(1));

		finish(run, 9, snake(9), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(true));
		// A retry after a lost answer, then the same run with a better score: both refused.
		finish(run, 9, snake(9), player, null).andExpect(status().isConflict());
		finish(run, 50, snake(50), player, null).andExpect(status().isConflict());

		assertThat(scoreCount(run)).isEqualTo(1);
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
		assertThat(coinTransactions(player, "ACHIEVEMENT")).isEqualTo(1);
		// 10 for the game, 25 for the best, 50 for "First Coin": once.
		this.mockMvc.perform(get("/api/users/me").session(player)).andExpect(jsonPath("$.xp").value(85));
	}

	@Test
	void simultaneousSubmissionsOfOneRunPayOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "snake", null);
		playedFor(run, Duration.ofMinutes(1));

		List<Integer> statuses = atOnce(8, () -> finish(run, 12, snake(12), player, null));
		assertThat(statuses).containsOnlyOnce(200);
		assertThat(scoreCount(run)).isEqualTo(1);
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
	}

	@Test
	void simultaneousRunsOfOnePlayerEarnOnlyTheBestsTheyReallySet() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		int[] scores = { 40, 120, 80, 100, 60, 110 };
		List<String> runs = new ArrayList<>();
		for (int score : scores) {
			String run = start(player, "snake", null);
			playedFor(run, Duration.ofMinutes(1));
			runs.add(run);
		}

		List<Integer> statuses = atOnce(runs.size(), new ArrayList<>(List.of(0, 1, 2, 3, 4, 5)), (index) -> finish(
				runs.get(index), scores[index], snake(scores[index]), player, null));
		assertThat(statuses).containsOnly(200);

		// Judged one at a time: in the order they were recorded, a run is a best exactly when it beats
		// every run recorded before it, and each best paid its coins once.
		List<Map<String, Object>> recorded = this.jdbc.queryForList(
				"SELECT score, personal_best FROM scores WHERE user_id = ? ORDER BY id", userId(player));
		int best = 0;
		int bests = 0;
		for (Map<String, Object> score : recorded) {
			boolean isBest = (Integer) score.get("score") > best;
			assertThat(score.get("personal_best")).as("score %s", score.get("score")).isEqualTo(isBest);
			if (isBest) {
				best = (Integer) score.get("score");
				bests++;
			}
		}
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(bests);
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(scores.length);
	}

	@Test
	void onlySoManyNewBestsADayPayCoins() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		// Twelve runs, each one apple better than the last: every one a new best.
		for (int score = 1; score <= 12; score++) {
			Players.play(this.mockMvc, player, "snake", score).andExpect(jsonPath("$.rewards.personalBest").value(true));
		}
		// The first ten paid their coins; the last two still counted as bests, for their XP.
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(10);
		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(jsonPath("$.entries[0].personalBest").value(true))
			.andExpect(jsonPath("$.entries[0].xpEarned").value(35));
	}

	// --- Leaderboards -------------------------------------------------------------------------------

	@Test
	void aRejectedRunNeverReachesALeaderboard() throws Exception {
		UUID browser = UUID.randomUUID();
		String cheat = start(null, "snake", browser);
		playedFor(cheat, Duration.ofSeconds(1));
		finish(cheat, 250, snake(250), null, browser).andExpect(status().isBadRequest());

		this.mockMvc.perform(get("/api/leaderboards/snake?period=DAILY").header(PLAYER_HEADER, browser))
			.andExpect(jsonPath("$.myRank").value(nullValue()));

		String honest = start(null, "snake", browser);
		playedFor(honest, Duration.ofMinutes(1));
		finish(honest, 4, snake(4), null, browser).andExpect(status().isOk());
		this.mockMvc.perform(get("/api/leaderboards/snake?period=DAILY").header(PLAYER_HEADER, browser))
			.andExpect(jsonPath("$.myScore").value(4));
	}

	// --- Helpers ------------------------------------------------------------------------------------

	/** Snake's details for a score, as the game reports them. */
	private static String snake(int score) {
		return HonestRuns.json(HonestRuns.detailsFor("snake", score, Map.of()));
	}

	private String start(MockHttpSession session, String gameSlug, UUID playerId) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"%s\"}".formatted(gameSlug));
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return JsonPath.read(this.mockMvc.perform(request).andExpect(status().isCreated()).andReturn().getResponse()
			.getContentAsString(), "$.id");
	}

	private ResultActions finish(String run, int score, String details, MockHttpSession session, UUID playerId)
			throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions/{id}/finish", run)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, details));
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return this.mockMvc.perform(request);
	}

	/** Moves a run's start back, as if it had been played for that much longer. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toSeconds(), run);
	}

	private int scoreCount(String run) {
		return this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid", Integer.class,
				run);
	}

	private Long userId(MockHttpSession session) throws Exception {
		return Players.userId(this.mockMvc, session);
	}

	private int coinTransactions(MockHttpSession session, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, userId(session), type);
	}

	@FunctionalInterface
	private interface Request {

		ResultActions send() throws Exception;

	}

	@FunctionalInterface
	private interface IndexedRequest {

		ResultActions send(int index) throws Exception;

	}

	private static List<Integer> atOnce(int times, Request request) throws Exception {
		List<Integer> indexes = new ArrayList<>();
		for (int i = 0; i < times; i++) {
			indexes.add(i);
		}
		return atOnce(times, indexes, (index) -> request.send());
	}

	/** Sends the requests from as many threads at the same moment, and returns their statuses. */
	private static List<Integer> atOnce(int threads, List<Integer> indexes, IndexedRequest request) throws Exception {
		CountDownLatch go = new CountDownLatch(1);
		List<Future<Integer>> responses = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
			for (int index : indexes) {
				responses.add(pool.submit(() -> {
					go.await();
					return request.send(index).andReturn().getResponse().getStatus();
				}));
			}
			go.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> response : responses) {
				statuses.add(response.get());
			}
			return statuses;
		}
	}

}
