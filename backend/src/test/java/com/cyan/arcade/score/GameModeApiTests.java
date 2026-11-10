package com.cyan.arcade.score;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.security.GuestPlayer;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The mode a run is played under: one its game's rules declare, chosen when it starts, Classic
 * unless the client names another, and carried unchanged to its score. Existing games retain Classic.
 */
@IntegrationTest
class GameModeApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void aRunStartedWithoutAModeIsClassic() throws Exception {
		String id = sessionIdOf(start("{\"gameSlug\":\"snake\"}", UUID.randomUUID()).andExpect(status().isCreated())
			.andExpect(jsonPath("$.gameSlug").value("snake"))
			.andExpect(jsonPath("$.mode").value("classic")));

		assertThat(storedSessionMode(id)).isEqualTo("classic");
	}

	@Test
	void aNullModeIsClassic() throws Exception {
		String id = sessionIdOf(start("{\"gameSlug\":\"snake\",\"mode\":null}", UUID.randomUUID())
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("classic")));

		assertThat(storedSessionMode(id)).isEqualTo("classic");
	}

	@Test
	void classicCanBeAskedForByName() throws Exception {
		String id = sessionIdOf(start("{\"gameSlug\":\"snake\",\"mode\":\"classic\"}", UUID.randomUUID())
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("classic")));

		assertThat(storedSessionMode(id)).isEqualTo("classic");
	}

	@ParameterizedTest
	@ValueSource(strings = { "ultra", "sprint", "expert", "no-guess-expert" })
	void aModeTheGameDoesNotHaveIsRefusedAndStartsNothing(String mode) throws Exception {
		UUID browser = UUID.randomUUID();

		start("{\"gameSlug\":\"snake\",\"mode\":\"%s\"}".formatted(mode), browser).andExpect(status().isBadRequest())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("UNKNOWN_MODE"))
			.andExpect(jsonPath("$.detail").value("Snake has no mode '" + mode + "'"));

		assertThat(sessionsOf(browser)).isZero();
	}

	@ParameterizedTest
	@ValueSource(strings = { "Classic", "CLASSIC", "", " ", "1v1", "-ultra", "ultra_mode", "ultra mode",
			"ultra'; drop table scores; --", "abcdefghijklmnopqrstuvwxy" })
	void aMalformedModeFailsValidationAndStartsNothing(String mode) throws Exception {
		UUID browser = UUID.randomUUID();

		start("{\"gameSlug\":\"snake\",\"mode\":\"%s\"}".formatted(mode), browser)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("mode"));

		assertThat(sessionsOf(browser)).isZero();
	}

	@Test
	void anUnscoredGameIsStillRefusedAsUnscoredWhateverTheMode() throws Exception {
		String unscored = this.jdbc.queryForObject(
				"SELECT slug FROM games WHERE active AND NOT scored ORDER BY id LIMIT 1", String.class);

		start("{\"gameSlug\":\"%s\",\"mode\":\"ultra\"}".formatted(unscored), UUID.randomUUID())
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("GAME_NOT_SCORED"));
	}

	@Test
	void theScoreKeepsTheModeItsSessionStartedWith() throws Exception {
		UUID browser = UUID.randomUUID();
		String id = sessionIdOf(start("{\"gameSlug\":\"snake\"}", browser));
		HonestRuns.playFor(id);
		String details = HonestRuns.json(HonestRuns.detailsFor("snake", 12, Map.of()));

		// A mode sent with the score is not the client's to choose: the session's stands.
		this.mockMvc
			.perform(post("/api/game-sessions/{id}/finish", id).header(GuestPlayer.HEADER, browser.toString())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"score\":12,\"details\":%s,\"mode\":\"ultra\"}".formatted(details)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("classic"))
			.andExpect(jsonPath("$.score").value(12));

		assertThat(this.jdbc.queryForObject("SELECT mode FROM scores WHERE game_session_id = ?::uuid", String.class,
				id))
			.isEqualTo("classic");
	}

	@Test
	void aScoreIsRecordedUnderItsSessionsModeWhateverThatIs() {
		// Only Classic can be started through the API for now; the copy itself does not depend on that.
		GameSession session = GameSession.start(1L, null, UUID.randomUUID(), "some-later-mode", Instant.EPOCH);

		Score score = new Score(session, 7, 1_000, 0, false, Instant.EPOCH.plusSeconds(1));

		assertThat(score.getMode()).isEqualTo("some-later-mode");
	}

	@Test
	void aPlayersHistoryShowsTheModeOfEachRun() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Players.play(this.mockMvc, player, "snake", 4).andExpect(jsonPath("$.mode").value("classic"));

		this.mockMvc.perform(get("/api/users/me/game-history").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[0].gameSlug").value("snake"))
			.andExpect(jsonPath("$.entries[0].mode").value("classic"));
	}

	// --- Which modes a game offers ---------------------------------------------------------------------

	@Test
	void everyScoredGameInTheCatalogOffersClassicFirst() throws Exception {
		List<String> catalog = this.jdbc.queryForList("SELECT slug FROM games WHERE active AND scored ORDER BY slug",
				String.class);
		assertThat(catalog).isNotEmpty();

		for (String slug : catalog) {
			this.mockMvc.perform(get("/api/games/{slug}/modes", slug))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(slug.equals("2048") ? 9 : 1))
				.andExpect(jsonPath("$[0].id").value("classic"))
				.andExpect(jsonPath("$[0].name").value("Classic"))
				.andExpect(jsonPath("$[0].ranked").value(true))
				.andExpect(jsonPath("$[0].order").value("DESC"))
				.andExpect(jsonPath("$[0].unit").value("POINTS"))
				// Limits stay on the server.
				.andExpect(jsonPath("$[0].maxScore").doesNotExist());
		}
	}

	@Test
	void aGameWhoseRunsAreNotScoredOffersNoModes() throws Exception {
		String unscored = this.jdbc.queryForObject(
				"SELECT slug FROM games WHERE active AND NOT scored ORDER BY id LIMIT 1", String.class);

		this.mockMvc.perform(get("/api/games/{slug}/modes", unscored))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void theModesOfAnUnknownGameAreNotFound() throws Exception {
		this.mockMvc.perform(get("/api/games/{slug}/modes", "pong"))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	private ResultActions start(String body, UUID browser) throws Exception {
		return this.mockMvc.perform(post("/api/game-sessions").header(GuestPlayer.HEADER, browser.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	private static String sessionIdOf(ResultActions started) throws Exception {
		return JsonPath.read(started.andReturn().getResponse().getContentAsString(), "$.id");
	}

	private String storedSessionMode(String sessionId) {
		return this.jdbc.queryForObject("SELECT mode FROM game_sessions WHERE id = ?::uuid", String.class, sessionId);
	}

	private int sessionsOf(UUID browser) {
		return this.jdbc.queryForObject("SELECT count(*) FROM game_sessions WHERE player_id = ?", Integer.class,
				browser);
	}

}
