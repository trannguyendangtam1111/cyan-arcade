package com.cyan.arcade.chess;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
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
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.in;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Stockfish in Chess through the API, against a scripted engine ({@link FakeStockfish}): hints and
 * their per-game allowance, who may use what, games against the engine, evaluations and reviews,
 * and what an engine failure leaves behind (nothing).
 */
@IntegrationTest
class ChessAiApiTests {

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

	// --- Hints for players ----------------------------------------------------------------------------

	@Test
	void aPlayerGetsThreeHintsAGameCountedOnTheServer() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));

		String first = body(hint(player, match, 0).andExpect(status().isOk())
			.andExpect(jsonPath("$.revision").value(0))
			.andExpect(jsonPath("$.hints.used").value(1))
			.andExpect(jsonPath("$.hints.limit").value(3))
			.andExpect(jsonPath("$.hints.remaining").value(2))
			.andExpect(jsonPath("$.engine").value("FakeFish 1")));
		// The hint is one of the position's legal moves, in both notations, and the board is unchanged.
		List<String> legal = JsonPath.read(body(this.mockMvc.perform(get("/api/chess/matches/{id}", match).session(player))),
				"$.legalMoves[*].uci");
		assertThat(legal).contains(JsonPath.<String>read(first, "$.move.uci"));
		assertThat(JsonPath.<String>read(first, "$.move.san")).isNotBlank();
		this.mockMvc.perform(get("/api/chess/matches/{id}", match).session(player))
			.andExpect(jsonPath("$.revision").value(0))
			.andExpect(jsonPath("$.history", hasSize(0)))
			.andExpect(jsonPath("$.hints.remaining").value(2));

		hint(player, match, 0).andExpect(status().isOk());
		hint(player, match, 0).andExpect(status().isOk()).andExpect(jsonPath("$.hints.remaining").value(0));
		hint(player, match, 0).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HINT_LIMIT_REACHED"));

		// A reload (or anything the browser sends) gives none back; a new game brings new ones.
		this.mockMvc.perform(get("/api/chess/matches/current").session(player))
			.andExpect(jsonPath("$.hints.remaining").value(0));
		String next = id(start(player));
		hint(player, next, 0).andExpect(status().isOk()).andExpect(jsonPath("$.hints.remaining").value(2));
	}

	@Test
	void aHintIsCountedOnlyWhenOneIsGiven() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));

		this.engine.behaviour = FakeStockfish.Behaviour.CRASH;
		hint(player, match, 0).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("ENGINE_FAILED"));
		this.engine.behaviour = FakeStockfish.Behaviour.ILLEGAL_MOVE;
		hint(player, match, 0).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("ENGINE_FAILED"));
		// A stale board and a finished game are refused before the engine is asked.
		this.engine.behaviour = FakeStockfish.Behaviour.NORMAL;
		hint(player, match, 7).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_REVISION"));
		assertThat(hintsUsed(match)).isZero();

		// The pool replaced the crashed engine: the next hint works.
		hint(player, match, 0).andExpect(status().isOk()).andExpect(jsonPath("$.hints.used").value(1));

		resign(player, match, 0, "WHITE");
		hint(player, match, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MATCH_OVER"));
		assertThat(hintsUsed(match)).isEqualTo(1);
	}

	@Test
	void withoutAnEngineHintsAreUnavailableAndCostNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		// No engine can be started, and the ones running are gone.
		this.engine.behaviour = FakeStockfish.Behaviour.MISSING;
		this.engine.killAll();

		hint(player, match, 0).andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("ENGINE_UNAVAILABLE"));
		assertThat(hintsUsed(match)).isZero();
	}

	@Test
	void hintsAskedForAtTheSameMomentNeverPassTheLimit() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		hint(player, match, 0).andExpect(status().isOk());
		hint(player, match, 0).andExpect(status().isOk());

		CountDownLatch go = new CountDownLatch(1);
		ExecutorService threads = Executors.newFixedThreadPool(4);
		List<Integer> statuses = new ArrayList<>();
		try {
			List<Future<Integer>> answers = new ArrayList<>();
			for (int index = 0; index < 4; index++) {
				Callable<Integer> ask = () -> {
					go.await();
					return hint(player, match, 0).andReturn().getResponse().getStatus();
				};
				answers.add(threads.submit(ask));
			}
			go.countDown();
			for (Future<Integer> answer : answers) {
				statuses.add(answer.get());
			}
		}
		finally {
			threads.shutdownNow();
		}
		assertThat(statuses).filteredOn((code) -> code == 200).hasSize(1);
		assertThat(statuses).filteredOn((code) -> code != 200).allSatisfy((code) -> assertThat(code).isIn(409, 503));
		assertThat(hintsUsed(match)).isEqualTo(3);
	}

	@Test
	void guestsGetNoHintsAndNobodyGetsHintsForAnotherPlayersGame() throws Exception {
		UUID guest = UUID.randomUUID();
		String guestMatch = id(this.mockMvc.perform(post("/api/chess/matches").header("X-Player-Id", guest)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"mode\":\"LOCAL\"}")));
		this.mockMvc.perform(post("/api/chess/matches/{id}/hint", guestMatch).header("X-Player-Id", guest)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":0}")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/chess/matches/{id}", guestMatch).header("X-Player-Id", guest))
			.andExpect(jsonPath("$.hints.allowed").value(false));

		MockHttpSession owner = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		String match = id(start(owner));
		hint(other, match, 0).andExpect(status().isNotFound());
		assertThat(hintsUsed(match)).isZero();
	}

	// --- Who may use the engine -----------------------------------------------------------------------

	@Test
	void playersAndGuestsCannotReachTheAiMode() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String match = id(start(player));
		int searches = this.engine.searches.get();
		String[][] calls = { { "GET", "/api/ai/chess/engine" }, { "POST", "/api/ai/chess/matches" },
				{ "POST", "/api/ai/chess/matches/" + match + "/engine-move" },
				{ "POST", "/api/ai/chess/matches/" + match + "/evaluation" },
				{ "POST", "/api/ai/chess/matches/" + match + "/review" }, { "GET", "/api/ai/chess/matches/" + match + "/review" },
				{ "DELETE", "/api/ai/chess/matches/" + match + "/review" } };
		for (String[] call : calls) {
			var asPlayer = switch (call[0]) {
				case "GET" -> get(call[1]);
				case "DELETE" -> delete(call[1]);
				default -> post(call[1]).contentType(MediaType.APPLICATION_JSON)
					.content("{\"revision\":0,\"playerSide\":\"WHITE\",\"difficulty\":\"CLUB\"}");
			};
			this.mockMvc.perform(asPlayer.session(player)).andExpect(status().isForbidden());
			var asGuest = switch (call[0]) {
				case "GET" -> get(call[1]);
				case "DELETE" -> delete(call[1]);
				default -> post(call[1]).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0}");
			};
			this.mockMvc.perform(asGuest).andExpect(status().isUnauthorized());
		}
		// And a game against the engine cannot be started through the ordinary endpoint either.
		this.mockMvc.perform(post("/api/chess/matches").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"mode\":\"AI\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MODE_NOT_ALLOWED"));
		assertThat(this.engine.searches.get()).isEqualTo(searches);
	}

	// --- Games against Stockfish (admins) -------------------------------------------------------------

	@Test
	void anAdminPlaysAgainstStockfishByTheSameRules() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(this.mockMvc.perform(post("/api/ai/chess/matches").session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"playerSide\":\"BLACK\",\"difficulty\":\"CLUB\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("AI"))
			.andExpect(jsonPath("$.engine.side").value("WHITE"))
			.andExpect(jsonPath("$.engine.difficulty").value("CLUB"))
			.andExpect(jsonPath("$.engine.setting").value("Elo setting 1600"))
			.andExpect(jsonPath("$.canUndo").value(false)));

		// White is the engine's: the player cannot move for it, nor skip its turn.
		move(admin, match, 0, "e2e4").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_YOUR_SIDE"));
		move(admin, match, 0, "e7e5").andExpect(status().isForbidden());

		String afterEngine = body(engineMove(admin, match, 0).andExpect(status().isOk())
			.andExpect(jsonPath("$.revision").value(1))
			.andExpect(jsonPath("$.turn").value("BLACK"))
			.andExpect(jsonPath("$.history", hasSize(1)))
			.andExpect(jsonPath("$.history[0].color").value("WHITE")));
		engineMove(admin, match, 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_ENGINE_TURN"));
		engineMove(admin, match, 0).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_REVISION"));

		String reply = JsonPath.<List<String>>read(afterEngine, "$.legalMoves[*].uci").get(0);
		move(admin, match, 1, reply).andExpect(status().isOk());
		engineMove(admin, match, 2).andExpect(status().isOk()).andExpect(jsonPath("$.history", hasSize(3)));

		// Takebacks and draw offers are for two people at one board.
		this.mockMvc.perform(post("/api/chess/matches/{id}/undo", match).session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":3}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("UNDO_NOT_ALLOWED"));
		this.mockMvc.perform(post("/api/chess/matches/{id}/draw", match).session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":3,\"action\":\"OFFER\",\"side\":\"BLACK\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DRAW_OFFER_NOT_SUPPORTED"));
		// The player can resign; the game is then over for the engine too.
		resign(admin, match, 3, "WHITE").andExpect(status().isForbidden());
		resign(admin, match, 3, "BLACK").andExpect(status().isOk()).andExpect(jsonPath("$.result.winner").value("WHITE"));
		engineMove(admin, match, 4).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MATCH_OVER"));
	}

	@Test
	void aFailedEngineMoveLeavesTheGameAsItWasAndCanBeRetried() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(startEngineGame(admin, "BLACK", "BEGINNER"));

		this.engine.behaviour = FakeStockfish.Behaviour.ILLEGAL_MOVE;
		engineMove(admin, match, 0).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("ENGINE_FAILED"));
		this.engine.behaviour = FakeStockfish.Behaviour.CRASH;
		engineMove(admin, match, 0).andExpect(status().isServiceUnavailable());
		assertThat(this.jdbc.queryForObject("SELECT moves || '|' || revision FROM chess_matches WHERE id = ?::uuid",
				String.class, match)).isEqualTo("|0");

		this.engine.behaviour = FakeStockfish.Behaviour.NORMAL;
		engineMove(admin, match, 0).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
	}

	@Test
	void anAdminsHintsAreUnlimited() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(start(admin));
		for (int index = 0; index < 5; index++) {
			hint(admin, match, 0).andExpect(status().isOk()).andExpect(jsonPath("$.hints.limit").value(nullValue()));
		}
		assertThat(hintsUsed(match)).isEqualTo(5);
	}

	// --- Evaluation (admins) --------------------------------------------------------------------------

	@Test
	void evaluationsAreFromWhitesSideWhoeverIsToMove() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(start(admin));

		evaluate(admin, match, 0, 12, 2).andExpect(status().isOk())
			.andExpect(jsonPath("$.sideToMove").value("WHITE"))
			.andExpect(jsonPath("$.evaluation.kind").value("CENTIPAWNS"))
			.andExpect(jsonPath("$.evaluation.centipawns").value(20))
			.andExpect(jsonPath("$.evaluation.display").value("+0.20"))
			.andExpect(jsonPath("$.lines", hasSize(2)))
			.andExpect(jsonPath("$.lines[1].evaluation.centipawns").value(10))
			.andExpect(jsonPath("$.lines[0].san", hasSize(2)))
			.andExpect(jsonPath("$.complete").value(true))
			.andExpect(jsonPath("$.bestMove.san").isString());

		// Black to move and 20 centipawns up is -0.20 for White.
		move(admin, match, 0, "e2e4").andExpect(status().isOk());
		evaluate(admin, match, 1, 12, 1).andExpect(status().isOk())
			.andExpect(jsonPath("$.sideToMove").value("BLACK"))
			.andExpect(jsonPath("$.evaluation.centipawns").value(-20))
			.andExpect(jsonPath("$.evaluation.favoured").value("BLACK"));

		// A stale board, or limits beyond the configured ones, are refused.
		evaluate(admin, match, 0, 12, 1).andExpect(status().isConflict());
		evaluate(admin, match, 1, 30, 1).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("ANALYSIS_NOT_ALLOWED"));
		evaluate(admin, match, 1, 12, 4).andExpect(status().isBadRequest());
		// Evaluating changes nothing.
		this.mockMvc.perform(get("/api/chess/matches/{id}", match).session(admin)).andExpect(jsonPath("$.revision").value(1));
	}

	@Test
	void aMateIsShownAsAMateForTheRightSide() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(start(admin));
		for (String uci : List.of("f2f3", "e7e5", "g2g4")) {
			move(admin, match, revision(match), uci).andExpect(status().isOk());
		}

		evaluate(admin, match, 3, 12, 1).andExpect(status().isOk())
			.andExpect(jsonPath("$.evaluation.kind").value("MATE"))
			.andExpect(jsonPath("$.evaluation.mateIn").value(1))
			.andExpect(jsonPath("$.evaluation.matingSide").value("BLACK"))
			.andExpect(jsonPath("$.evaluation.centipawns").value(0))
			.andExpect(jsonPath("$.evaluation.display").value("#-1"))
			.andExpect(jsonPath("$.evaluation.whiteWinPercent").value(0.0))
			.andExpect(jsonPath("$.bestMove.san").value("Qh4#"));

		move(admin, match, 3, "d8h4").andExpect(status().isOk());
		int searches = this.engine.searches.get();
		evaluate(admin, match, 4, 12, 1).andExpect(status().isOk())
			.andExpect(jsonPath("$.finished").value(true))
			.andExpect(jsonPath("$.evaluation.display").value("0-1"));
		assertThat(this.engine.searches.get()).isEqualTo(searches);
	}

	// --- Reviews (admins) -----------------------------------------------------------------------------

	@Test
	void aFinishedGameIsReviewedMoveByMoveAndLeftAsItWas() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(start(admin));
		reviewStart(admin, match).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("REVIEW_NEEDS_FINISHED_GAME"));
		for (String uci : List.of("f2f3", "e7e5", "g2g4", "d8h4")) {
			move(admin, match, revision(match), uci).andExpect(status().isOk());
		}
		String before = this.jdbc.queryForObject(
				"SELECT moves || '|' || revision || '|' || status || '|' || termination FROM chess_matches WHERE id = ?::uuid",
				String.class, match);

		reviewStart(admin, match).andExpect(status().isAccepted()).andExpect(jsonPath("$.total").value(5));
		String review = awaitReview(admin, match);

		assertThat(JsonPath.<String>read(review, "$.status")).isEqualTo("DONE");
		assertThat(JsonPath.<Integer>read(review, "$.analyzed")).isEqualTo(5);
		assertThat(JsonPath.<List<String>>read(review, "$.moves[*].san")).containsExactly("f3", "e5", "g4", "Qh4#");
		List<String> labels = JsonPath.read(review, "$.moves[*].classification");
		assertThat(labels).allSatisfy((label) -> assertThat(label).isIn("BEST", "EXCELLENT", "GOOD", "INACCURACY", "MISTAKE",
				"BLUNDER", "FORCED", "UNRATED"));
		// The mate was the engine's own choice; f3 was not (it would have played its first move).
		assertThat(labels.get(3)).isEqualTo("BEST");
		assertThat(labels.get(0)).isNotEqualTo("BEST");
		assertThat(JsonPath.<String>read(review, "$.moves[3].after.display")).isEqualTo("0-1");
		assertThat(JsonPath.<String>read(review, "$.moves[0].best.uci")).isNotEqualTo("f2f3");
		assertThat(this.jdbc.queryForObject(
				"SELECT moves || '|' || revision || '|' || status || '|' || termination FROM chess_matches WHERE id = ?::uuid",
				String.class, match)).isEqualTo(before);

		// Asking again gives the same review; a new review reuses the analysed positions.
		reviewStart(admin, match).andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("DONE"));
		reviewCancel(admin, match).andExpect(status().isOk());
		int searches = this.engine.searches.get();
		reviewStart(admin, match).andExpect(status().isAccepted());
		assertThat(JsonPath.<String>read(awaitReview(admin, match), "$.status")).isEqualTo("DONE");
		assertThat(this.engine.searches.get()).isEqualTo(searches);

		// Another admin's game is not theirs to review.
		this.mockMvc.perform(get("/api/ai/chess/matches/{id}/review", match).session(newAdmin()))
			.andExpect(status().isNotFound());
	}

	@Test
	void theEngineStatusListsTheDifficultiesAndLimits() throws Exception {
		this.mockMvc.perform(get("/api/ai/chess/engine").session(newAdmin()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.available").value(true))
			.andExpect(jsonPath("$.engine").value("FakeFish 1"))
			.andExpect(jsonPath("$.difficulties[*].id", contains("BEGINNER", "CASUAL", "CLUB", "ADVANCED", "MAXIMUM")))
			.andExpect(jsonPath("$.maxDepth").value(22))
			.andExpect(jsonPath("$.maxLines").value(3))
			.andExpect(jsonPath("$.hintsPerGame").value(3))
			.andExpect(jsonPath("$.difficulties[*].setting", everyItem(in(List.of("Skill Level 0 of 20", "Skill Level 6 of 20",
					"Elo setting 1600", "Elo setting 2200", "Full strength, 1 second a move")))));
	}

	@Test
	void theEngineStatusAndReviewsNoticeWhenTheEngineStopsWorking() throws Exception {
		MockHttpSession admin = newAdmin();
		String match = id(start(admin));
		for (String uci : List.of("f2f3", "e7e5", "g2g4", "d8h4")) {
			move(admin, match, revision(match), uci).andExpect(status().isOk());
		}
		this.mockMvc.perform(get("/api/ai/chess/engine").session(admin)).andExpect(jsonPath("$.available").value(true));

		// The engines that ran are gone and none can be started: not what was known earlier.
		this.engine.behaviour = FakeStockfish.Behaviour.MISSING;
		this.engine.killAll();
		this.mockMvc.perform(get("/api/ai/chess/engine").session(admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.available").value(false))
			.andExpect(jsonPath("$.engine").doesNotExist());
		reviewStart(admin, match).andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("ENGINE_UNAVAILABLE"));

		this.engine.behaviour = FakeStockfish.Behaviour.NORMAL;
		this.mockMvc.perform(get("/api/ai/chess/engine").session(admin))
			.andExpect(jsonPath("$.available").value(true))
			.andExpect(jsonPath("$.engine").value("FakeFish 1"));
	}

	// --- Helpers -------------------------------------------------------------------------------------

	/** A new account promoted to admin, signed in again so its session carries the role. */
	private MockHttpSession newAdmin() throws Exception {
		String name = Players.uniqueName();
		MockHttpSession first = Players.register(this.mockMvc, name);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", Players.userId(this.mockMvc, first));
		MockHttpSession admin = new MockHttpSession();
		this.mockMvc.perform(post("/api/auth/login").session(admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(name, Players.PASSWORD))).andExpect(status().isOk());
		return admin;
	}

	private ResultActions start(MockHttpSession session) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"mode\":\"LOCAL\"}")).andExpect(status().isCreated());
	}

	private ResultActions startEngineGame(MockHttpSession session, String side, String difficulty) throws Exception {
		return this.mockMvc.perform(post("/api/ai/chess/matches").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"playerSide\":\"" + side + "\",\"difficulty\":\"" + difficulty + "\"}")).andExpect(status().isCreated());
	}

	private ResultActions hint(MockHttpSession session, String match, int revision) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/hint", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + "}"));
	}

	private ResultActions move(MockHttpSession session, String match, int revision, String uci) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/moves", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + ",\"move\":\"" + uci + "\"}"));
	}

	private ResultActions resign(MockHttpSession session, String match, int revision, String side) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/resign", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + ",\"side\":\"" + side + "\"}"));
	}

	private ResultActions engineMove(MockHttpSession session, String match, int revision) throws Exception {
		return this.mockMvc.perform(post("/api/ai/chess/matches/{id}/engine-move", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + "}"));
	}

	private ResultActions evaluate(MockHttpSession session, String match, int revision, int depth, int lines)
			throws Exception {
		return this.mockMvc.perform(post("/api/ai/chess/matches/{id}/evaluation", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":" + revision + ",\"depth\":" + depth + ",\"lines\":" + lines + "}"));
	}

	private ResultActions reviewStart(MockHttpSession session, String match) throws Exception {
		return this.mockMvc.perform(post("/api/ai/chess/matches/{id}/review", match).session(session));
	}

	private ResultActions reviewCancel(MockHttpSession session, String match) throws Exception {
		return this.mockMvc.perform(delete("/api/ai/chess/matches/{id}/review", match).session(session));
	}

	private String awaitReview(MockHttpSession session, String match) throws Exception {
		for (int attempt = 0; attempt < 100; attempt++) {
			String review = body(this.mockMvc.perform(get("/api/ai/chess/matches/{id}/review", match).session(session))
				.andExpect(status().isOk()));
			String state = JsonPath.read(review, "$.status");
			if (!state.equals("QUEUED") && !state.equals("RUNNING")) {
				return review;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("The review did not finish");
	}

	private int revision(String match) {
		return this.jdbc.queryForObject("SELECT revision FROM chess_matches WHERE id = ?::uuid", Integer.class, match);
	}

	private int hintsUsed(String match) {
		return this.jdbc.queryForObject("SELECT hints_used FROM chess_matches WHERE id = ?::uuid", Integer.class, match);
	}

	private static String body(ResultActions actions) throws Exception {
		return actions.andReturn().getResponse().getContentAsString();
	}

	private static String id(ResultActions actions) throws Exception {
		return JsonPath.read(body(actions), "$.id");
	}

}
