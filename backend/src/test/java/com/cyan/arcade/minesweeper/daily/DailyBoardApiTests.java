package com.cyan.arcade.minesweeper.daily;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.minesweeper.daily.DailyBoardService.AttemptOverException;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.AttemptResponse;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.LeaderboardView;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The Daily Board through its API, and through its service where a test needs to choose the moment a
 * request arrives (a day's end, a deadline, the time a win took). Those tests play days between the
 * first board and today, never today (which the API tests play) nor a day to come; a day with wins
 * belongs to one test, so its leaderboard holds only that test's players.
 */
@IntegrationTest
class DailyBoardApiTests {

	private static final String BASE = "/api/minesweeper/daily";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Clock clock;

	@Autowired
	private DailyBoardService daily;

	// --- Signing in and owning -----------------------------------------------------------------------

	@Test
	void everyEndpointNeedsASignedInAccount() throws Exception {
		UUID any = UUID.randomUUID();
		this.mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
		this.mockMvc.perform(post(BASE + "/attempts")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get(BASE + "/attempts/{id}", any)).andExpect(status().isUnauthorized());
		this.mockMvc.perform(post(BASE + "/attempts/{id}/reveal", any).contentType(MediaType.APPLICATION_JSON)
			.content("{\"cell\":0}")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(post(BASE + "/attempts/{id}/flag", any).contentType(MediaType.APPLICATION_JSON)
			.content("{\"cell\":0,\"flagged\":true}")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get(BASE + "/leaderboard")).andExpect(status().isUnauthorized());
		// A guest's player id is no way in either.
		this.mockMvc.perform(post(BASE + "/attempts").header("X-Player-Id", UUID.randomUUID()))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void anotherAccountsAttemptIsNotFoundWhateverTheRequestSays() throws Exception {
		MockHttpSession owner = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		String started = start(owner).andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(started, "$.id");
		String cells = JsonPath.read(started, "$.cells");
		this.mockMvc.perform(get(BASE + "/attempts/{id}", id).session(other)).andExpect(status().isNotFound());
		reveal(other, id, "{\"cell\":0,\"userId\":%d}".formatted(Players.userId(this.mockMvc, owner)))
			.andExpect(status().isNotFound());
		flag(other, id, 0, true).andExpect(status().isNotFound());
		// The owner's attempt was not touched.
		this.mockMvc.perform(get(BASE + "/attempts/{id}", id).session(owner))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.moves").value(0))
			.andExpect(jsonPath("$.flags").value(0))
			.andExpect(jsonPath("$.cells").value(cells));
	}

	// --- Today and starting --------------------------------------------------------------------------

	@Test
	void todaysBoardAndOpeningAreDescribedWithoutItsMinesAndOneAttemptStartsOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		LocalDate today = DailyBoardSchedule.today(this.clock);
		String todayBody = this.mockMvc.perform(get(BASE).session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(today.toString()))
			.andExpect(jsonPath("$.boardNumber").value(DailyBoardSchedule.boardNumber(today)))
			.andExpect(jsonPath("$.rows").value(16))
			.andExpect(jsonPath("$.columns").value(16))
			.andExpect(jsonPath("$.mines").value(40))
			.andExpect(jsonPath("$.timeLimitMs").value(999_999))
			.andExpect(jsonPath("$.resetsAt").value(today.plusDays(1) + "T00:00:00Z"))
			.andExpect(jsonPath("$.attempt").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		Shared board = boardOn(today);
		assertThat(JsonPath.<Integer>read(todayBody, "$.startCell")).isEqualTo(board.startCell());

		String first = start(player).andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("PLAYING"))
			.andExpect(jsonPath("$.date").value(today.toString()))
			.andExpect(jsonPath("$.startCell").value(board.startCell()))
			.andExpect(jsonPath("$.cells").value(board.opening()))
			.andExpect(jsonPath("$.moves").value(0))
			.andExpect(jsonPath("$.minesLeft").value(40))
			.andExpect(jsonPath("$.finishedAt").value(nullValue()))
			.andExpect(jsonPath("$.elapsedMs").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String id = JsonPath.read(first, "$.id");
		start(player).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
		assertThat(attemptsOf(player, today)).isEqualTo(1);

		String again = this.mockMvc.perform(get(BASE).session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.attempt.id").value(id))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertNothingSecret(todayBody + first + again, board);
	}

	@Test
	void requestsStartingAtOnceMakeOneAttemptEachOnOneBoardWithTheSameOpening() throws Exception {
		List<Long> players = List.of(newPlayer(), newPlayer(), newPlayer(), newPlayer());
		LocalDate day = LocalDate.of(2026, 11, 1);
		Instant now = day.atTime(12, 0).toInstant(ZoneOffset.UTC);
		// Each player sends three starts, all twelve at once, on a day whose board nobody has asked for yet.
		AtomicInteger next = new AtomicInteger();
		List<AttemptResponse> started = atOnce(12, () -> this.daily
			.start(players.get(next.getAndIncrement() % players.size()), now)
			.attempt());
		assertThat(started.stream().map(AttemptResponse::id).distinct()).hasSize(players.size());
		Shared board = boardOn(day);
		assertThat(started).allSatisfy((attempt) -> {
			assertThat(attempt.cells()).isEqualTo(board.opening());
			assertThat(attempt.startCell()).isEqualTo(board.startCell());
			assertThat(attempt.startedAt()).isEqualTo(now);
		});
		for (long userId : players) {
			assertThat(this.jdbc.queryForObject(
					"SELECT count(*) FROM minesweeper_daily_attempts WHERE user_id = ? AND board_date = ?", Long.class,
					userId, day)).isEqualTo(1);
		}
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM minesweeper_daily_boards WHERE board_date = ?",
				Long.class, day)).isEqualTo(1);
	}

	// --- The board -----------------------------------------------------------------------------------

	@Test
	void everyAccountGetsTheSameMinesAndOpeningForADateAndTheNextDateItsOwn() throws Exception {
		LocalDate day = LocalDate.of(2026, 11, 2);
		Instant at = day.atTime(9, 0).toInstant(ZoneOffset.UTC);
		long one = newPlayer();
		long two = newPlayer();
		AttemptResponse first = this.daily.start(one, at).attempt();
		AttemptResponse second = this.daily.start(two, at.plusSeconds(3600)).attempt();
		assertThat(second.cells()).isEqualTo(first.cells());
		assertThat(second.startCell()).isEqualTo(first.startCell());
		Shared board = boardOn(day);
		assertThat(first.cells()).isEqualTo(board.opening());

		// Both play the same mines: wherever each reveals, they see the same numbers, and the same mine
		// goes off for both.
		int safe = board.coveredSafeCell(first.cells());
		assertThat(this.daily.reveal(one, first.id(), safe, at.plusSeconds(5)).cells())
			.isEqualTo(this.daily.reveal(two, second.id(), safe, at.plusSeconds(3605)).cells());
		int mine = board.mineCells()[0];
		assertThat(this.daily.reveal(one, first.id(), mine, at.plusSeconds(6)).status()).isEqualTo("LOST");
		assertThat(this.daily.reveal(two, second.id(), mine, at.plusSeconds(3606)).status()).isEqualTo("LOST");
		// Playing changed nothing about the day's board.
		assertThat(boardOn(day)).isEqualTo(board);

		AttemptResponse nextDay = this.daily.start(newPlayer(), at.plusSeconds(86_400)).attempt();
		Shared tomorrow = boardOn(day.plusDays(1));
		assertThat(tomorrow.mineCells()).isNotEqualTo(board.mineCells());
		assertThat(nextDay.cells()).isEqualTo(tomorrow.opening()).isNotEqualTo(first.cells());
	}

	@Test
	void theOpeningIsUncoveredOnceAndNothingHiddenIsEverShown() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		LocalDate today = DailyBoardSchedule.today(this.clock);
		String started = start(player).andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(started, "$.id");
		Shared board = boardOn(today);
		String opening = JsonPath.read(started, "$.cells");
		int revealed = JsonPath.read(started, "$.revealedCells");
		assertThat(opening.charAt(board.startCell())).isEqualTo('0');
		assertThat(opening.chars().filter((c) -> c != 'H').count()).isEqualTo(revealed);
		assertThat(revealed).isGreaterThanOrEqualTo(9);
		for (int mine : board.mineCells()) {
			assertThat(opening.charAt(mine)).isEqualTo('H');
		}

		// Revealing the opening, or any cell it uncovered, changes nothing and is no move.
		reveal(player, id, "{\"cell\":%d}".formatted(board.startCell())).andExpect(status().isOk())
			.andExpect(jsonPath("$.cells").value(opening))
			.andExpect(jsonPath("$.revealedCells").value(revealed))
			.andExpect(jsonPath("$.moves").value(0));

		// Flags are kept, and only ever say what the player put there.
		int covered = opening.indexOf('H');
		flag(player, id, covered, true).andExpect(status().isOk())
			.andExpect(jsonPath("$.flags").value(1))
			.andExpect(jsonPath("$.minesLeft").value(39));
		flag(player, id, covered, true).andExpect(status().isOk()).andExpect(jsonPath("$.flags").value(1));

		// The mine that goes off is the only one shown, even once the attempt is over.
		int mine = Arrays.stream(board.mineCells()).filter((cell) -> cell != covered).findFirst().orElseThrow();
		String lost = reveal(player, id, "{\"cell\":%d}".formatted(mine)).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("LOST"))
			.andExpect(jsonPath("$.moves").value(1))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String after = JsonPath.read(lost, "$.cells");
		assertThat(after.charAt(mine)).isEqualTo('X');
		assertThat(after.chars().filter((c) -> c == 'X').count()).isEqualTo(1);
		for (int other : board.mineCells()) {
			if (other != mine) {
				assertThat(after.charAt(other)).isIn('H', 'F');
			}
		}
		String fetched = this.mockMvc.perform(get(BASE + "/attempts/{id}", id).session(player))
			.andExpect(jsonPath("$.cells").value(after))
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertNothingSecret(started + lost + fetched, board);
	}

	// --- Bad requests and finished attempts ----------------------------------------------------------

	@Test
	void cellsOffTheBoardAndMalformedRequestsAreRefused() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String started = start(player).andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(started, "$.id");
		reveal(player, id, "{\"cell\":256}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		reveal(player, id, "{\"cell\":-1}").andExpect(status().isBadRequest());
		reveal(player, id, "{}").andExpect(status().isBadRequest());
		reveal(player, id, "{\"cell\":\"two\"}").andExpect(status().isBadRequest());
		reveal(player, id, "not json").andExpect(status().isBadRequest());
		flag(player, id, 300, true).andExpect(status().isBadRequest());
		this.mockMvc.perform(post(BASE + "/attempts/{id}/flag", id).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"cell\":3}")).andExpect(status().isBadRequest());
		this.mockMvc.perform(get(BASE + "/attempts/not-an-id").session(player)).andExpect(status().isBadRequest());
		this.mockMvc.perform(get(BASE + "/attempts/{id}", UUID.randomUUID()).session(player))
			.andExpect(status().isNotFound());
		// None of it changed the attempt.
		this.mockMvc.perform(get(BASE + "/attempts/{id}", id).session(player))
			.andExpect(jsonPath("$.moves").value(0))
			.andExpect(jsonPath("$.cells").value(JsonPath.<String>read(started, "$.cells")));
	}

	@Test
	void aWonAttemptTakesTheServersTimeAndNothingAfterwards() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		LocalDate today = DailyBoardSchedule.today(this.clock);
		String started = start(player).andReturn().getResponse().getContentAsString();
		String id = JsonPath.read(started, "$.id");
		// The attempt started five seconds ago, as far as the server knows.
		this.jdbc.update("UPDATE minesweeper_daily_attempts SET started_at = started_at - interval '5 seconds' WHERE id = ?::uuid", id);
		Shared board = boardOn(today);
		String last = null;
		String cells = JsonPath.read(started, "$.cells");
		for (int cell = 0; cell < 256; cell++) {
			if (board.isMine(cell) || cells.charAt(cell) != 'H') {
				continue;
			}
			// Whatever a client claims about its time, result, board or first cell is not read.
			last = reveal(player, id, "{\"cell\":%d,\"elapsedMs\":1,\"status\":\"WON\",\"startCell\":0,\"cells\":\"%s\"}"
				.formatted(cell, "0".repeat(256)))
				.andExpect(status().isOk())
				.andReturn()
				.getResponse()
				.getContentAsString();
			cells = JsonPath.read(last, "$.cells");
		}
		assertThat(JsonPath.<String>read(last, "$.status")).isEqualTo("WON");
		assertThat(JsonPath.<Integer>read(last, "$.revealedCells")).isEqualTo(216);
		int elapsed = JsonPath.read(last, "$.elapsedMs");
		assertThat(elapsed).isBetween(5_000, 60_000);
		Instant startedAt = Instant.parse(JsonPath.read(last, "$.startedAt"));
		Instant finishedAt = Instant.parse(JsonPath.read(last, "$.finishedAt"));
		assertThat(finishedAt.toEpochMilli() - startedAt.toEpochMilli()).isEqualTo(elapsed);

		reveal(player, id, "{\"cell\":%d}".formatted(board.mineCells()[0])).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ATTEMPT_OVER"));
		flag(player, id, board.mineCells()[0], true).andExpect(status().isConflict());
		start(player).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
			.andExpect(jsonPath("$.status").value("WON"))
			.andExpect(jsonPath("$.elapsedMs").value(elapsed));

		this.mockMvc.perform(get(BASE + "/leaderboard").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(today.toString()))
			.andExpect(jsonPath("$.myElapsedMs").value(elapsed))
			.andExpect(jsonPath("$.entries[?(@.you == true)].elapsedMs").value(elapsed));
		assertThat(this.jdbc.queryForObject(
				"SELECT elapsed_ms FROM minesweeper_daily_attempts WHERE user_id = ? AND board_date = ?", Integer.class,
				userId, today)).isEqualTo(elapsed);
	}

	@Test
	void theLastRevealSentManyTimesAtOnceFinishesTheAttemptOnce() throws Exception {
		long userId = newPlayer();
		LocalDate day = LocalDate.of(2026, 11, 4);
		Instant startAt = day.atTime(10, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int lastCell = playAllButOne(userId, id, startAt.plusSeconds(20));
		Instant finishAt = startAt.plusMillis(31_250);
		List<Object> outcomes = atOnce(8, () -> {
			try {
				return this.daily.reveal(userId, id, lastCell, finishAt);
			}
			catch (AttemptOverException ex) {
				return ex.getCode();
			}
		});
		assertThat(outcomes).filteredOn(AttemptResponse.class::isInstance).hasSize(1);
		assertThat(outcomes).filteredOn("ATTEMPT_OVER"::equals).hasSize(7);
		AttemptResponse won = (AttemptResponse) outcomes.stream().filter(AttemptResponse.class::isInstance).findFirst().orElseThrow();
		assertThat(won.status()).isEqualTo("WON");
		assertThat(won.elapsedMs()).isEqualTo(31_250);
		assertThat(this.jdbc.queryForObject(
				"SELECT count(*) FROM minesweeper_daily_attempts WHERE id = ? AND status = 'WON' AND elapsed_ms = 31250",
				Long.class, id)).isEqualTo(1);
		assertThat(this.daily.leaderboard(userId, day, 0, 20, finishAt).totalEntries()).isEqualTo(1);
	}

	// --- The day's end and the time limit ------------------------------------------------------------

	@Test
	void anAttemptStartedBeforeMidnightIsFinishedOnItsOwnBoardAndTheNextStartIsTheNextDays() throws Exception {
		long userId = newPlayer();
		LocalDate day = LocalDate.of(2026, 11, 5);
		Instant beforeMidnight = Instant.parse("2026-11-05T23:59:50Z");
		UUID id = this.daily.start(userId, beforeMidnight).attempt().id();
		int lastCell = playAllButOne(userId, id, beforeMidnight.plusSeconds(5));
		Instant afterMidnight = Instant.parse("2026-11-06T00:00:07Z");
		// After midnight, today is the new day, with its own board and no attempt at it yet.
		DailyBoardViews.TodayResponse newDay = this.daily.today(userId, afterMidnight);
		assertThat(newDay.date()).isEqualTo(day.plusDays(1));
		assertThat(newDay.attempt()).isNull();
		assertThat(newDay.startCell()).isEqualTo(boardOn(day.plusDays(1)).startCell());
		// The old attempt is still played on its own day's mines.
		AttemptResponse won = this.daily.reveal(userId, id, lastCell, afterMidnight);
		assertThat(won.status()).isEqualTo("WON");
		assertThat(won.date()).isEqualTo(day);
		assertThat(won.elapsedMs()).isEqualTo(17_000);
		assertThat(this.daily.leaderboard(userId, day, 0, 20, afterMidnight).myElapsedMs()).isEqualTo(17_000);
		assertThat(this.daily.leaderboard(userId, day.plusDays(1), 0, 20, afterMidnight).totalEntries()).isZero();

		AttemptResponse next = this.daily.start(userId, afterMidnight.plusSeconds(1)).attempt();
		assertThat(next.id()).isNotEqualTo(id);
		assertThat(next.date()).isEqualTo(day.plusDays(1));
		assertThat(next.status()).isEqualTo("PLAYING");
		assertThat(next.cells()).isEqualTo(boardOn(day.plusDays(1)).opening());
	}

	@Test
	void anAttemptNotFinishedInTimeExpiresUnrankedAndTakesNoMoreMoves() throws Exception {
		long userId = newPlayer();
		LocalDate day = LocalDate.of(2026, 11, 6);
		Instant startAt = Instant.parse("2026-11-06T10:00:00Z");
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int lastCell = playAllButOne(userId, id, startAt.plusSeconds(30));
		Instant deadline = startAt.plus(DailyBoardSchedule.TIME_LIMIT);
		// Before anything is saved, the attempt already reads as expired.
		assertThat(this.daily.attempt(userId, id, deadline).status()).isEqualTo("EXPIRED");
		assertThatThrownBy(() -> this.daily.reveal(userId, id, lastCell, deadline))
			.isInstanceOf(AttemptOverException.class);
		assertThat(this.jdbc.queryForMap("SELECT status, elapsed_ms, finished_at FROM minesweeper_daily_attempts WHERE id = ?", id))
			.containsEntry("status", "EXPIRED")
			.containsEntry("elapsed_ms", null);
		assertThatThrownBy(() -> this.daily.flag(userId, id, lastCell, true, deadline.plusSeconds(1)))
			.isInstanceOf(AttemptOverException.class);
		assertThat(this.daily.leaderboard(userId, day, 0, 20, deadline).totalEntries()).isZero();
		assertThat(this.daily.start(userId, deadline.plusSeconds(5)).attempt().status()).as("still the same day")
			.isEqualTo("EXPIRED");
	}

	// --- The leaderboard -----------------------------------------------------------------------------

	@Test
	void theDaysLeaderboardRanksWinsByServerTimeThenWhoFinishedFirst() throws Exception {
		LocalDate day = LocalDate.of(2026, 11, 3);
		Instant t0 = day.atTime(14, 0).toInstant(ZoneOffset.UTC);
		long slow = newPlayer();
		long tiedFirst = newPlayer();
		long tiedSecond = newPlayer();
		long loser = newPlayer();
		win(slow, t0, 50_000);
		win(tiedFirst, t0.plusSeconds(10), 30_000);
		win(tiedSecond, t0.plusSeconds(20), 30_000);
		UUID lost = this.daily.start(loser, t0).attempt().id();
		assertThat(this.daily.reveal(loser, lost, boardOn(day).mineCells()[0], t0.plusSeconds(2)).status())
			.isEqualTo("LOST");

		Instant now = t0.plusSeconds(3600);
		LeaderboardView board = this.daily.leaderboard(tiedSecond, day, 0, 20, now);
		assertThat(board.totalEntries()).isEqualTo(3);
		assertThat(board.entries()).extracting((entry) -> entry.rank() + ":" + entry.elapsedMs())
			.containsExactly("1:30000", "2:30000", "3:50000");
		assertThat(board.entries().get(0).player().username()).isEqualTo(usernameOf(tiedFirst));
		assertThat(board.entries().get(1).you()).isTrue();
		assertThat(board.myRank()).isEqualTo(2);
		assertThat(board.myElapsedMs()).isEqualTo(30_000);
		assertThat(this.daily.leaderboard(loser, day, 0, 20, now).myRank()).isNull();
		LeaderboardView second = this.daily.leaderboard(slow, day, 1, 2, now);
		assertThat(second.entries()).extracting(DailyBoardViews.Entry::rank).containsExactly(3L);
		assertThat(second.totalPages()).isEqualTo(2);
	}

	@Test
	void noLeaderboardForADayToComeOrBeforeTheFirstBoard() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		LocalDate today = DailyBoardSchedule.today(this.clock);
		this.mockMvc.perform(get(BASE + "/leaderboard").param("date", today.plusDays(1).toString()).session(player))
			.andExpect(status().isNotFound());
		this.mockMvc.perform(get(BASE + "/leaderboard").param("date", DailyBoardSchedule.FIRST_DAY.minusDays(1).toString())
			.session(player)).andExpect(status().isNotFound());
		this.mockMvc.perform(get(BASE + "/leaderboard").param("date", "tomorrow").session(player))
			.andExpect(status().isBadRequest());
		this.mockMvc.perform(get(BASE + "/leaderboard").param("size", "500").session(player))
			.andExpect(status().isBadRequest());
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM minesweeper_daily_boards WHERE board_date > ?",
				Long.class, today)).as("no board made ahead of its day").isZero();
		start(player).andExpect(status().isCreated()).andExpect(jsonPath("$.date").value(today.toString()));
	}

	// --- Helpers -------------------------------------------------------------------------------------

	/** A day's board as the server stored it, read straight from the database. */
	private record Shared(long seed, int startCell, int[] mineCells) {

		boolean isMine(int cell) {
			return Arrays.stream(this.mineCells).anyMatch((mine) -> mine == cell);
		}

		DailyLayout layout() {
			return DailyLayout.withMines(DailyBoardSchedule.BOARD, this.mineCells);
		}

		/** The board every attempt that day starts with. */
		String opening() {
			return new String(DailyPlay.reveal(layout(), "H".repeat(256).toCharArray(), 0, 0, this.startCell).cells());
		}

		int coveredSafeCell(String cells) {
			for (int cell = 0; cell < 256; cell++) {
				if (!isMine(cell) && cells.charAt(cell) == 'H') {
					return cell;
				}
			}
			throw new IllegalStateException("Nothing left to reveal");
		}

		@Override
		public boolean equals(Object other) {
			return other instanceof Shared that && this.seed == that.seed && this.startCell == that.startCell
					&& Arrays.equals(this.mineCells, that.mineCells);
		}

		@Override
		public int hashCode() {
			return Arrays.hashCode(this.mineCells);
		}

	}

	private Shared boardOn(LocalDate date) {
		Map<String, Object> row = this.jdbc.queryForMap(
				"SELECT seed, start_cell, array_to_string(mine_cells, ',') AS mines FROM minesweeper_daily_boards WHERE board_date = ?",
				date);
		return new Shared(((Number) row.get("seed")).longValue(), ((Number) row.get("start_cell")).intValue(),
				Arrays.stream(((String) row.get("mines")).split(",")).mapToInt(Integer::parseInt).toArray());
	}

	/** No seed, no mine that has not gone off, and no list of mines in what the API sent. */
	private static void assertNothingSecret(String bodies, Shared board) {
		assertThat(bodies).doesNotContainIgnoringCase("seed")
			.doesNotContainIgnoringCase("mineCells")
			.doesNotContain(Arrays.toString(board.mineCells()).replace(" ", ""));
		// A short seed could turn up inside a timestamp by chance; a long one cannot.
		if (board.seed() > 99_999_999L) {
			assertThat(bodies).doesNotContain(Long.toString(board.seed()));
		}
	}

	private ResultActions start(MockHttpSession player) throws Exception {
		return this.mockMvc.perform(post(BASE + "/attempts").session(player));
	}

	private ResultActions reveal(MockHttpSession player, String id, String body) throws Exception {
		return this.mockMvc.perform(post(BASE + "/attempts/{id}/reveal", id).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	private ResultActions flag(MockHttpSession player, String id, int cell, boolean flagged) throws Exception {
		return this.mockMvc.perform(post(BASE + "/attempts/{id}/flag", id).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"cell\":%d,\"flagged\":%s}".formatted(cell, flagged)));
	}

	private long newPlayer() throws Exception {
		return Players.userId(this.mockMvc, Players.register(this.mockMvc));
	}

	private long attemptsOf(MockHttpSession player, LocalDate date) throws Exception {
		return this.jdbc.queryForObject("SELECT count(*) FROM minesweeper_daily_attempts WHERE user_id = ? AND board_date = ?",
				Long.class, Players.userId(this.mockMvc, player), date);
	}

	private String usernameOf(long userId) {
		return this.jdbc.queryForObject("SELECT username FROM users WHERE id = ?", String.class, userId);
	}

	/** Reveals every safe cell but one, at that moment, and returns the one left. */
	private int playAllButOne(long userId, UUID id, Instant at) {
		AttemptResponse now = this.daily.attempt(userId, id, at);
		DailyLayout layout = boardOn(now.date()).layout();
		List<Integer> covered = new ArrayList<>();
		for (int cell = 0; cell < 256; cell++) {
			if (!layout.isMine(cell) && now.cells().charAt(cell) == 'H') {
				covered.add(cell);
			}
		}
		// The cell kept for last must be one no other reveal's flood uncovers: a number with no empty cell
		// around it, or else an empty cell (a flood runs only through the empty cells it is joined to).
		int last = covered.stream()
			.filter((cell) -> layout.adjacent(cell) > 0 && Arrays.stream(DailyBoardSchedule.BOARD.neighbours(cell))
				.noneMatch((other) -> !layout.isMine(other) && layout.adjacent(other) == 0))
			.findFirst()
			.orElseGet(() -> covered.stream().filter((cell) -> layout.adjacent(cell) == 0).findFirst().orElseThrow());
		List<Integer> keptBack = floodOf(layout, now.cells(), last);
		for (int cell : covered) {
			if (!keptBack.contains(cell) && now.cells().charAt(cell) == 'H') {
				now = this.daily.reveal(userId, id, cell, at);
			}
		}
		assertThat(now.status()).isEqualTo("PLAYING");
		assertThat(now.cells().charAt(last)).isEqualTo('H');
		return last;
	}

	/** The cells a reveal there would uncover now. */
	private static List<Integer> floodOf(DailyLayout layout, String cells, int cell) {
		char[] after = DailyPlay.reveal(layout, cells.toCharArray(), 0, 0, cell).cells();
		List<Integer> flood = new ArrayList<>();
		for (int other = 0; other < after.length; other++) {
			if (after[other] != cells.charAt(other)) {
				flood.add(other);
			}
		}
		return flood;
	}

	private void win(long userId, Instant startAt, long elapsedMs) {
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int lastCell = playAllButOne(userId, id, startAt.plusMillis(elapsedMs / 2));
		assertThat(this.daily.reveal(userId, id, lastCell, startAt.plusMillis(elapsedMs)).status()).isEqualTo("WON");
	}

	/** Runs the task on that many threads, all let go at the same moment, and collects what each returned. */
	private static <T> List<T> atOnce(int threads, Callable<? extends T> task) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		try {
			CountDownLatch go = new CountDownLatch(1);
			List<Future<? extends T>> futures = new ArrayList<>();
			for (int i = 0; i < threads; i++) {
				futures.add(pool.submit(() -> {
					go.await();
					return task.call();
				}));
			}
			go.countDown();
			List<T> results = new ArrayList<>();
			for (Future<? extends T> future : futures) {
				results.add(future.get(30, TimeUnit.SECONDS));
			}
			return results;
		}
		finally {
			pool.shutdownNow();
		}
	}

}
