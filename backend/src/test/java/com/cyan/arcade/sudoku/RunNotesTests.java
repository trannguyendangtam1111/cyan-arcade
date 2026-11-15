package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.sudoku.SudokuViews.NoteCell;
import com.cyan.arcade.sudoku.SudokuViews.NotesResponse;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Grid;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A signed-in player's pencil marks, kept on the server for each run so another device (or a reload)
 * picks them up: theirs alone, revisioned against stale overwrites, and never part of the game itself.
 */
@IntegrationTest
class RunNotesTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	private static final String SOME_NOTES = "{\"baseRevision\":%d,\"cells\":[{\"cell\":%d,\"digits\":[7,2,5]},"
			+ "{\"cell\":%d,\"digits\":[9]}]}";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private SudokuService sudoku;

	@Autowired
	private Clock clock;

	// --- Saving and restoring ------------------------------------------------------------------------

	@Test
	void savedNotesComeBackOnAReloadAndOnASecondSignedInDevice() throws Exception {
		String username = Players.uniqueName();
		MockHttpSession laptop = Players.register(this.mockMvc, username);
		String run = startPractice(laptop, null, null);
		int[] empty = emptyCells(run);

		notes(laptop, run).andExpect(status().isOk())
			.andExpect(content().json("{\"revision\":0,\"cells\":[]}", true));
		save(laptop, run, SOME_NOTES.formatted(0, empty[1], empty[0])).andExpect(status().isOk())
			.andExpect(jsonPath("$.revision").value(1))
			// Canonical: by cell, digits ascending.
			.andExpect(jsonPath("$.cells[0].cell").value(empty[0]))
			.andExpect(jsonPath("$.cells[0].digits").value(contains(9)))
			.andExpect(jsonPath("$.cells[1].cell").value(empty[1]))
			.andExpect(jsonPath("$.cells[1].digits").value(contains(2, 5, 7)));
		String saved = notes(laptop, run).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

		// The same account signed in somewhere else: the same notes, and the run says to sync them.
		MockHttpSession phone = signIn(username);
		this.mockMvc.perform(get("/api/sudoku/today").session(phone))
			.andExpect(jsonPath("$.practice.id").value(run))
			.andExpect(jsonPath("$.practice.notesSync").value(true));
		notes(phone, run).andExpect(content().json(saved, true));

		// The phone carries on from revision 1; the laptop then sees revision 2.
		save(phone, run, "{\"baseRevision\":1,\"cells\":[{\"cell\":%d,\"digits\":[1]}]}".formatted(empty[2]))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.revision").value(2));
		notes(laptop, run).andExpect(jsonPath("$.revision").value(2))
			.andExpect(jsonPath("$.cells.length()").value(1))
			.andExpect(jsonPath("$.cells[0].cell").value(empty[2]));
		// Clearing every note is a save like any other.
		save(laptop, run, "{\"baseRevision\":2,\"cells\":[]}").andExpect(jsonPath("$.revision").value(3))
			.andExpect(jsonPath("$.cells.length()").value(0));
		notes(phone, run).andExpect(content().json("{\"revision\":3,\"cells\":[]}", true));
	}

	@Test
	void notesAreKeptForEveryModeASignedInPlayerPlays() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String daily = JsonPath.read(as(post("/api/sudoku/daily/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"sessionId\":\"%s\"}".formatted(startSession(player, null, "daily"))), player, null)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.notesSync").value(true))
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
		String ranked = startPractice(player, null, startSession(player, null, "easy"));
		String archive = JsonPath.read(as(post("/api/sudoku/archive/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\":\"%s\"}".formatted(DailySchedule.today(this.clock).minusDays(4))), player, null)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.notesSync").value(true))
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
		assertThat(this.jdbc.queryForObject("SELECT ranked FROM sudoku_runs WHERE id = ?::uuid", Boolean.class, ranked))
			.isTrue();
		// The ranked practice game was left for a relaxed one, which a player also plays with notes.
		String relaxed = startPractice(player, null, null);

		for (String run : List.of(daily, archive, relaxed)) {
			int cell = emptyCells(run)[0];
			save(player, run, "{\"baseRevision\":0,\"cells\":[{\"cell\":%d,\"digits\":[3,4]}]}".formatted(cell))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.revision").value(1));
			notes(player, run).andExpect(jsonPath("$.cells[0].cell").value(cell))
				.andExpect(jsonPath("$.cells[0].digits").value(contains(3, 4)));
		}
		// Each run its own: the left ranked game has none, and takes no more.
		notes(player, ranked).andExpect(content().json("{\"revision\":0,\"cells\":[]}", true));
		save(player, ranked, "{\"baseRevision\":0,\"cells\":[]}").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_OVER"));
	}

	@Test
	void aRunThatIsOverKeepsItsNotesToReadButTakesNoMore() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, null);
		int[] empty = emptyCells(run);
		save(player, run, SOME_NOTES.formatted(0, empty[0], empty[1])).andExpect(status().isOk());

		int[] solution = Grid.parse(this.jdbc.queryForObject("SELECT solution FROM sudoku_runs WHERE id = ?::uuid",
				String.class, run));
		String moves = java.util.Arrays.stream(empty)
			.mapToObj((cell) -> "{\"cell\":%d,\"digit\":%d}".formatted(cell, solution[cell]))
			.reduce((a, b) -> a + "," + b)
			.orElseThrow();
		as(post("/api/sudoku/runs/{id}/moves", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"moves\":[" + moves + "]}"), player, null).andExpect(jsonPath("$.status").value("SOLVED"));

		notes(player, run).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
		save(player, run, "{\"baseRevision\":1,\"cells\":[]}").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("RUN_OVER"));
	}

	// --- Whose notes ---------------------------------------------------------------------------------

	@Test
	void nobodyElseCanReadOrChangeAPlayersNotes() throws Exception {
		MockHttpSession owner = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		String run = startPractice(owner, null, null);
		int[] empty = emptyCells(run);
		save(owner, run, SOME_NOTES.formatted(0, empty[0], empty[1])).andExpect(status().isOk());
		String saved = notes(owner, run).andReturn().getResponse().getContentAsString();

		// Another player: as if there were no such run.
		notes(other, run).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
		save(other, run, "{\"baseRevision\":1,\"cells\":[]}").andExpect(status().isNotFound());
		// Signed out, a guest id (even with the run's id) or an unknown run.
		this.mockMvc.perform(get("/api/sudoku/runs/{id}/notes", run)).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/sudoku/runs/{id}/notes", run).header(PLAYER_HEADER, UUID.randomUUID()))
			.andExpect(status().isUnauthorized());
		this.mockMvc.perform(put("/api/sudoku/runs/{id}/notes", run).header(PLAYER_HEADER, UUID.randomUUID())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"baseRevision\":1,\"cells\":[]}")).andExpect(status().isUnauthorized());
		notes(owner, UUID.randomUUID().toString()).andExpect(status().isNotFound());

		notes(owner, run).andExpect(content().json(saved, true));
	}

	@Test
	void aGuestPlaysAsEverWithNotesInTheirBrowserAndCannotReachTheirRunsNotes() throws Exception {
		UUID guest = UUID.randomUUID();
		String body = as(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content("{\"difficulty\":\"EASY\"}"), null, guest).andExpect(status().isCreated())
			.andExpect(jsonPath("$.notesSync").value(false))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String run = JsonPath.read(body, "$.id");
		as(get("/api/sudoku/today"), null, guest).andExpect(jsonPath("$.practice.notesSync").value(false));
		as(get("/api/sudoku/runs/{id}/notes", run), null, guest).andExpect(status().isUnauthorized());
		as(put("/api/sudoku/runs/{id}/notes", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"baseRevision\":0,\"cells\":[]}"), null, guest).andExpect(status().isUnauthorized());
		// A signed-in player cannot reach a guest's run either.
		notes(Players.register(this.mockMvc), run).andExpect(status().isNotFound());
		// The guest's game goes on as ever.
		int cell = emptyCells(run)[0];
		as(post("/api/sudoku/runs/{id}/moves", run).contentType(MediaType.APPLICATION_JSON)
			.content("{\"moves\":[{\"cell\":%d,\"digit\":0}]}".formatted(cell)), null, guest)
			.andExpect(status().isOk());
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM sudoku_run_notes WHERE run_id = ?::uuid",
				Integer.class, run)).isZero();
	}

	// --- What a save may hold ------------------------------------------------------------------------

	@Test
	void cellsOutsideTheBoardDigitsOutside1To9AndRepeatsAreRefused() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, null);
		List<String> bad = new ArrayList<>(List.of(
				"{\"baseRevision\":0,\"cells\":[{\"cell\":81,\"digits\":[1]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":-1,\"digits\":[1]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[0]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[10]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[1,2,3,4,5,6,7,8,9,1]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[2,2]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[2]},{\"cell\":4,\"digits\":[3]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":4,\"digits\":[null]}]}",
				"{\"baseRevision\":0,\"cells\":[{\"digits\":[1]}]}",
				"{\"baseRevision\":0,\"cells\":[null]}",
				"{\"baseRevision\":-1,\"cells\":[]}",
				"{\"cells\":[]}",
				"{\"baseRevision\":0}",
				"{\"baseRevision\":0,\"cells\":[{\"cell\":\"x\",\"digits\":[1]}]}"));
		StringBuilder tooMany = new StringBuilder("{\"baseRevision\":0,\"cells\":[");
		for (int cell = 0; cell <= 81; cell++) {
			tooMany.append((cell > 0) ? "," : "").append("{\"cell\":%d,\"digits\":[1]}".formatted(cell % 81));
		}
		bad.add(tooMany.append("]}").toString());
		for (String body : bad) {
			save(player, run, body).andExpect(status().isBadRequest());
		}
		notes(player, run).andExpect(content().json("{\"revision\":0,\"cells\":[]}", true));
		// Every cell with every digit is fine.
		StringBuilder full = new StringBuilder("{\"baseRevision\":0,\"cells\":[");
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			full.append((cell > 0) ? "," : "").append("{\"cell\":%d,\"digits\":[9,8,7,6,5,4,3,2,1]}".formatted(cell));
		}
		save(player, run, full.append("]}").toString()).andExpect(status().isOk())
			.andExpect(jsonPath("$.cells.length()").value(81))
			.andExpect(jsonPath("$.cells[80].digits").value(contains(1, 2, 3, 4, 5, 6, 7, 8, 9)));
	}

	@Test
	void theDatabaseKeepsNotesInTheirOneShape() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, null);
		save(player, run, "{\"baseRevision\":0,\"cells\":[]}").andExpect(status().isOk());
		assertThat(this.jdbc.queryForObject("SELECT notes FROM sudoku_run_notes WHERE run_id = ?::uuid", String.class,
				run)).isEqualTo(RunNotes.EMPTY);
		for (String notes : List.of("", ",".repeat(79), ",".repeat(81), "0" + RunNotes.EMPTY, "a" + RunNotes.EMPTY,
				"1234567891" + RunNotes.EMPTY)) {
			assertThatThrownBy(() -> this.jdbc.update("UPDATE sudoku_run_notes SET notes = ? WHERE run_id = ?::uuid",
					notes, run))
				.isInstanceOf(DataIntegrityViolationException.class);
		}
		assertThatThrownBy(() -> this.jdbc.update("UPDATE sudoku_run_notes SET revision = 0 WHERE run_id = ?::uuid", run))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	// --- Two devices at once -------------------------------------------------------------------------

	@Test
	void aSaveFromAStaleRevisionIsRefusedAndChangesNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, null);
		int[] empty = emptyCells(run);
		save(player, run, SOME_NOTES.formatted(0, empty[0], empty[1])).andExpect(jsonPath("$.revision").value(1));
		save(player, run, SOME_NOTES.formatted(1, empty[2], empty[3])).andExpect(jsonPath("$.revision").value(2));
		String newest = notes(player, run).andReturn().getResponse().getContentAsString();

		// A device that last saw revision 1 (or none, or one from the future) cannot overwrite it.
		for (int stale : List.of(0, 1, 3, 99)) {
			save(player, run, "{\"baseRevision\":%d,\"cells\":[]}".formatted(stale)).andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("NOTES_STALE"));
		}
		notes(player, run).andExpect(content().json(newest, true));
	}

	@Test
	void aSaveThatNamesTheMarksItExpectsGoesThroughOnlyOverThoseMarks() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = startPractice(player, null, null);
		int[] empty = emptyCells(run);
		// Nothing saved yet: no marks at all is what the server holds.
		save(player, run, "{\"baseRevision\":0,\"cells\":[{\"cell\":%d,\"digits\":[4]}],\"baseCells\":[]}"
			.formatted(empty[0])).andExpect(jsonPath("$.revision").value(1));
		// A page leaving sends its newest marks over the revision its unanswered save made: they go in.
		save(player, run, ("{\"baseRevision\":1,\"cells\":[{\"cell\":%d,\"digits\":[4]},{\"cell\":%d,\"digits\":[6]}],"
				+ "\"baseCells\":[{\"cell\":%d,\"digits\":[4]}]}").formatted(empty[0], empty[1], empty[0]))
			.andExpect(jsonPath("$.revision").value(2));
		// Another device saved that revision instead: the right number, other marks, so stale.
		String newest = notes(player, run).andReturn().getResponse().getContentAsString();
		save(player, run, "{\"baseRevision\":2,\"cells\":[],\"baseCells\":[{\"cell\":%d,\"digits\":[4]}]}"
			.formatted(empty[0])).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOTES_STALE"));
		// The right marks at a stale revision are stale as before.
		save(player, run, ("{\"baseRevision\":1,\"cells\":[],\"baseCells\":[{\"cell\":%d,\"digits\":[4]},"
				+ "{\"cell\":%d,\"digits\":[6]}]}").formatted(empty[0], empty[1]))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOTES_STALE"));
		// Base marks are checked like any marks.
		save(player, run, "{\"baseRevision\":2,\"cells\":[],\"baseCells\":[{\"cell\":81,\"digits\":[1]}]}")
			.andExpect(status().isBadRequest());
		notes(player, run).andExpect(content().json(newest, true));
	}

	@Test
	void twoDevicesSavingAtOnceFromTheSameRevisionCannotBothWin() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		UUID run = UUID.fromString(startPractice(player, null, null));
		int devices = 8;
		ExecutorService pool = Executors.newFixedThreadPool(devices);
		try {
			CountDownLatch go = new CountDownLatch(1);
			List<Future<NotesResponse>> saves = new ArrayList<>();
			for (int device = 0; device < devices; device++) {
				List<NoteCell> cells = List.of(new NoteCell(device, List.of(device + 1)));
				Callable<NotesResponse> save = () -> {
					go.await();
					return this.sudoku.saveNotes(userId, run, 0, cells, null);
				};
				saves.add(pool.submit(save));
			}
			go.countDown();
			List<NotesResponse> won = new ArrayList<>();
			int refused = 0;
			for (Future<NotesResponse> save : saves) {
				try {
					won.add(save.get(30, TimeUnit.SECONDS));
				}
				catch (java.util.concurrent.ExecutionException ex) {
					assertThat(ex.getCause()).isInstanceOf(ConflictException.class);
					refused++;
				}
			}
			assertThat(won).hasSize(1);
			assertThat(refused).isEqualTo(devices - 1);
			assertThat(won.get(0).revision()).isEqualTo(1);
			assertThat(this.sudoku.notes(userId, run)).isEqualTo(won.get(0));
		}
		finally {
			pool.shutdownNow();
		}
	}

	// --- Notes are not the game ----------------------------------------------------------------------

	@Test
	void notesNeverTouchTheBoardMistakesHintsClockScoreOrRewards() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		String session = startSession(player, null, "easy");
		String run = startPractice(player, null, session);
		int[] empty = emptyCells(run);
		as(post("/api/sudoku/runs/{id}/pause", run), player, null).andExpect(status().isOk());
		Map<String, Object> runBefore = this.jdbc.queryForMap("SELECT * FROM sudoku_runs WHERE id = ?::uuid", run);
		Map<String, Object> sessionBefore = this.jdbc.queryForMap("SELECT * FROM game_sessions WHERE id = ?::uuid",
				session);
		Map<String, Object> rewardsBefore = rewards(userId);
		String viewBefore = as(get("/api/sudoku/today"), player, null).andReturn().getResponse().getContentAsString();

		// Notes on empty cells, on clues, everywhere: saved again and again, paused or not.
		save(player, run, SOME_NOTES.formatted(0, empty[0], clue(run))).andExpect(status().isOk());
		save(player, run, SOME_NOTES.formatted(1, empty[1], empty[2])).andExpect(status().isOk());
		notes(player, run).andExpect(status().isOk());

		assertThat(this.jdbc.queryForMap("SELECT * FROM sudoku_runs WHERE id = ?::uuid", run)).isEqualTo(runBefore);
		assertThat(this.jdbc.queryForMap("SELECT * FROM game_sessions WHERE id = ?::uuid", session))
			.isEqualTo(sessionBefore);
		assertThat(rewards(userId)).isEqualTo(rewardsBefore);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE user_id = ?", Integer.class, userId))
			.isZero();
		// The run as the player sees it is the same, paused clock included.
		as(get("/api/sudoku/today"), player, null).andExpect(content().json(viewBefore, true));
	}

	// --- Helpers -------------------------------------------------------------------------------------

	private ResultActions notes(MockHttpSession session, String runId) throws Exception {
		return this.mockMvc.perform(get("/api/sudoku/runs/{id}/notes", runId).session(session));
	}

	private ResultActions save(MockHttpSession session, String runId, String body) throws Exception {
		return this.mockMvc.perform(put("/api/sudoku/runs/{id}/notes", runId).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	/** A practice game, ranked with a session or relaxed without one; returns its id. */
	private String startPractice(MockHttpSession session, UUID guest, String sessionId) throws Exception {
		String content = (sessionId != null) ? "{\"difficulty\":\"EASY\",\"sessionId\":\"%s\"}".formatted(sessionId)
				: "{\"difficulty\":\"EASY\"}";
		return JsonPath.read(as(post("/api/sudoku/practice/runs").contentType(MediaType.APPLICATION_JSON)
			.content(content), session, guest).andExpect(status().isCreated())
			.andExpect(jsonPath("$.notesSync").value(session != null))
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
	}

	private String startSession(MockHttpSession session, UUID guest, String mode) throws Exception {
		String body = as(post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"sudoku\",\"mode\":\"%s\"}".formatted(mode)), session, guest)
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private MockHttpSession signIn(String username) throws Exception {
		MockHttpSession session = new MockHttpSession();
		this.mockMvc.perform(post("/api/auth/login").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, Players.PASSWORD)))
			.andExpect(status().isOk());
		return session;
	}

	private ResultActions as(MockHttpServletRequestBuilder request, MockHttpSession session, UUID guest)
			throws Exception {
		if (session != null) {
			request.session(session);
		}
		if (guest != null) {
			request.header(PLAYER_HEADER, guest);
		}
		return this.mockMvc.perform(request);
	}

	/** The run's first clue. */
	private int clue(String runId) {
		String givens = this.jdbc.queryForObject("SELECT givens FROM sudoku_runs WHERE id = ?::uuid", String.class, runId);
		return java.util.stream.IntStream.range(0, Grid.CELLS).filter((cell) -> givens.charAt(cell) != '0').findFirst().orElseThrow();
	}

	/** The run's empty cells, in order. */
	private int[] emptyCells(String runId) {
		int[] givens = Grid.parse(this.jdbc.queryForObject("SELECT givens FROM sudoku_runs WHERE id = ?::uuid",
				String.class, runId));
		return java.util.stream.IntStream.range(0, Grid.CELLS).filter((cell) -> givens[cell] == 0).toArray();
	}

	/** Everything a finished game could pay: XP, coins, achievements and challenge progress. */
	private Map<String, Object> rewards(long userId) {
		return this.jdbc.queryForMap("""
				SELECT (SELECT xp FROM users WHERE id = :id) AS xp,
				       (SELECT count(*) FROM coin_transactions WHERE user_id = :id) AS coins,
				       (SELECT count(*) FROM user_achievements WHERE user_id = :id) AS achievements,
				       (SELECT count(*) FROM daily_challenge_progress WHERE user_id = :id) AS challenges
				""".replace(":id", Long.toString(userId)));
	}

}
