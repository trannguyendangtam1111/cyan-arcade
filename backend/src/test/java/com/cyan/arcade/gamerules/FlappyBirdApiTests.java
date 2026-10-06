package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.UUID;

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
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Flappy Bird on the platform: a catalog row and a {@link com.cyan.arcade.score.RunRules} bean are
 * all it brings to the server, and sessions, scores, every leaderboard period, rewards,
 * achievements and statistics work for it as they do for every game.
 */
@IntegrationTest
class FlappyBirdApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void flappyBirdIsInTheCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games/flappy-bird"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Flappy Bird"))
			.andExpect(jsonPath("$.category").value("ARCADE"))
			.andExpect(jsonPath("$.thumbnailUrl").value("/thumbnails/flappy-bird.svg"));
		this.mockMvc.perform(get("/api/games")).andExpect(jsonPath("$[*].slug", hasItem("flappy-bird")));
	}

	@Test
	void aFlightIsRecordedRankedAndRewarded() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(20));

		finish(run, 10, flight(10, 28, 18_000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("flappy-bird"))
			.andExpect(jsonPath("$.score").value(10))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItems("FLAPPY_FIRST_FLIGHT", "FLAPPY_10")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("FLAPPY_25"))));

		for (String period : new String[] { "DAILY", "WEEKLY", "ALL_TIME" }) {
			this.mockMvc.perform(get("/api/leaderboards/flappy-bird?period={period}&size=100", period).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myScore").value(10));
		}
		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.games[?(@.slug == 'flappy-bird')].bestScore", hasItem(10)))
			.andExpect(jsonPath("$.games[?(@.slug == 'flappy-bird')].gamesPlayed", hasItem(1)));

		// A shorter flight later is no new best.
		String second = start(player, null);
		playedFor(second, Duration.ofSeconds(5));
		finish(second, 1, flight(1, 5, 3_500), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(false));
	}

	@Test
	void aMinuteInTheAirIsUntouchable() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(65));

		// 41 pipes take a little over 61 seconds.
		finish(run, 41, flight(41, 110, 61_200), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItems("FLAPPY_UNTOUCHABLE", "FLAPPY_25")));
	}

	@Test
	void anImpossibleFlightIsRejectedWithoutSayingWhyAndEarnsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(20));

		// Fifty pipes in eighteen seconds.
		finish(run, 50, flight(50, 28, 18_000), player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			.andExpect(content().string(not(org.hamcrest.Matchers.containsString("pipes"))))
			.andExpect(content().string(not(org.hamcrest.Matchers.containsString("flight"))));
		// Another game's details.
		finish(run, 10, "{\"length\":13,\"level\":3}", player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// A flight claiming a minute in a session open for twenty seconds.
		finish(run, 41, flight(41, 110, 61_200), player, null).andExpect(status().isBadRequest());

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid",
				Integer.class, run)).isZero();
		this.mockMvc.perform(get("/api/users/me").session(player))
			.andExpect(jsonPath("$.xp").value(0))
			.andExpect(jsonPath("$.coins").value(0));

		// The honest result of the same run is still accepted.
		finish(run, 10, flight(10, 28, 18_000), player, null).andExpect(status().isOk());
	}

	@Test
	void aGuestFliesAsForAnyGameAndOnlyTheirBrowserCanFinish() throws Exception {
		UUID browser = UUID.randomUUID();
		String run = start(null, browser);
		playedFor(run, Duration.ofSeconds(10));

		finish(run, 3, flight(3, 12, 7_000), null, UUID.randomUUID()).andExpect(status().isForbidden());
		finish(run, 3, flight(3, 12, 7_000), null, browser).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards").value(nullValue()));
		finish(run, 3, flight(3, 12, 7_000), null, browser).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
	}

	@Test
	void aSessionThatDoesNotExistCannotBeFinished() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		finish(UUID.randomUUID().toString(), 3, flight(3, 12, 7_000), player, null).andExpect(status().isNotFound());
	}

	// --- Helpers ------------------------------------------------------------------------------------

	/** A flight's details, as the game reports them. */
	private static String flight(int pipes, int flaps, int flightMs) {
		return "{\"pipes\":%d,\"flaps\":%d,\"flightMs\":%d,\"seconds\":%d,\"level\":%d,\"seed\":424242}".formatted(pipes,
				flaps, flightMs, flightMs / 1000, FlappyBirdRunRules.levelFor(pipes).level());
	}

	private String start(MockHttpSession session, UUID playerId) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"flappy-bird\"}");
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return JsonPath.read(this.mockMvc.perform(request)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.gameSlug").value("flappy-bird"))
			.andReturn()
			.getResponse()
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

	/** Moves a run's start back, as if it had been played for that long. */
	private void playedFor(String run, Duration duration) {
		this.jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toSeconds(), run);
	}

}
