package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.security.GuestPlayer;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tetris Ultra on the platform: started by name, judged by its own rules, ranked on a board of its
 * own, and paid what finishing a game earns only for a run whose two minutes ran out.
 */
@IntegrationTest
class TetrisUltraApiTests {

	private static final Duration FULL_RUN = Duration.ofSeconds(125);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	/** The Ultra board is this class's alone: every test starts it empty. */
	@BeforeEach
	void emptyTheUltraBoard() {
		String tetris = "(SELECT id FROM games WHERE slug = 'tetris')";
		this.jdbc.update("DELETE FROM scores WHERE mode = 'ultra' AND game_id = " + tetris);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode = 'ultra' AND game_id = " + tetris);
	}

	@Test
	void tetrisOffersClassicUltraSprintAndTheChallengeStages() throws Exception {
		this.mockMvc.perform(get("/api/games/tetris/modes"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].id", contains("classic", "ultra", "sprint", "challenge-1", "challenge-2", "challenge-3",
					"challenge-4", "challenge-5", "challenge-6")))
			.andExpect(jsonPath("$[1].name").value("Ultra"))
			.andExpect(jsonPath("$[1].ranked").value(true))
			.andExpect(jsonPath("$[1].order").value("DESC"))
			.andExpect(jsonPath("$[1].unit").value("POINTS"))
			.andExpect(jsonPath("$[1].maxScore").doesNotExist());
	}

	@Test
	void aFullRunIsRankedAndEarnsTheCompletionReward() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "ultra");
		playedFor(run, FULL_RUN);

		finish(run, 5000, TetrisUltraRunRulesTests.fullRun(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("ultra"))
			.andExpect(jsonPath("$.score").value(5000))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// What finishing a game earns, and nothing that is Classic's alone (bonus, achievements, challenges).
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		board("?mode=ultra", player).andExpect(jsonPath("$.myScore").value(5000)).andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void anEarlyTopOutIsRankedButEarnsNoCompletionReward() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "ultra");
		playedFor(run, Duration.ofSeconds(10));

		finish(run, 300, TetrisUltraRunRulesTests.toppedOut(), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("ultra"))
			.andExpect(jsonPath("$.rewards.xpEarned").value(0))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.achievements", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
		// Its score still stands on the board.
		board("?mode=ultra", player).andExpect(jsonPath("$.myScore").value(300));
	}

	@Test
	void aClassicRunIsRewardedAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		HonestRuns.playFor(run);

		// The first game ever: completion, a first best and the first-game achievement, as always.
		finish(run, 900, HonestRuns.detailsFor("tetris", 900, Map.of()), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
		// A Classic score is not an Ultra one.
		board("?mode=ultra", player).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void theUltraBoardRanksHighestFirstAndHoldsUltraRunsOnly() throws Exception {
		MockHttpSession high = Players.register(this.mockMvc);
		MockHttpSession low = Players.register(this.mockMvc);
		playFull(high, 4000);
		playFull(high, 6000);
		playFull(low, 5000);
		// A Classic run far above any of them stays on the Classic board.
		String classic = start(low, null);
		HonestRuns.playFor(classic);
		finish(classic, 9000, HonestRuns.detailsFor("tetris", 9000, Map.of()), low).andExpect(status().isOk());

		board("?mode=ultra", high).andExpect(jsonPath("$.mode").value("ultra"))
			.andExpect(jsonPath("$.order").value("DESC"))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.entries[*].score", contains(6000, 5000)))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=ultra", low).andExpect(jsonPath("$.myScore").value(5000));
		board("", low).andExpect(jsonPath("$.mode").value("classic")).andExpect(jsonPath("$.myScore").value(9000));
		board("", high).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void aFullRunWithNoPiecePlacedIsAcceptedAndCompletes() throws Exception {
		// One piece turned in place for the whole two minutes: legal, if pointless.
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "ultra");
		playedFor(run, FULL_RUN);

		finish(run, 0, TetrisUltraRunRulesTests.details(0, 0, 120_000, 1), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
	}

	@Test
	void aGuestsUltraRunIsRanked() throws Exception {
		UUID guest = UUID.randomUUID();
		String run = startAsGuest(guest);
		playedFor(run, FULL_RUN);

		this.mockMvc.perform(finishRequest(run, 5000, TetrisUltraRunRulesTests.fullRun()).header(GuestPlayer.HEADER, guest))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("ultra"));
		this.mockMvc.perform(get("/api/leaderboards/tetris?mode=ultra").header(GuestPlayer.HEADER, guest))
			.andExpect(jsonPath("$.myScore").value(5000));
	}

	@Test
	void anUltraRunWithClassicsDetailsAloneIsRefused() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, "ultra");
		playedFor(run, FULL_RUN);

		finish(run, 5000, Map.of("lines", 20, "level", 3, "pieces", 60), player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(ultraScores()).isZero();
	}

	@Test
	void impossibleUltraRunsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Map<String, Integer> full = TetrisUltraRunRulesTests.fullRun();

		// The time said to have run out early.
		refused(player, FULL_RUN, 300, withDetail(TetrisUltraRunRulesTests.toppedOut(), "timeUp", 1));
		// Game time of part steps, and beyond the limit.
		refused(player, FULL_RUN, 5000, withDetail(full, "gameMs", 119_990));
		refused(player, Duration.ofMinutes(4), 5000, withDetail(full, "gameMs", 180_000));
		// Two minutes of game time in a session of a minute.
		refused(player, Duration.ofMinutes(1), 5000, full);
		// Paused for two minutes, twice the allowance.
		refused(player, Duration.ofMinutes(4), 5000, full);
		// More lines than the pieces could clear.
		refused(player, FULL_RUN, 5000, withDetail(full, "pieces", 40));

		assertThat(ultraScores()).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
	}

	// --- Helpers --------------------------------------------------------------------------------------

	private void playFull(MockHttpSession player, int score) throws Exception {
		String run = start(player, "ultra");
		playedFor(run, FULL_RUN);
		finish(run, score, TetrisUltraRunRulesTests.fullRun(), player).andExpect(status().isOk());
	}

	private void refused(MockHttpSession player, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, "ultra");
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	private static Map<String, Integer> withDetail(Map<String, Integer> details, String key, int value) {
		Map<String, Integer> changed = new java.util.HashMap<>(details);
		changed.put(key, value);
		return changed;
	}

	/** @param mode the mode to start in, or {@code null} for none (Classic) */
	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"tetris\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"tetris\"}";
		String response = this.mockMvc
			.perform(post("/api/game-sessions").session(player).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value((mode != null) ? mode : "classic"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private String startAsGuest(UUID guest) throws Exception {
		String response = this.mockMvc
			.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, guest)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"tetris\",\"mode\":\"ultra\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private ResultActions finish(String run, int score, Map<String, Integer> details, MockHttpSession player)
			throws Exception {
		return this.mockMvc.perform(finishRequest(run, score, details).session(player));
	}

	private static MockHttpServletRequestBuilder finishRequest(String run, int score, Map<String, Integer> details) {
		return post("/api/game-sessions/{id}/finish", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details)));
	}

	/** Moves the run's start back by exactly this long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update(
				"UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toMillis() / 1000.0, run);
	}

	private ResultActions board(String query, MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/tetris" + query).session(player)).andExpect(status().isOk());
	}

	private int ultraScores() {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode = 'ultra' AND game_id = (SELECT id FROM games WHERE slug = 'tetris')",
				Integer.class);
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

}
