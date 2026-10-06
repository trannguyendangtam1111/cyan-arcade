package com.cyan.arcade.leaderboard;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.game.GameService;
import com.cyan.arcade.leaderboard.LeaderboardPeriod.Window;
import com.cyan.arcade.score.ScoreQueries;
import com.cyan.arcade.user.UserService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Leaderboards end to end: scores are recorded through the real session flow (or, for exact
 * moments, written as the score flow writes them), then read back for a game and a period.
 */
@IntegrationTest
class LeaderboardApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	/** Only this class ranks scores of 2048, and clears them first, so its board is under the tests' control. */
	private static final String GAME = "2048";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private GameService games;

	@Autowired
	private ScoreQueries scores;

	@Autowired
	private UserService users;

	@BeforeEach
	void clearLeaderboard() {
		this.jdbc.update("DELETE FROM scores WHERE game_id = (SELECT id FROM games WHERE slug = ?)", GAME);
		this.jdbc.update("DELETE FROM game_sessions WHERE game_id = (SELECT id FROM games WHERE slug = ?)", GAME);
	}

	// --- The board -----------------------------------------------------------------------------------

	@Test
	void anEmptyLeaderboardHasNoEntriesAndNobodysRank() throws Exception {
		leaderboard("").andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value(GAME))
			.andExpect(jsonPath("$.period").value("ALL_TIME"))
			.andExpect(jsonPath("$.periodStart").value(nullValue()))
			.andExpect(jsonPath("$.periodEnd").value(nullValue()))
			.andExpect(jsonPath("$.entries").isEmpty())
			.andExpect(jsonPath("$.page").value(0))
			.andExpect(jsonPath("$.size").value(20))
			.andExpect(jsonPath("$.totalEntries").value(0))
			.andExpect(jsonPath("$.totalPages").value(0))
			.andExpect(jsonPath("$.myRank").value(nullValue()))
			.andExpect(jsonPath("$.myScore").value(nullValue()));
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
	void eachPlayerIsListedOnceWithTheirBestScore() throws Exception {
		MockHttpSession me = Players.register(this.mockMvc);
		Players.play(this.mockMvc, me, GAME, 400);
		Players.play(this.mockMvc, me, GAME, 800);
		Players.play(this.mockMvc, me, GAME, 600);
		record(700, null);

		this.mockMvc.perform(get("/api/leaderboards/" + GAME).session(me))
			.andExpect(jsonPath("$.entries[*].score", contains(800, 700)))
			.andExpect(jsonPath("$.entries[*].you", contains(true, false)))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.myRank").value(1))
			.andExpect(jsonPath("$.myScore").value(800));
	}

	@Test
	void tiesAreRankedByWhoSetTheScoreFirstWithoutSharingARank() throws Exception {
		UUID first = UUID.randomUUID();
		UUID second = UUID.randomUUID();
		record(700, first);
		record(700, second);
		record(100, null);

		leaderboard("", first).andExpect(jsonPath("$.entries[*].score", contains(700, 700, 100)))
			.andExpect(jsonPath("$.entries[*].rank", contains(1, 2, 3)))
			.andExpect(jsonPath("$.entries[*].you", contains(true, false, false)))
			.andExpect(jsonPath("$.myRank").value(1));
		leaderboard("", second).andExpect(jsonPath("$.myRank").value(2)).andExpect(jsonPath("$.myScore").value(700));
	}

	@Test
	void tiesAtTheSameMomentAreRankedByTheScoresIdSoTheOrderNeverChanges() throws Exception {
		Instant moment = Instant.now().minusSeconds(5);
		for (int player = 0; player < 3; player++) {
			insertScore(500, moment, null, UUID.randomUUID());
		}

		for (int attempt = 0; attempt < 3; attempt++) {
			String body = leaderboard("").andReturn().getResponse().getContentAsString();
			assertThat(JsonPath.<List<Integer>>read(body, "$.entries[*].rank")).containsExactly(1, 2, 3);
		}
		// Page by page, the same three in the same order, nobody twice and nobody missing.
		String first = leaderboard("?size=2").andReturn().getResponse().getContentAsString();
		String second = leaderboard("?size=2&page=1").andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<Integer>>read(first, "$.entries[*].rank")).containsExactly(1, 2);
		assertThat(JsonPath.<List<Integer>>read(second, "$.entries[*].rank")).containsExactly(3);
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
		leaderboard("?size=5&page=1").andExpect(jsonPath("$.entries[*].rank", contains(6, 7, 8, 9, 10)));
		leaderboard("?size=5&page=2").andExpect(jsonPath("$.entries[*].score", contains(200, 100)))
			.andExpect(jsonPath("$.entries[*].rank", contains(11, 12)))
			.andExpect(jsonPath("$.page").value(2));

		leaderboard("?size=5&page=9").andExpect(status().isOk()).andExpect(jsonPath("$.entries").isEmpty());
	}

	// --- The caller ----------------------------------------------------------------------------------

	@Test
	void theCallersRankIsReportedEvenWhenTheirScoreIsOnAnotherPage() throws Exception {
		UUID me = UUID.randomUUID();
		record(900, null);
		record(800, null);
		record(100, me);

		leaderboard("?size=2", me).andExpect(jsonPath("$.entries[*].you", everyItem(is(false))))
			.andExpect(jsonPath("$.myScore").value(100))
			.andExpect(jsonPath("$.myRank").value(3));
	}

	@Test
	void anUnknownCallerOrOneWithoutAScoreGetsNoRank() throws Exception {
		record(500, UUID.randomUUID());

		leaderboard("").andExpect(jsonPath("$.entries[0].you").value(false))
			.andExpect(jsonPath("$.myRank").value(nullValue()))
			.andExpect(jsonPath("$.myScore").value(nullValue()));
		leaderboard("", UUID.randomUUID()).andExpect(jsonPath("$.myRank").value(nullValue()));
		this.mockMvc.perform(get("/api/leaderboards/" + GAME).session(Players.register(this.mockMvc)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.myRank").value(nullValue()))
			.andExpect(jsonPath("$.myScore").value(nullValue()));
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
			.andExpect(jsonPath("$.myScore").value(700))
			.andExpect(jsonPath("$.myRank").value(2));
		// Signed out, the browser is a guest again and the accounts' scores stay with the accounts.
		leaderboard("", browser).andExpect(jsonPath("$.entries[*].you", contains(false, false, true)))
			.andExpect(jsonPath("$.myScore").value(500))
			.andExpect(jsonPath("$.myRank").value(3));
	}

	@Test
	void neverRevealsPlayerIds() throws Exception {
		UUID someone = UUID.randomUUID();
		record(500, someone);

		String body = leaderboard("").andReturn().getResponse().getContentAsString();

		assertThat(body).doesNotContain(someone.toString()).doesNotContain("playerId").doesNotContain("userId");
	}

	// --- Periods -------------------------------------------------------------------------------------

	@Test
	void eachPeriodCountsOnlyItsOwnScoresWithTheBoundariesTheServerChose() throws Exception {
		Instant now = Instant.now();
		Window day = LeaderboardPeriod.DAILY.windowAt(now);
		Window week = LeaderboardPeriod.WEEKLY.windowAt(now);
		insertScore(100, day.start(), null, UUID.randomUUID());
		insertScore(200, day.start().minusMillis(1), null, UUID.randomUUID());
		insertScore(300, week.start(), null, UUID.randomUUID());
		insertScore(400, week.start().minusMillis(1), null, UUID.randomUUID());
		// Today's first moment counts today; the moment before it does not. The same for the week.
		boolean weekStartsToday = week.start().equals(day.start());

		leaderboard("?period=DAILY").andExpect(jsonPath("$.period").value("DAILY"))
			.andExpect(jsonPath("$.periodStart").value(day.start().toString()))
			.andExpect(jsonPath("$.periodEnd").value(day.end().toString()))
			.andExpect(jsonPath("$.entries[*].score", weekStartsToday ? contains(300, 100) : contains(100)));
		leaderboard("?period=WEEKLY").andExpect(jsonPath("$.periodStart").value(week.start().toString()))
			.andExpect(jsonPath("$.periodEnd").value(week.end().toString()))
			.andExpect(jsonPath("$.entries[*].score", weekStartsToday ? contains(300, 100) : contains(300, 200, 100)));
		leaderboard("?period=ALL_TIME").andExpect(jsonPath("$.entries[*].score", contains(400, 300, 200, 100)));
		// Without a period the board is the all-time one.
		leaderboard("").andExpect(jsonPath("$.totalEntries").value(4));
	}

	@Test
	void aPlayersBestInAPeriodIsTheirBestInThatPeriodOnly() throws Exception {
		MockHttpSession me = Players.register(this.mockMvc);
		Long myId = Players.userId(this.mockMvc, me);
		Window week = LeaderboardPeriod.WEEKLY.windowAt(Instant.now());
		insertScore(5000, week.start().minus(Duration.ofDays(3)), myId, null);
		Players.play(this.mockMvc, me, GAME, 1200);
		record(1500, null);

		this.mockMvc.perform(get("/api/leaderboards/{game}?period=WEEKLY", GAME).session(me))
			.andExpect(jsonPath("$.entries[*].score", contains(1500, 1200)))
			.andExpect(jsonPath("$.myScore").value(1200))
			.andExpect(jsonPath("$.myRank").value(2));
		this.mockMvc.perform(get("/api/leaderboards/{game}?period=ALL_TIME", GAME).session(me))
			.andExpect(jsonPath("$.entries[*].score", contains(5000, 1500)))
			.andExpect(jsonPath("$.myScore").value(5000))
			.andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void aPlayerWithNoScoreThisPeriodHasNoRankInIt() throws Exception {
		MockHttpSession me = Players.register(this.mockMvc);
		Long myId = Players.userId(this.mockMvc, me);
		insertScore(900, LeaderboardPeriod.WEEKLY.windowAt(Instant.now()).start().minus(Duration.ofDays(1)), myId, null);

		this.mockMvc.perform(get("/api/leaderboards/{game}?period=DAILY", GAME).session(me))
			.andExpect(jsonPath("$.myRank").value(nullValue()))
			.andExpect(jsonPath("$.myScore").value(nullValue()));
		this.mockMvc.perform(get("/api/leaderboards/{game}?period=WEEKLY", GAME).session(me))
			.andExpect(jsonPath("$.myRank").value(nullValue()));
		this.mockMvc.perform(get("/api/leaderboards/{game}?period=ALL_TIME", GAME).session(me))
			.andExpect(jsonPath("$.myRank").value(1));
	}

	@Test
	void atMidnightUtcTheDayChangesAndAtMondaysTheWeek() {
		// 2029-12-31 is a Monday: one second either side of midnight is a new day, week and year.
		Instant sunday = Instant.parse("2029-12-30T23:59:59Z");
		Instant monday = Instant.parse("2029-12-31T00:00:00Z");
		Instant newYear = Instant.parse("2030-01-01T00:00:00Z");
		insertScore(100, sunday, null, UUID.randomUUID());
		insertScore(200, monday, null, UUID.randomUUID());
		insertScore(300, newYear, null, UUID.randomUUID());

		// Late on Sunday (and in Vietnam, UTC+7, already Monday morning): Sunday's day and week.
		assertThat(scoresOn(Instant.parse("2029-12-30T23:59:59.999Z"), LeaderboardPeriod.DAILY)).containsExactly(100);
		assertThat(scoresOn(Instant.parse("2029-12-30T23:59:59.999Z"), LeaderboardPeriod.WEEKLY)).containsExactly(100);
		// Monday 00:00 UTC: a new day and a new week, so Sunday's score is in neither (the week also
		// holds the score set on New Year's Day, later that same week).
		assertThat(scoresOn(monday, LeaderboardPeriod.DAILY)).containsExactly(200);
		assertThat(scoresOn(monday, LeaderboardPeriod.WEEKLY)).containsExactly(300, 200);
		// A new year in the middle of a week: a new day, the same week.
		assertThat(scoresOn(newYear, LeaderboardPeriod.DAILY)).containsExactly(300);
		assertThat(scoresOn(newYear, LeaderboardPeriod.WEEKLY)).containsExactly(300, 200);
		assertThat(scoresOn(newYear, LeaderboardPeriod.ALL_TIME)).containsExactly(300, 200, 100);
	}

	@ParameterizedTest
	@ValueSource(strings = { "snake", "2048", "tetris" })
	void everyGameHasItsBoards(String game) throws Exception {
		for (String period : new String[] { "DAILY", "WEEKLY", "ALL_TIME" }) {
			this.mockMvc.perform(get("/api/leaderboards/{game}?period={period}", game, period))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.gameSlug").value(game))
				.andExpect(jsonPath("$.period").value(period));
		}
	}

	@Test
	void keepsEachGamesLeaderboardSeparate() throws Exception {
		record(500, null);
		Players.play(this.mockMvc, null, "snake", 77);

		leaderboard("").andExpect(jsonPath("$.entries[*].score", contains(500)));
		leaderboard("?period=DAILY").andExpect(jsonPath("$.entries[*].score", contains(500)));
	}

	// --- On the profile ------------------------------------------------------------------------------

	@Test
	void aPlayersProfileShowsTheirRanksInEveryGameAndPeriod() throws Exception {
		MockHttpSession me = Players.register(this.mockMvc);
		Long myId = Players.userId(this.mockMvc, me);
		record(3000, null);
		Players.play(this.mockMvc, me, GAME, 1000);
		insertScore(5000, LeaderboardPeriod.WEEKLY.windowAt(Instant.now()).start().minus(Duration.ofDays(2)), myId, null);

		this.mockMvc.perform(get("/api/users/me/ranks").session(me))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.games[*].game.slug", contains("snake", "2048", "tetris", "minesweeper")))
			// This week 3,000 beats my 1,000; of all time my older 5,000 is the best.
			.andExpect(jsonPath("$.games[1].daily.rank").value(2))
			.andExpect(jsonPath("$.games[1].daily.score").value(1000))
			.andExpect(jsonPath("$.games[1].weekly.rank").value(2))
			.andExpect(jsonPath("$.games[1].allTime.rank").value(1))
			.andExpect(jsonPath("$.games[1].allTime.score").value(5000))
			// No scores in the other games: no ranks, none made up.
			.andExpect(jsonPath("$.games[0].allTime").value(nullValue()))
			.andExpect(jsonPath("$.games[2].daily").value(nullValue()))
			.andExpect(jsonPath("$.bestRank").value(1))
			.andExpect(jsonPath("$.bestRankGame.slug").value(GAME));
	}

	@Test
	void aPlayerWithoutScoresHasNoRanksAndGuestsHaveNoProfile() throws Exception {
		this.mockMvc.perform(get("/api/users/me/ranks").session(Players.register(this.mockMvc)))
			.andExpect(jsonPath("$.bestRank").value(nullValue()))
			.andExpect(jsonPath("$.games[*].allTime", everyItem(nullValue())));
		this.mockMvc.perform(get("/api/users/me/ranks")).andExpect(status().isUnauthorized());
	}

	// --- What is refused -----------------------------------------------------------------------------

	@Test
	void anUnknownGameIsNotFound() throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/pong"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "MONTHLY", "daily", "week", "1" })
	void anUnknownPeriodIsRejected(String period) throws Exception {
		leaderboard("?period=" + period).andExpect(status().isBadRequest());
	}

	@Test
	void rejectsInvalidPaging() throws Exception {
		leaderboard("?size=0").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("size"));
		leaderboard("?size=101").andExpect(status().isBadRequest());
		leaderboard("?page=-1").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("page"));
		leaderboard("?size=100").andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100));
	}

	@Test
	void rejectsAMalformedPlayerId() throws Exception {
		this.mockMvc.perform(get("/api/leaderboards/{game}", GAME).header(PLAYER_HEADER, "not-a-uuid"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void theBoardIsReadOnly() throws Exception {
		for (MockHttpServletRequestBuilder write : new MockHttpServletRequestBuilder[] {
				post("/api/leaderboards/" + GAME), put("/api/leaderboards/" + GAME), delete("/api/leaderboards/" + GAME) }) {
			int status = this.mockMvc
				.perform(write.session(Players.signInAsAdmin(this.mockMvc)).contentType(MediaType.APPLICATION_JSON)
					.content("{\"rank\":1,\"score\":999999}"))
				.andReturn()
				.getResponse()
				.getStatus();
			assertThat(status).isIn(405, 404);
		}
		leaderboard("").andExpect(jsonPath("$.entries").isEmpty());
	}

	/** The scores on a period's board as the service would build it at a moment of the test's choosing. */
	private List<Integer> scoresOn(Instant now, LeaderboardPeriod period) {
		LeaderboardService atThatMoment = new LeaderboardService(this.games, this.scores, this.users,
				Clock.fixed(now, ZoneOffset.UTC));
		return atThatMoment.leaderboard(GAME, period, 0, 100, null, null)
			.entries()
			.stream()
			.map(LeaderboardResponse.Entry::score)
			.toList();
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
		// Finished as the game would: after a while, with its details, from the browser that started it.
		HonestRuns.playFor(sessionId);
		MockHttpServletRequestBuilder finish = post("/api/game-sessions/{id}/finish", sessionId)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score,
					HonestRuns.json(HonestRuns.detailsFor(GAME, score, Map.of()))));
		if (playerId != null) {
			finish.header(PLAYER_HEADER, playerId);
		}
		if (session != null) {
			finish.session(session);
		}
		this.mockMvc.perform(finish).andExpect(status().isOk());
	}

	/**
	 * A finished run at an exact moment, written as the score flow writes it. Only the time is out
	 * of reach of the API, which always uses the server's clock.
	 * @return the score's id
	 */
	private long insertScore(int score, Instant at, Long userId, UUID playerId) {
		UUID session = UUID.randomUUID();
		OffsetDateTime when = OffsetDateTime.ofInstant(at, ZoneOffset.UTC);
		this.jdbc.update("""
				INSERT INTO game_sessions (id, game_id, user_id, player_id, started_at, finished_at)
				VALUES (?, (SELECT id FROM games WHERE slug = ?), ?, ?, ?, ?)
				""", session, GAME, userId, playerId, when.minusMinutes(1), when);
		return this.jdbc.queryForObject("""
				INSERT INTO scores (game_session_id, game_id, user_id, player_id, score, duration_ms, created_at)
				VALUES (?, (SELECT id FROM games WHERE slug = ?), ?, ?, ?, 60000, ?)
				RETURNING id
				""", Long.class, session, GAME, userId, playerId, score, when);
	}

}
