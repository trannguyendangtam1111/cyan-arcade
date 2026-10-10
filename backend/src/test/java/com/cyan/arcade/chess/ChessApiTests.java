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
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Chess through the API, as the browser plays it: a local match on the server, every action judged
 * against the position the recorded moves make, at the revision it was chosen in, by its owner only.
 */
@IntegrationTest
class ChessApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	private static final String INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	// --- On the platform -----------------------------------------------------------------------------

	@Test
	void chessIsInTheCatalogAsAnUnscoredGame() throws Exception {
		this.mockMvc.perform(get("/api/games/chess"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Chess"))
			.andExpect(jsonPath("$.category").value("STRATEGY"))
			.andExpect(jsonPath("$.scored").value(false))
			.andExpect(jsonPath("$.thumbnailUrl").value("/thumbnails/chess.svg"));
		this.mockMvc.perform(get("/api/games")).andExpect(jsonPath("$[*].slug", hasItem("chess")));
		this.mockMvc.perform(get("/api/games/snake")).andExpect(jsonPath("$.scored").value(true));
	}

	@Test
	void anUnscoredGameHasNoScoreSessionsNoLeaderboardAndNoRanks() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/game-sessions").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"chess\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("GAME_NOT_SCORED"));
		this.mockMvc.perform(post("/api/game-sessions").header(PLAYER_HEADER, UUID.randomUUID())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"chess\"}")).andExpect(status().isConflict());
		this.mockMvc.perform(get("/api/leaderboards/chess")).andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/users/me/ranks").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.games[*].game.slug", not(hasItem("chess"))));
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE g.slug = 'chess'",
				Integer.class))
			.isZero();
	}

	// --- Starting ------------------------------------------------------------------------------------

	@Test
	void aGuestStartsAMatchFromTheStartingPosition() throws Exception {
		UUID guest = UUID.randomUUID();

		start(null, guest).andExpect(status().isCreated())
			.andExpect(jsonPath("$.mode").value("LOCAL"))
			.andExpect(jsonPath("$.status").value("ACTIVE"))
			.andExpect(jsonPath("$.revision").value(0))
			.andExpect(jsonPath("$.fen").value(INITIAL_FEN))
			.andExpect(jsonPath("$.turn").value("WHITE"))
			.andExpect(jsonPath("$.check").value(false))
			.andExpect(jsonPath("$.legalMoves", hasSize(20)))
			.andExpect(jsonPath("$.legalMoves[?(@.uci == 'g1f3')].san", contains("Nf3")))
			.andExpect(jsonPath("$.history", empty()))
			.andExpect(jsonPath("$.lastMove").value(nullValue()))
			.andExpect(jsonPath("$.material.WHITE").value(39))
			.andExpect(jsonPath("$.canUndo").value(false))
			.andExpect(jsonPath("$.result").value(nullValue()));
	}

	@Test
	void playingNeedsAnAccountOrAGuestId() throws Exception {
		this.mockMvc.perform(post("/api/chess/matches").contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"LOCAL\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("PLAYER_ID_REQUIRED"));
		this.mockMvc.perform(get("/api/chess/matches/current")).andExpect(status().isNoContent());
	}

	@Test
	void theCurrentMatchIsPickedUpAfterAReloadAndANewOneLeavesTheOld() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		this.mockMvc.perform(get("/api/chess/matches/current").session(player)).andExpect(status().isNoContent());
		String first = id(body(start(player, null)));
		move(player, null, first, 0, "e2e4").andExpect(status().isOk());

		this.mockMvc.perform(get("/api/chess/matches/current").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(first))
			.andExpect(jsonPath("$.history[*].san", contains("e4")));

		String second = id(body(start(player, null)));
		assertThat(this.jdbc.queryForObject("SELECT status FROM chess_matches WHERE id = ?::uuid", String.class, first))
			.isEqualTo("ABANDONED");
		this.mockMvc.perform(get("/api/chess/matches/current").session(player)).andExpect(jsonPath("$.id").value(second));
		move(player, null, first, 1, "e7e5").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("MATCH_OVER"));
	}

	// --- Moves ---------------------------------------------------------------------------------------

	@Test
	void theServerJudgesEveryMove() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));

		move(null, guest, match, 0, "e2e4").andExpect(status().isOk())
			.andExpect(jsonPath("$.revision").value(1))
			.andExpect(jsonPath("$.turn").value("BLACK"))
			.andExpect(jsonPath("$.fen").value("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"))
			.andExpect(jsonPath("$.lastMove.from").value("e2"))
			.andExpect(jsonPath("$.lastMove.to").value("e4"))
			.andExpect(jsonPath("$.lastMove.san").value("e4"))
			.andExpect(jsonPath("$.history[0].color").value("WHITE"));

		// White's piece on Black's turn, a pawn going too far, a move to its own square, nonsense.
		for (String illegal : List.of("d2d4", "e7e4", "e4e4", "a8a1q")) {
			move(null, guest, match, 1, illegal).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("ILLEGAL_MOVE"));
		}
		move(null, guest, match, 1, "castle").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		assertThat(this.jdbc.queryForObject("SELECT moves FROM chess_matches WHERE id = ?::uuid", String.class, match))
			.isEqualTo("e2e4");
	}

	@Test
	void aMoveChosenInAnOlderPositionIsRefused() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		move(null, guest, match, 0, "e2e4").andExpect(status().isOk());

		// Sent again (a double click, a second tab): the match has moved on.
		move(null, guest, match, 0, "e2e4").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("STALE_REVISION"));
		move(null, guest, match, 0, "e7e5").andExpect(status().isConflict());
		move(null, guest, match, 5, "e7e5").andExpect(status().isConflict());
		assertThat(this.jdbc.queryForObject("SELECT moves FROM chess_matches WHERE id = ?::uuid", String.class, match))
			.isEqualTo("e2e4");
	}

	@Test
	void ofTwoMovesSentAtTheSameTimeExactlyOneIsPlayed() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		CountDownLatch ready = new CountDownLatch(1);
		ExecutorService pool = Executors.newFixedThreadPool(4);
		try {
			List<Future<Integer>> answers = new ArrayList<>();
			for (String uci : List.of("e2e4", "d2d4", "g1f3", "c2c4")) {
				Callable<Integer> send = () -> {
					ready.await();
					return move(null, guest, match, 0, uci).andReturn().getResponse().getStatus();
				};
				answers.add(pool.submit(send));
			}
			ready.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> answer : answers) {
				statuses.add(answer.get());
			}
			assertThat(statuses).containsExactlyInAnyOrder(200, 409, 409, 409);
		}
		finally {
			pool.shutdownNow();
		}
		assertThat(this.jdbc.queryForObject("SELECT moves FROM chess_matches WHERE id = ?::uuid", String.class, match))
			.doesNotContain(" ");
		assertThat(this.jdbc.queryForObject("SELECT revision FROM chess_matches WHERE id = ?::uuid", Integer.class, match))
			.isEqualTo(1);
	}

	@Test
	void specialMovesAreOfferedWithWhatTheyAre() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		String afterDoubleStep = body(play(null, guest, match, "e2e4", "a7a6", "e4e5", "d7d5"));

		assertThat(JsonPath.<List<Boolean>>read(afterDoubleStep, "$.legalMoves[?(@.uci == 'e5d6')].enPassant"))
			.containsExactly(true);
		assertThat(JsonPath.<List<String>>read(afterDoubleStep, "$.legalMoves[?(@.uci == 'e5d6')].san"))
			.containsExactly("exd6");
		String taken = body(move(null, guest, match, 4, "e5d6"));
		assertThat(JsonPath.<List<String>>read(taken, "$.captured.WHITE")).containsExactly("p");
		assertThat(JsonPath.<Integer>read(taken, "$.material.BLACK")).isEqualTo(38);
	}

	@Test
	void aPawnPromotesToThePieceItsPlayerChooses() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		String ready = body(play(null, guest, match, "h2h4", "g7g5", "h4g5", "h7h6", "g5h6", "a7a6", "h6h7", "a6a5"));

		assertThat(JsonPath.<List<String>>read(ready, "$.legalMoves[?(@.from == 'h7' && @.to == 'g8')].promotion"))
			.containsExactlyInAnyOrder("q", "r", "b", "n");
		// Without a piece named, it is not a move.
		move(null, guest, match, 8, "h7g8").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("ILLEGAL_MOVE"));

		move(null, guest, match, 8, "h7g8n").andExpect(status().isOk())
			.andExpect(jsonPath("$.lastMove.san").value("hxg8=N"))
			.andExpect(jsonPath("$.fen").value("rnbqkbNr/1ppppp2/8/p7/8/8/PPPPPPP1/RNBQKBNR b KQkq - 0 5"))
			.andExpect(jsonPath("$.captured.WHITE", contains("p", "p", "n")));
	}

	// --- How a match ends ----------------------------------------------------------------------------

	@Test
	void checkmateEndsTheMatchAndNothingCanBePlayedAfter() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));

		play(null, guest, match, "f2f3", "e7e5", "g2g4", "d8h4").andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("FINISHED"))
			.andExpect(jsonPath("$.result.winner").value("BLACK"))
			.andExpect(jsonPath("$.result.termination").value("CHECKMATE"))
			.andExpect(jsonPath("$.result.score").value("0-1"))
			.andExpect(jsonPath("$.check").value(true))
			.andExpect(jsonPath("$.checkedKing").value("e1"))
			.andExpect(jsonPath("$.legalMoves", empty()))
			.andExpect(jsonPath("$.lastMove.san").value("Qh4#"))
			.andExpect(jsonPath("$.canUndo").value(false));

		move(null, guest, match, 4, "e2e3").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MATCH_OVER"));
		revisionOnly(null, guest, match, "undo", 4).andExpect(status().isConflict());
		resign(null, guest, match, 4, "WHITE").andExpect(status().isConflict());
		draw(null, guest, match, 4, "OFFER", "WHITE").andExpect(status().isConflict());
		// After a reload the finished match is shown, result and all.
		this.mockMvc.perform(get("/api/chess/matches/current").header(PLAYER_HEADER, guest))
			.andExpect(jsonPath("$.id").value(match))
			.andExpect(jsonPath("$.result.termination").value("CHECKMATE"));
	}

	@Test
	void eitherPlayerMayResign() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		move(null, guest, match, 0, "e2e4");

		resign(null, guest, match, 1, "WHITE").andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("FINISHED"))
			.andExpect(jsonPath("$.result.winner").value("BLACK"))
			.andExpect(jsonPath("$.result.termination").value("RESIGNATION"));
		resign(null, guest, match, 2, "BLACK").andExpect(status().isConflict());
	}

	@Test
	void aDrawIsOfferedAndAnsweredByTheOtherSide() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));

		draw(null, guest, match, 0, "ACCEPT", "BLACK").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("NO_DRAW_OFFER"));
		draw(null, guest, match, 0, "OFFER", "WHITE").andExpect(status().isOk())
			.andExpect(jsonPath("$.drawOffer").value("WHITE"));
		draw(null, guest, match, 1, "ACCEPT", "WHITE").andExpect(status().isConflict());
		draw(null, guest, match, 1, "DECLINE", "BLACK").andExpect(status().isOk())
			.andExpect(jsonPath("$.drawOffer").value(nullValue()));
		draw(null, guest, match, 2, "OFFER", "WHITE").andExpect(status().isOk());
		draw(null, guest, match, 3, "ACCEPT", "BLACK").andExpect(status().isOk())
			.andExpect(jsonPath("$.result.winner").value(nullValue()))
			.andExpect(jsonPath("$.result.termination").value("AGREEMENT"))
			.andExpect(jsonPath("$.result.score").value("1/2-1/2"));
	}

	@Test
	void aThreefoldRepetitionCanBeClaimedOnlyOnceItHasHappened() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		play(null, guest, match, "g1f3", "g8f6", "f3g1", "f6g8").andExpect(jsonPath("$.repetitions").value(2))
			.andExpect(jsonPath("$.claimableDraw").value(nullValue()));
		draw(null, guest, match, 4, "CLAIM", "WHITE").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DRAW_NOT_CLAIMABLE"));

		play(null, guest, match, "g1f3", "g8f6", "f3g1", "f6g8").andExpect(jsonPath("$.claimableDraw").value("THREEFOLD_REPETITION"))
			.andExpect(jsonPath("$.status").value("ACTIVE"));
		draw(null, guest, match, 8, "CLAIM", "BLACK").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("NOT_YOUR_TURN"));
		draw(null, guest, match, 8, "CLAIM", "WHITE").andExpect(status().isOk())
			.andExpect(jsonPath("$.result.termination").value("THREEFOLD_REPETITION"));
	}

	// --- Taking back ---------------------------------------------------------------------------------

	@Test
	void movesAreTakenBackAndReplayedUntilANewMoveIsPlayed() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));
		revisionOnly(null, guest, match, "undo", 0).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("NOTHING_TO_UNDO"));
		play(null, guest, match, "e2e4", "e7e5");

		revisionOnly(null, guest, match, "undo", 2).andExpect(status().isOk())
			.andExpect(jsonPath("$.history[*].san", contains("e4")))
			.andExpect(jsonPath("$.turn").value("BLACK"))
			.andExpect(jsonPath("$.canRedo").value(true));
		revisionOnly(null, guest, match, "redo", 3).andExpect(status().isOk())
			.andExpect(jsonPath("$.history[*].san", contains("e4", "e5")))
			.andExpect(jsonPath("$.canRedo").value(false));
		revisionOnly(null, guest, match, "undo", 4).andExpect(status().isOk());

		move(null, guest, match, 5, "c7c5").andExpect(status().isOk()).andExpect(jsonPath("$.canRedo").value(false));
		revisionOnly(null, guest, match, "redo", 6).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("NOTHING_TO_REDO"));
	}

	// --- Whose match ---------------------------------------------------------------------------------

	@Test
	void aMatchIsItsOwnersAlone() throws Exception {
		MockHttpSession owner = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		UUID guest = UUID.randomUUID();
		String match = id(body(start(owner, null)));

		this.mockMvc.perform(get("/api/chess/matches/{id}", match).session(owner)).andExpect(status().isOk());
		this.mockMvc.perform(get("/api/chess/matches/{id}", match).session(other)).andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/chess/matches/{id}", match).header(PLAYER_HEADER, guest))
			.andExpect(status().isNotFound());
		move(other, null, match, 0, "e2e4").andExpect(status().isNotFound());
		move(null, guest, match, 0, "e2e4").andExpect(status().isNotFound());
		resign(other, null, match, 0, "WHITE").andExpect(status().isNotFound());

		// A guest's match is their browser's: another guest id, or an account, cannot reach it.
		String guests = id(body(start(null, guest)));
		move(null, UUID.randomUUID(), guests, 0, "e2e4").andExpect(status().isNotFound());
		move(owner, null, guests, 0, "e2e4").andExpect(status().isNotFound());
		assertThat(this.jdbc.queryForObject("SELECT moves FROM chess_matches WHERE id = ?::uuid", String.class, match))
			.isEmpty();
	}

	@Test
	void changesNeedTheCsrfToken() throws Exception {
		UUID guest = UUID.randomUUID();
		String match = id(body(start(null, guest)));

		this.mockMvc.perform(post("/api/chess/matches/{id}/moves", match).header(PLAYER_HEADER, guest)
			.with(csrf().useInvalidToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":0,\"move\":\"e2e4\"}")).andExpect(status().isForbidden());
	}

	@Test
	void thereIsNoChessAiAndTheAiPathsStayAdminOnly() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);

		this.mockMvc.perform(post("/api/ai/chess/move").session(player)).andExpect(status().isForbidden());
		this.mockMvc.perform(post("/api/ai/chess/move").header(PLAYER_HEADER, UUID.randomUUID()))
			.andExpect(status().isUnauthorized());
		this.mockMvc.perform(post("/api/ai/chess/move").session(Players.signInAsAdmin(this.mockMvc)))
			.andExpect(status().isNotFound());
	}

	// --- Looks ---------------------------------------------------------------------------------------

	@Test
	void anAdminWearsChessSkinsFreeAndAPlayerMustOwnThem() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		wear(player, "CHESS_BOARD_MIDNIGHT").andExpect(status().is4xxClientError());

		MockHttpSession admin = Players.register(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", adminId);
		wear(admin, "CHESS_BOARD_MIDNIGHT").andExpect(status().isOk());
		wear(admin, "CHESS_PIECES_COPPER").andExpect(status().isOk());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'chess')].slot",
					containsInAnyOrder("board", "board", "board", "pieces", "pieces")))
			.andExpect(jsonPath("$.items[?(@.code == 'CHESS_BOARD_MIDNIGHT')].equipped", contains(true)))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'chess')].owned", contains(0, 0, 0, 0, 0)));
	}

	// --- Helpers -------------------------------------------------------------------------------------

	private MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, MockHttpSession session, UUID guest) {
		if (session != null) {
			request.session(session);
		}
		if (guest != null) {
			request.header(PLAYER_HEADER, guest);
		}
		return request.contentType(MediaType.APPLICATION_JSON);
	}

	private ResultActions start(MockHttpSession session, UUID guest) throws Exception {
		return this.mockMvc.perform(as(post("/api/chess/matches"), session, guest).content("{\"mode\":\"LOCAL\"}"));
	}

	private ResultActions move(MockHttpSession session, UUID guest, String match, int revision, String uci)
			throws Exception {
		return this.mockMvc.perform(as(post("/api/chess/matches/{id}/moves", match), session, guest)
			.content("{\"revision\":" + revision + ",\"move\":\"" + uci + "\"}"));
	}

	/** Plays moves one after the other from the match's revision now; returns the last answer. */
	private ResultActions play(MockHttpSession session, UUID guest, String match, String... moves) throws Exception {
		ResultActions last = null;
		for (String uci : moves) {
			int revision = this.jdbc.queryForObject("SELECT revision FROM chess_matches WHERE id = ?::uuid",
					Integer.class, match);
			last = move(session, guest, match, revision, uci).andExpect(status().isOk());
		}
		return last;
	}

	private ResultActions revisionOnly(MockHttpSession session, UUID guest, String match, String action, int revision)
			throws Exception {
		return this.mockMvc.perform(as(post("/api/chess/matches/{id}/" + action, match), session, guest)
			.content("{\"revision\":" + revision + "}"));
	}

	private ResultActions resign(MockHttpSession session, UUID guest, String match, int revision, String side)
			throws Exception {
		return this.mockMvc.perform(as(post("/api/chess/matches/{id}/resign", match), session, guest)
			.content("{\"revision\":" + revision + ",\"side\":\"" + side + "\"}"));
	}

	private ResultActions draw(MockHttpSession session, UUID guest, String match, int revision, String action,
			String side) throws Exception {
		return this.mockMvc.perform(as(post("/api/chess/matches/{id}/draw", match), session, guest)
			.content("{\"revision\":" + revision + ",\"action\":\"" + action + "\",\"side\":\"" + side + "\"}"));
	}

	private ResultActions wear(MockHttpSession session, String code) throws Exception {
		Long item = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
		return this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", item).session(session));
	}

	private static String body(ResultActions actions) throws Exception {
		return actions.andReturn().getResponse().getContentAsString();
	}

	private static String id(String body) {
		return JsonPath.read(body, "$.id");
	}

}
