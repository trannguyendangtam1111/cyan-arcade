package com.cyan.arcade.leaderboard;

import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
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
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Leaderboards end to end: scores are recorded through the real session flow, then read back. */
@IntegrationTest
class LeaderboardApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	/** Only this class records scores for 2048, so its leaderboard is fully under the tests' control. */
	private static final String GAME = "2048";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void clearLeaderboard() {
		this.jdbc.update("DELETE FROM scores WHERE game_id = (SELECT id FROM games WHERE slug = ?)", GAME);
		this.jdbc.update("DELETE FROM game_sessions WHERE game_id = (SELECT id FROM games WHERE slug = ?)", GAME);
	}

	@Test
	void anEmptyLeaderboardHasNoEntries() throws Exception {
		leaderboard("").andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value(GAME))
			.andExpect(jsonPath("$.entries").isEmpty())
			.andExpect(jsonPath("$.page").value(0))
			.andExpect(jsonPath("$.size").value(10))
			.andExpect(jsonPath("$.totalEntries").value(0))
			.andExpect(jsonPath("$.totalPages").value(0))
			.andExpect(jsonPath("$.player").doesNotExist());
	}

	@Test
	void listsScoresBestFirstWithRanks() throws Exception {
		record(300, null);
		record(900, null);
		record(500, null);

		leaderboard("").andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[*].score", contains(900, 500, 300)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3)))
			.andExpect(jsonPath("$.entries[0].durationMs").isNumber())
			.andExpect(jsonPath("$.entries[0].achievedAt").exists())
			.andExpect(jsonPath("$.totalEntries").value(3));
	}

	@Test
	void equalScoresShareARankAndTheEarlierOneIsListedFirst() throws Exception {
		UUID first = UUID.randomUUID();
		record(700, first);
		record(700, UUID.randomUUID());
		record(100, null);

		leaderboard("", first).andExpect(jsonPath("$.entries[*].score", contains(700, 700, 100)))
			// Two players tied for first; the next score is third, not second.
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 1, 3)))
			.andExpect(jsonPath("$.entries[*].you", contains(true, false, false)));
	}

	@Test
	void splitsLongLeaderboardsIntoPages() throws Exception {
		for (int score = 100; score <= 1200; score += 100) {
			record(score, null);
		}

		leaderboard("?size=5").andExpect(jsonPath("$.entries[*].score", contains(1200, 1100, 1000, 900, 800)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3, 4, 5)))
			.andExpect(jsonPath("$.page").value(0))
			.andExpect(jsonPath("$.size").value(5))
			.andExpect(jsonPath("$.totalEntries").value(12))
			.andExpect(jsonPath("$.totalPages").value(3));

		// Ranks keep counting across pages.
		leaderboard("?size=5&page=2").andExpect(jsonPath("$.entries[*].score", contains(200, 100)))
			.andExpect(jsonPath("$.entries[*].rank", contains(11, 12)))
			.andExpect(jsonPath("$.page").value(2));

		leaderboard("?size=5&page=9").andExpect(status().isOk()).andExpect(jsonPath("$.entries").isEmpty());
	}

	@Test
	void showsTheCallersBestScoreAndRankAndMarksTheirEntries() throws Exception {
		UUID me = UUID.randomUUID();
		record(1000, UUID.randomUUID());
		record(400, me);
		record(800, me);
		record(600, null);

		leaderboard("", me).andExpect(jsonPath("$.entries[*].score", contains(1000, 800, 600, 400)))
			.andExpect(jsonPath("$.entries[*].you", contains(false, true, false, true)))
			.andExpect(jsonPath("$.player.bestScore").value(800))
			.andExpect(jsonPath("$.player.rank").value(2));
	}

	@Test
	void theCallersStandingIsReportedEvenWhenTheirScoreIsOnAnotherPage() throws Exception {
		UUID me = UUID.randomUUID();
		record(900, null);
		record(800, null);
		record(100, me);

		leaderboard("?size=2", me).andExpect(jsonPath("$.entries[*].you", everyItem(is(false))))
			.andExpect(jsonPath("$.player.bestScore").value(100))
			.andExpect(jsonPath("$.player.rank").value(3));
	}

	@Test
	void anUnknownCallerGetsNoStandingAndNoMarkedEntries() throws Exception {
		record(500, UUID.randomUUID());

		leaderboard("").andExpect(jsonPath("$.entries[0].you").value(false))
			.andExpect(jsonPath("$.player").doesNotExist());
		// A known caller who has not played this game yet has no standing either.
		leaderboard("", UUID.randomUUID()).andExpect(jsonPath("$.player").doesNotExist());
	}

	@Test
	void showsTheNameAndAvatarOfPlayersWithAnAccountAndNothingForGuests() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession session = Players.register(this.mockMvc, username);
		Players.play(this.mockMvc, session, GAME, 800);
		record(300, null);

		leaderboard("").andExpect(jsonPath("$.entries[0].player.username").value(username))
			.andExpect(jsonPath("$.entries[0].player.avatar").value("ROBOT"))
			.andExpect(jsonPath("$.entries[0].player.id").doesNotExist())
			.andExpect(jsonPath("$.entries[1].player").doesNotExist());
	}

	@Test
	void aSignedInPlayerIsRecognisedByTheirAccount() throws Exception {
		MockHttpSession me = Players.register(this.mockMvc);
		MockHttpSession someoneElse = Players.register(this.mockMvc);
		Players.play(this.mockMvc, someoneElse, GAME, 900);
		Players.play(this.mockMvc, me, GAME, 500);
		Players.play(this.mockMvc, me, GAME, 700);

		this.mockMvc.perform(get("/api/leaderboards/" + GAME).session(me))
			.andExpect(jsonPath("$.entries[*].score", contains(900, 700, 500)))
			.andExpect(jsonPath("$.entries[*].you", contains(false, true, true)))
			.andExpect(jsonPath("$.player.bestScore").value(700))
			.andExpect(jsonPath("$.player.rank").value(2));
		// Without the session the same scores are nobody's in particular.
		leaderboard("").andExpect(jsonPath("$.entries[*].you", everyItem(is(false))))
			.andExpect(jsonPath("$.player").doesNotExist());
	}

	@Test
	void peopleSharingABrowserAreToldApart() throws Exception {
		// One browser has one guest id, and sends it with every request, whoever is signed in.
		UUID browser = UUID.randomUUID();
		MockHttpSession me = Players.register(this.mockMvc);
		MockHttpSession sibling = Players.register(this.mockMvc);
		record(900, browser, sibling);
		record(700, browser, me);
		record(500, browser, null);

		// Signed in, only the account's own score is mine: not my sibling's, not the guest's.
		this.mockMvc.perform(get("/api/leaderboards/" + GAME).session(me).header(PLAYER_HEADER, browser))
			.andExpect(jsonPath("$.entries[*].score", contains(900, 700, 500)))
			.andExpect(jsonPath("$.entries[*].you", contains(false, true, false)))
			.andExpect(jsonPath("$.player.bestScore").value(700))
			.andExpect(jsonPath("$.player.rank").value(2));
		// Signed out, the browser is a guest again and the accounts' scores stay with the accounts.
		leaderboard("", browser).andExpect(jsonPath("$.entries[*].you", contains(false, false, true)))
			.andExpect(jsonPath("$.player.bestScore").value(500))
			.andExpect(jsonPath("$.player.rank").value(3));
	}

	@Test
	void neverRevealsPlayerIds() throws Exception {
		UUID someone = UUID.randomUUID();
		record(500, someone);

		String body = leaderboard("").andReturn().getResponse().getContentAsString();

		assertThat(body).doesNotContain(someone.toString()).doesNotContain("playerId");
	}

	@Test
	void keepsEachGamesLeaderboardSeparate() throws Exception {
		record(500, null);
		String snakeSession = JsonPath.read(this.mockMvc
			.perform(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"snake\"}"))
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
		this.mockMvc.perform(post("/api/game-sessions/{id}/finish", snakeSession).contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":77}"));

		leaderboard("").andExpect(jsonPath("$.entries[*].score", contains(500)));
	}

	@Test
	void anUnknownGameIsNotFound() throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/pong"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void rejectsInvalidPaging() throws Exception {
		leaderboard("?size=0").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("size"));
		leaderboard("?size=51").andExpect(status().isBadRequest());
		leaderboard("?page=-1").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("page"));
		leaderboard("?size=50").andExpect(status().isOk());
	}

	@Test
	void rejectsAMalformedPlayerId() throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/{game}", GAME).header(PLAYER_HEADER, "not-a-uuid"))
			.andExpect(status().isBadRequest());
	}

	private ResultActions leaderboard(String query) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/" + GAME + query));
	}

	private ResultActions leaderboard(String query, UUID playerId) throws Exception {
		return this.mockMvc.perform(get("/api/leaderboards/" + GAME + query).header(PLAYER_HEADER, playerId));
	}

	/** Plays a run to the end through the public API, optionally as a known guest. */
	private void record(int score, UUID playerId) throws Exception {
		record(score, playerId, null);
	}

	/** The same, from a browser where someone may be signed in. */
	private void record(int score, UUID playerId, MockHttpSession session) throws Exception {
		MockHttpServletRequestBuilder start = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"%s\"}".formatted(GAME));
		if (playerId != null) {
			start.header(PLAYER_HEADER, playerId);
		}
		if (session != null) {
			start.session(session);
		}
		String sessionId = JsonPath.read(
				this.mockMvc.perform(start).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
				"$.id");
		MockHttpServletRequestBuilder finish = post("/api/game-sessions/{id}/finish", sessionId)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d}".formatted(score));
		if (session != null) {
			finish.session(session);
		}
		this.mockMvc.perform(finish).andExpect(status().isOk());
	}

}
