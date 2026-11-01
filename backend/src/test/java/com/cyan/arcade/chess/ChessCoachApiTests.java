package com.cyan.arcade.chess;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.in;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coach Mode through the API, against the scripted engine ({@link FakeStockfish}): a judgement of
 * the caller's own recorded move, never of a move taken back or of the engine's, from the shared
 * engine pool and cache, one at a time per account, and changing nothing in the match.
 */
@IntegrationTest
class ChessCoachApiTests {

	private static final List<String> LABELS = List.of("BEST", "EXCELLENT", "GOOD", "INACCURACY", "MISTAKE", "BLUNDER",
			"FORCED", "UNRATED");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private FakeStockfish engine;

	@Autowired
	private EngineAnalysisCache cache;

	@BeforeEach
	void freshEngine() {
		this.engine.reset();
		this.cache.clear();
	}

	@AfterEach
	void normalEngine() {
		this.engine.reset();
	}

	@Test
	void aPlayerGetsStockfishsJudgementOfTheirMoveAndTheMatchStaysAsItWas() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());
		String before = row(match);

		coach(player, match, 1, "e2e4").andExpect(status().isOk())
			.andExpect(jsonPath("$.matchId").value(match))
			.andExpect(jsonPath("$.ply").value(1))
			.andExpect(jsonPath("$.move.ply").value(1))
			.andExpect(jsonPath("$.move.uci").value("e2e4"))
			.andExpect(jsonPath("$.move.san").value("e4"))
			.andExpect(jsonPath("$.move.color").value("WHITE"))
			.andExpect(jsonPath("$.move.classification").value(in(LABELS)))
			// From White's side both ways: +0.20 for White to move, then 0.20 for Black, so -0.20.
			.andExpect(jsonPath("$.move.before.display").value("+0.20"))
			.andExpect(jsonPath("$.move.after.display").value("-0.20"))
			.andExpect(jsonPath("$.move.best.uci").exists())
			.andExpect(jsonPath("$.move.depth").value(12))
			.andExpect(jsonPath("$.engine").value("FakeFish 1"));

		// A judgement is not a move, a hint or anything else in the match.
		assertThat(row(match)).isEqualTo(before);
	}

	@Test
	void onlyAMoveTheMatchStillHasIsJudged() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());
		this.mockMvc.perform(post("/api/chess/matches/{id}/undo", match).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":1}")).andExpect(status().isOk());

		// Taken back: the judgement it would have had belongs to no move of the game.
		coach(player, match, 1, "e2e4").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("COACH_MOVE_GONE"));
		move(player, match, 2, "d2d4").andExpect(status().isOk());
		coach(player, match, 1, "e2e4").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("COACH_MOVE_GONE"));
		coach(player, match, 2, "d7d5").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("COACH_MOVE_GONE"));
		coach(player, match, 1, "d2d4").andExpect(status().isOk()).andExpect(jsonPath("$.move.san").value("d4"));
		// Malformed requests are refused before anything else.
		coachBody(player, match, "{\"ply\":0,\"uci\":\"d2d4\"}").andExpect(status().isBadRequest());
		coachBody(player, match, "{\"ply\":1,\"uci\":\"d2\"}").andExpect(status().isBadRequest());
	}

	@Test
	void guestsAndOtherPlayersGetNoJudgements() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());

		this.mockMvc.perform(post("/api/chess/matches/{id}/coach", match)
			.header("X-Player-Id", UUID.randomUUID().toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"ply\":1,\"uci\":\"e2e4\"}")).andExpect(status().isUnauthorized());
		coach(Players.register(this.mockMvc), match, 1, "e2e4").andExpect(status().isNotFound());
	}

	@Test
	void againstStockfishOnlyThePlayersOwnMovesAreJudged() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mockMvc);
		String match = JsonPath.read(body(this.mockMvc.perform(post("/api/ai/chess/matches").session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"playerSide\":\"WHITE\",\"difficulty\":\"CLUB\"}")).andExpect(status().isCreated())), "$.id");
		move(admin, match, 0, "e2e4").andExpect(status().isOk());
		String engineMove = JsonPath.read(body(this.mockMvc.perform(post("/api/ai/chess/matches/{id}/engine-move", match)
			.session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":1}")).andExpect(status().isOk())), "$.history[1].uci");

		coach(admin, match, 2, engineMove).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("NOT_YOUR_SIDE"));
		coach(admin, match, 1, "e2e4").andExpect(status().isOk());
	}

	@Test
	void aJudgementAlreadyWorkedOutIsServedFromTheCache() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());
		move(player, match, 1, "e7e5").andExpect(status().isOk());

		int searches = this.engine.searches.get();
		coach(player, match, 1, "e2e4").andExpect(status().isOk());
		assertThat(this.engine.searches.get()).isEqualTo(searches + 2);
		// The next move shares a position with the first: only the new one is searched.
		coach(player, match, 2, "e7e5").andExpect(status().isOk());
		assertThat(this.engine.searches.get()).isEqualTo(searches + 3);
		coach(player, match, 1, "e2e4").andExpect(status().isOk());
		coach(player, match, 2, "e7e5").andExpect(status().isOk());
		assertThat(this.engine.searches.get()).isEqualTo(searches + 3);
	}

	@Test
	void aMoveThatEndsTheGameIsJudgedAgainstTheResultNotASearch() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		int revision = 0;
		for (String uci : List.of("f2f3", "e7e5", "g2g4", "d8h4")) {
			move(player, match, revision++, uci).andExpect(status().isOk());
		}
		int searches = this.engine.searches.get();

		coach(player, match, 4, "d8h4").andExpect(status().isOk())
			.andExpect(jsonPath("$.move.san").value("Qh4#"))
			.andExpect(jsonPath("$.move.classification").value("BEST"))
			.andExpect(jsonPath("$.move.before.display").value("#-1"))
			.andExpect(jsonPath("$.move.after.display").value("0-1"))
			.andExpect(jsonPath("$.move.loss").value(0.0));
		// Only the position before the mate is searched.
		assertThat(this.engine.searches.get()).isEqualTo(searches + 1);
		// The blunder before it: from White's +0.20 to Black mating in one.
		coach(player, match, 3, "g2g4").andExpect(status().isOk())
			.andExpect(jsonPath("$.move.classification").value("BLUNDER"))
			.andExpect(jsonPath("$.move.after.display").value("#-1"));
	}

	@Test
	void anEngineFailureCostsNothingAndChangesNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());
		String before = row(match);

		this.engine.behaviour = FakeStockfish.Behaviour.ILLEGAL_MOVE;
		coach(player, match, 1, "e2e4").andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("ENGINE_FAILED"));
		this.engine.behaviour = FakeStockfish.Behaviour.CRASH;
		coach(player, match, 1, "e2e4").andExpect(status().isServiceUnavailable());
		assertThat(row(match)).isEqualTo(before);

		this.engine.behaviour = FakeStockfish.Behaviour.NORMAL;
		coach(player, match, 1, "e2e4").andExpect(status().isOk());
	}

	@Test
	void oneJudgementAtATimePerAccount() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		move(player, match, 0, "e2e4").andExpect(status().isOk());
		move(player, match, 1, "e7e5").andExpect(status().isOk());
		this.engine.searchMillis = 300;

		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			List<Callable<Integer>> calls = new ArrayList<>();
			calls.add(() -> coach(player, match, 1, "e2e4").andReturn().getResponse().getStatus());
			calls.add(() -> coach(player, match, 2, "e7e5").andReturn().getResponse().getStatus());
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> answer : pool.invokeAll(calls)) {
				statuses.add(answer.get());
			}
			// One is judged; the other is refused at once rather than queued behind it.
			assertThat(statuses).containsExactlyInAnyOrder(200, 429);
		}
		finally {
			pool.shutdownNow();
		}
		this.engine.searchMillis = 0;
		coach(player, match, 2, "e7e5").andExpect(status().isOk());
	}

	// --- Helpers -------------------------------------------------------------------------------------

	private ResultActions start(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"mode\":\"LOCAL\"}")).andExpect(status().isCreated());
	}

	private ResultActions move(MockHttpSession session, String match, int revision, String uci) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/moves", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + ",\"move\":\"" + uci + "\"}"));
	}

	private ResultActions coach(MockHttpSession session, String match, int ply, String uci) throws Exception {
		return coachBody(session, match, "{\"ply\":" + ply + ",\"uci\":\"" + uci + "\"}");
	}

	private ResultActions coachBody(MockHttpSession session, String match, String json) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/coach", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json));
	}

	/** Everything the match keeps that a judgement could change. */
	private String row(String match) {
		return this.jdbc.queryForObject(
				"SELECT moves || '|' || undone || '|' || revision || '|' || status || '|' || hints_used FROM chess_matches WHERE id = ?::uuid",
				String.class, match);
	}

	private static String body(ResultActions actions) throws Exception {
		return actions.andReturn().getResponse().getContentAsString();
	}

	private static String id(ResultActions actions) throws Exception {
		return JsonPath.read(body(actions), "$.id");
	}

}
