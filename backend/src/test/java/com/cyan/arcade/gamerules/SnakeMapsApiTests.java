package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

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
 * Snake's maps on the platform: started by name, judged by Snake's rules with each map's own highest
 * score, ranked on a board of their own, and paid what finishing a game earns, nothing Classic's alone.
 */
@IntegrationTest
class SnakeMapsApiTests {

	private static final Duration HALF_HOUR = Duration.ofMinutes(30);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Value("${app.rewards.rewarded-games-per-day}")
	private int gamesPaidPerDay;

	/** The map boards are this class's alone: every test starts them empty. */
	@BeforeEach
	void emptyTheMapBoards() {
		String snake = "(SELECT id FROM games WHERE slug = 'snake')";
		this.jdbc.update("DELETE FROM scores WHERE mode LIKE 'map-%' AND game_id = " + snake);
		this.jdbc.update("DELETE FROM game_sessions WHERE mode LIKE 'map-%' AND game_id = " + snake);
	}

	@Test
	void snakeOffersClassicThenTheThreeMaps() throws Exception {
		this.mockMvc.perform(get("/api/games/snake/modes"))
			.andExpect(status().isOk())
			// The six Adventure stages follow (SnakeAdventureApiTests).
			.andExpect(jsonPath("$[0:4].id", contains("classic", "map-pillars", "map-tunnels", "map-rooms")))
			.andExpect(jsonPath("$[0:4].name", contains("Classic", "Pillars", "Tunnels", "Rooms")))
			.andExpect(jsonPath("$[0:4].ranked", contains(true, true, true, true)))
			.andExpect(jsonPath("$[0:4].order", contains("DESC", "DESC", "DESC", "DESC")))
			.andExpect(jsonPath("$[0:4].unit", contains("POINTS", "POINTS", "POINTS", "POINTS")))
			// Limits stay on the server (237, 229 and 209: aMapTakesScoresUpToItsOwnHighestOnly).
			.andExpect(jsonPath("$[0].maxScore").doesNotExist())
			.andExpect(jsonPath("$[1].maxScore").doesNotExist())
			.andExpect(jsonPath("$[2].maxScore").doesNotExist())
			.andExpect(jsonPath("$[3].maxScore").doesNotExist());
	}

	@Test
	void aMapRunIsRankedAndEarnsTheCompletionRewardOnly() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, "map-pillars", 40).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("map-pillars"))
			.andExpect(jsonPath("$.score").value(40))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			// What finishing a game earns, and nothing that is Classic's alone (bonus, achievements, challenges).
			.andExpect(jsonPath("$.rewards.xpEarned").value(10))
			.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
			.andExpect(jsonPath("$.rewards.achievements", empty()))
			.andExpect(jsonPath("$.rewards.bonuses", empty()));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isZero();
		assertThat(coinTransactions(player, "ACHIEVEMENT")).isZero();
		board("?mode=map-pillars", player).andExpect(jsonPath("$.mode").value("map-pillars"))
			.andExpect(jsonPath("$.order").value("DESC"))
			.andExpect(jsonPath("$.myScore").value(40))
			.andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void eachMapHasABoardOfItsOwnRankedHighestFirstAndApartFromClassic() throws Exception {
		MockHttpSession high = Players.register(this.mockMvc);
		MockHttpSession low = Players.register(this.mockMvc);
		play(high, "map-rooms", 30).andExpect(status().isOk());
		play(high, "map-rooms", 60).andExpect(status().isOk());
		play(low, "map-rooms", 45).andExpect(status().isOk());
		play(low, "map-tunnels", 25).andExpect(status().isOk());
		// A Classic run far above any of them stays on the Classic board.
		play(low, null, 150).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("classic"));

		board("?mode=map-rooms", high).andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.entries[*].score", contains(60, 45)))
			.andExpect(jsonPath("$.myRank").value(1));
		board("?mode=map-tunnels", low).andExpect(jsonPath("$.totalEntries").value(1))
			.andExpect(jsonPath("$.myScore").value(25));
		board("?mode=map-tunnels", high).andExpect(jsonPath("$.myRank").value(nullValue()));
		board("?mode=map-pillars", low).andExpect(jsonPath("$.totalEntries").value(0));
		board("", low).andExpect(jsonPath("$.mode").value("classic")).andExpect(jsonPath("$.myScore").value(150));
		board("", high).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@ParameterizedTest
	@CsvSource({ "map-pillars, 237", "map-tunnels, 229", "map-rooms, 209" })
	void aMapTakesScoresUpToItsOwnHighestOnly(String mode, int highest) throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, mode, highest + 1).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(scoresIn(mode)).isZero();

		play(player, mode, highest).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(highest));
		assertThat(scoresIn(mode)).isEqualTo(1);
	}

	@Test
	void classicKeepsItsOwnHighestScore() throws Exception {
		// 250 is beyond every map, and still a Classic score (16x16 less the starting snake: 253).
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, null, 250).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("classic"));
		play(player, null, 254).andExpect(status().isBadRequest());
		play(player, "map-rooms", 250).andExpect(status().isBadRequest());
	}

	@Test
	void impossibleMapRunsAreRefusedAndRecordNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// Details that do not match the score: a length or a level for another score.
		refused(player, "map-pillars", HALF_HOUR, 20, Map.of("length", 22, "level", 5));
		refused(player, "map-tunnels", HALF_HOUR, 20, Map.of("length", 23, "level", 3));
		// Classic's details missing.
		refused(player, "map-rooms", HALF_HOUR, 20, Map.of("length", 23));
		// More apples than the snake can reach in the time: 5 s (plus 2 s) hold 100 moves, and 150 stays
		// out of reach however long the requests themselves take.
		refused(player, "map-pillars", Duration.ofSeconds(5), 150, SnakeMapsRunRulesTests.details(150));

		assertThat(scoresIn("map-pillars") + scoresIn("map-tunnels") + scoresIn("map-rooms")).isZero();
		assertThat(coinTransactions(player, "GAME_COMPLETION")).isZero();
	}

	@Test
	void mapRunsShareTheDailyLimitOfPaidGamesWithEveryOtherMode() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String[] maps = { "map-pillars", "map-tunnels", "map-rooms" };

		for (int game = 0; game < this.gamesPaidPerDay; game++) {
			play(player, maps[game % maps.length], game % 50).andExpect(status().isOk())
				.andExpect(jsonPath("$.rewards.coinsEarned").value(5))
				.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		}
		// Past it, no map run pays completion coins; the XP for finishing is still earned.
		play(player, "map-rooms", 7).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.coinsEarned").value(0))
			.andExpect(jsonPath("$.rewards.xpEarned").value(10));
		// Nor does a Classic one: the limit counts every mode together.
		play(player, null, 3).andExpect(status().isOk());

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(this.gamesPaidPerDay);
		// The one best-score bonus is that Classic run's first best; none of the map bests paid one.
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
	}

	@Test
	void aClassicRunIsRewardedAsBefore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		// The first game ever: completion, a first best and the first-game achievement, as always.
		play(player, null, 12).andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));

		assertThat(coinTransactions(player, "GAME_COMPLETION")).isEqualTo(1);
		assertThat(coinTransactions(player, "HIGH_SCORE")).isEqualTo(1);
		board("?mode=map-pillars", player).andExpect(jsonPath("$.myRank").value(nullValue()));
	}

	@Test
	void aMapRunIsNotTheFirstGameForTheAchievement() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		play(player, "map-tunnels", 5).andExpect(jsonPath("$.rewards.achievements", empty()));
		play(player, null, 5).andExpect(jsonPath("$.rewards.achievements[*].code", hasItem("FIRST_GAME")));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	/** An honest run of this score, played for half an hour, in the mode ({@code null}: none, Classic). */
	private ResultActions play(MockHttpSession player, String mode, int score) throws Exception {
		String run = start(player, mode);
		playedFor(run, HALF_HOUR);
		return finish(run, score, SnakeMapsRunRulesTests.details(score), player);
	}

	private void refused(MockHttpSession player, String mode, Duration played, int score, Map<String, Integer> details)
			throws Exception {
		String run = start(player, mode);
		playedFor(run, played);
		finish(run, score, details, player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	private String start(MockHttpSession player, String mode) throws Exception {
		String body = (mode != null) ? "{\"gameSlug\":\"snake\",\"mode\":\"%s\"}".formatted(mode)
				: "{\"gameSlug\":\"snake\"}";
		String response = this.mockMvc
			.perform(post("/api/game-sessions").session(player).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value((mode != null) ? mode : "classic"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(response, "$.id");
	}

	private ResultActions finish(String run, int score, Map<String, Integer> details, MockHttpSession player)
			throws Exception {
		return this.mockMvc.perform(post("/api/game-sessions/{id}/finish", run).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details))));
	}

	/** Moves the run's start back by exactly this long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update(
				"UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toMillis() / 1000.0, run);
	}

	private ResultActions board(String query, MockHttpSession player) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/snake" + query).session(player)).andExpect(status().isOk());
	}

	private int scoresIn(String mode) {
		return this.jdbc.queryForObject(
				"SELECT count(*) FROM scores WHERE mode = ? AND game_id = (SELECT id FROM games WHERE slug = 'snake')",
				Integer.class, mode);
	}

	private int coinTransactions(MockHttpSession player, String type) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = ?",
				Integer.class, Players.userId(this.mockMvc, player), type);
	}

}
