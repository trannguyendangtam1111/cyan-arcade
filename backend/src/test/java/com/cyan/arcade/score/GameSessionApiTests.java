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
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The score submission flow end to end: HTTP, validation, services and the real database. */
@IntegrationTest
class GameSessionApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private GameSessionService sessions;

	@Test
	void startingASessionReturnsItsIdAndPersistsIt() throws Exception {
		String body = start("snake").andExpect(status().isCreated())
			.andExpect(jsonPath("$.gameSlug").value("snake"))
			.andExpect(jsonPath("$.startedAt").exists())
			.andReturn()
			.getResponse()
			.getContentAsString();
		String id = JsonPath.read(body, "$.id");

		assertThat(UUID.fromString(id)).isNotNull();
		Map<String, Object> row = this.jdbc.queryForMap(
				"SELECT g.slug, s.finished_at FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?::uuid",
				id);
		assertThat(row.get("slug")).isEqualTo("snake");
		assertThat(row.get("finished_at")).isNull();
	}

	@Test
	void startingASessionPointsToTheNewResource() throws Exception {
		MvcResult result = start("snake").andExpect(status().isCreated()).andReturn();
		String id = JsonPath.read(result.getResponse().getContentAsString(), "$.id");

		assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/game-sessions/" + id);
	}

	@Test
	void startingASessionForAnUnknownGameIsNotFound() throws Exception {
		start("pong").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void startingASessionRequiresAGameSlug() throws Exception {
		this.mockMvc.perform(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("gameSlug"));
	}

	@Test
	void finishingASessionRecordsTheScore() throws Exception {
		String id = startedSessionId("snake");

		finish(id, 42).andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$.sessionId").value(id))
			.andExpect(jsonPath("$.gameSlug").value("snake"))
			.andExpect(jsonPath("$.score").value(42))
			.andExpect(jsonPath("$.durationMs").isNumber())
			.andExpect(jsonPath("$.recordedAt").exists());

		Map<String, Object> row = this.jdbc.queryForMap("""
				SELECT sc.score, sc.duration_ms, g.slug, s.finished_at
				FROM scores sc
				JOIN game_sessions s ON s.id = sc.game_session_id
				JOIN games g ON g.id = sc.game_id
				WHERE sc.game_session_id = ?::uuid
				""", id);
		assertThat(row.get("score")).isEqualTo(42);
		assertThat((Long) row.get("duration_ms")).isGreaterThanOrEqualTo(0L);
		assertThat(row.get("slug")).isEqualTo("snake");
		assertThat(row.get("finished_at")).isNotNull();
	}

	@Test
	void aSessionCanBeFinishedOnlyOnce() throws Exception {
		String id = startedSessionId("snake");
		finish(id, 10).andExpect(status().isOk());

		finish(id, 250).andExpect(status().isConflict())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));

		Integer stored = this.jdbc.queryForObject("SELECT score FROM scores WHERE game_session_id = ?::uuid",
				Integer.class, id);
		assertThat(stored).isEqualTo(10);
		assertThat(scoreCount(id)).isEqualTo(1);
	}

	@Test
	void simultaneousFinishesRecordExactlyOneScore() throws Exception {
		String id = startedSessionId("snake");
		int attempts = 8;
		CountDownLatch go = new CountDownLatch(1);
		List<Future<Integer>> responses = new ArrayList<>();

		try (ExecutorService pool = Executors.newFixedThreadPool(attempts)) {
			for (int i = 0; i < attempts; i++) {
				responses.add(pool.submit(() -> {
					go.await();
					return finish(id, 7).andReturn().getResponse().getStatus();
				}));
			}
			go.countDown();

			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> response : responses) {
				statuses.add(response.get());
			}
			assertThat(statuses).containsOnlyOnce(200);
			assertThat(statuses).filteredOn((status) -> status != 200).hasSize(attempts - 1).containsOnly(409);
		}
		assertThat(scoreCount(id)).isEqualTo(1);
	}

	@Test
	void aScoreAboveWhatTheGameAllowsIsRejectedAndTheSessionStaysOpen() throws Exception {
		String id = startedSessionId("snake");

		// Snake on a 16x16 board cannot score more than 253.
		finish(id, 254).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(scoreCount(id)).isZero();

		finish(id, 253).andExpect(status().isOk());
	}

	@Test
	void gamesWithoutAMaximumAcceptLargeScoresOfALongRun() throws Exception {
		finish(startedSessionId("tetris"), 25_000_000).andExpect(status().isOk());
	}

	@Test
	void aNegativeOrMissingScoreFailsValidation() throws Exception {
		String id = startedSessionId("snake");

		finish(id, -1).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("score"));
		this.mockMvc
			.perform(post("/api/game-sessions/{id}/finish", id).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		assertThat(scoreCount(id)).isZero();
	}

	@Test
	void finishingAnUnknownSessionIsNotFound() throws Exception {
		finish(UUID.randomUUID().toString(), 5).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void aMalformedSessionIdIsABadRequest() throws Exception {
		finish("not-a-uuid", 5).andExpect(status().isBadRequest());
	}

	@Test
	void sessionsCannotBeRead() throws Exception {
		// Only starting and finishing are public; there is no endpoint that lists or reveals sessions.
		this.mockMvc.perform(get("/api/game-sessions")).andExpect(status().isUnauthorized());
	}

	@Test
	void aSameOriginPostFromTheSiteItselfIsNotTreatedAsCrossOrigin() throws Exception {
		// Browsers send an Origin header with every POST, even to their own site. Behind the reverse
		// proxy the app is served from http://localhost:3000; such a request must simply work.
		this.mockMvc
			.perform(post("/api/game-sessions").with((request) -> {
				request.setServerName("localhost");
				request.setServerPort(3000);
				return request;
			})
				.header(HttpHeaders.ORIGIN, "http://localhost:3000")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"snake\"}"))
			.andExpect(status().isCreated());
	}

	@Test
	void aPostFromAnUnknownSiteIsRejected() throws Exception {
		this.mockMvc
			.perform(post("/api/game-sessions").header(HttpHeaders.ORIGIN, "https://evil.example")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"snake\"}"))
			.andExpect(status().isForbidden());
	}

	@Test
	void aPostFromTheDevServerOriginIsAllowed() throws Exception {
		this.mockMvc
			.perform(post("/api/game-sessions").header(HttpHeaders.ORIGIN, "http://localhost:5173")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"snake\"}"))
			.andExpect(status().isCreated())
			.andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));
	}

	@Test
	void runsLeftUnfinishedForTooLongAreRemovedAndNothingElseIs() throws Exception {
		String abandoned = startedSessionId("snake");
		String stillPlaying = startedSessionId("snake");
		String finishedLongAgo = startedSessionId("snake");
		finish(finishedLongAgo, 3).andExpect(status().isOk());
		// Two of the three were started two days ago.
		this.jdbc.update("""
				UPDATE game_sessions
				SET started_at = started_at - interval '2 days',
				    finished_at = finished_at - interval '2 days'
				WHERE id IN (?::uuid, ?::uuid)
				""", abandoned, finishedLongAgo);

		// The hourly job, run by hand.
		new AbandonedSessionCleaner(this.sessions, new AbandonedSessionCleaner.SessionProperties(Duration.ofHours(24)))
			.removeAbandoned();

		assertThat(sessionExists(abandoned)).isFalse();
		// A recent run is left alone, and so is a finished one however old: its score points at it.
		assertThat(sessionExists(stillPlaying)).isTrue();
		assertThat(sessionExists(finishedLongAgo)).isTrue();
		assertThat(scoreCount(finishedLongAgo)).isEqualTo(1);
		// The abandoned run is gone for good; the recent one can still be finished.
		finish(abandoned, 5).andExpect(status().isNotFound());
		finish(stillPlaying, 5).andExpect(status().isOk());
	}

	private boolean sessionExists(String sessionId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM game_sessions WHERE id = ?::uuid", Integer.class,
				sessionId) == 1;
	}

	private ResultActions start(String gameSlug) throws Exception {
		return this.mockMvc.perform(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"%s\"}".formatted(gameSlug)));
	}

	private String startedSessionId(String gameSlug) throws Exception {
		return JsonPath.read(start(gameSlug).andReturn().getResponse().getContentAsString(), "$.id");
	}

	/** Finishes a run as its game would report it, after playing for a while (see {@link HonestRuns}). */
	private ResultActions finish(String sessionId, int score) throws Exception {
		String details = "{}";
		if (sessionId.matches("[0-9a-f-]{36}")) {
			HonestRuns.playFor(sessionId);
			details = HonestRuns.json(HonestRuns.detailsFor(HonestRuns.gameOf(sessionId), score, Map.of()));
		}
		return this.mockMvc.perform(post("/api/game-sessions/{id}/finish", sessionId)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, details)));
	}

	private int scoreCount(String sessionId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid", Integer.class,
				sessionId);
	}

}
