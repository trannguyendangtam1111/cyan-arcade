package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.score.GameSessionService;
import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.SudokuViews.BoardEntry;
import com.cyan.arcade.sudoku.SudokuViews.DailyLeaderboardResponse;
import com.cyan.arcade.sudoku.SudokuViews.MoveRequest;
import com.cyan.arcade.sudoku.SudokuViews.RunResponse;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Grid;
import com.cyan.arcade.sudoku.engine.Puzzle;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A Daily Sudoku, and the archive of past ones, across midnight UTC, on a clock the test moves: the
 * shared context's clock stays real, and the Sudoku service and the dated board are built here around a
 * clock of their own.
 */
@IntegrationTest
class DailyMidnightTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private SudokuRunStore store;

	@Autowired
	private DailyPuzzles dailyPuzzles;

	@Autowired
	private GameSessionService sessions;

	@Autowired
	private JdbcClient jdbc;

	@Test
	void aDailyStartedBeforeMidnightAndSolvedAfterRanksOnItsOwnPuzzleDate() throws Exception {
		// Yesterday, two minutes before midnight UTC: the puzzle of the day is yesterday's.
		LocalDate puzzleDay = LocalDate.now(ZoneOffset.UTC).minusDays(1);
		LocalDate nextDay = puzzleDay.plusDays(1);
		MovableClock clock = new MovableClock(puzzleDay.atTime(23, 58).toInstant(ZoneOffset.UTC));
		SudokuService sudoku = new SudokuService(this.store, this.dailyPuzzles, this.sessions, clock,
				new PracticePuzzles(this.store));
		DailyLeaderboard boards = new DailyLeaderboard(this.jdbc, clock);

		MockHttpSession player = Players.register(this.mockMvc);
		Owner owner = new Owner(Players.userId(this.mockMvc, player), null);
		String session = startSession(player);
		RunResponse started = sudoku.startDaily(owner, UUID.fromString(session));
		assertThat(started.date()).isEqualTo(puzzleDay);
		assertThat(started.puzzleNumber()).isEqualTo(DailySchedule.puzzleNumber(puzzleDay));
		// Before midnight the next day's board does not exist yet.
		assertThat(boards.board(null, 0, 20, owner).date()).isEqualTo(puzzleDay);
		assertThatThrownBy(() -> boards.board(nextDay, 0, 20, owner)).isInstanceOf(NotFoundException.class);

		// Four minutes later, after midnight, the last cells go in.
		clock.advance(Duration.ofMinutes(4));
		Puzzle puzzle = this.dailyPuzzles.forDay(puzzleDay);
		int[] givens = Grid.parse(puzzle.givens());
		int[] solution = Grid.parse(puzzle.solution());
		List<MoveRequest> rest = new ArrayList<>();
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (givens[cell] == 0) {
				rest.add(new MoveRequest(cell, solution[cell]));
			}
		}
		RunResponse solved = sudoku.move(owner, started.id(), rest);
		assertThat(solved.status()).isEqualTo("SOLVED");
		assertThat(solved.elapsedMs()).isEqualTo(Duration.ofMinutes(4).toMillis());
		this.mockMvc.perform(post("/api/game-sessions/{id}/finish", session).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(solved.result().score(),
					HonestRuns.json(solved.result().details()))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.mode").value("daily"));

		// Today's board is now the next day's, without the score; the puzzle's own day has it.
		DailyLeaderboardResponse today = boards.board(null, 0, 100, owner);
		assertThat(today.date()).isEqualTo(nextDay);
		assertThat(today.entries()).noneMatch(BoardEntry::you);
		assertThat(today.myScore()).isNull();
		DailyLeaderboardResponse own = boards.board(puzzleDay, 0, 100, owner);
		assertThat(own.puzzleNumber()).isEqualTo(DailySchedule.puzzleNumber(puzzleDay));
		assertThat(own.myScore()).isEqualTo(solved.result().score());
		assertThat(own.entries()).filteredOn(BoardEntry::you).singleElement()
			.extracting(BoardEntry::score)
			.isEqualTo(solved.result().score());
	}

	@Test
	void theArchiveGainsADayAtMidnightAndAReplayCarriesOnAcrossIt() {
		// The last millisecond of yesterday UTC: yesterday's puzzle is still the Daily, not in the archive.
		LocalDate puzzleDay = LocalDate.now(ZoneOffset.UTC).minusDays(1);
		LocalDate dayBefore = puzzleDay.minusDays(1);
		MovableClock clock = new MovableClock(puzzleDay.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC).minusMillis(1));
		SudokuService sudoku = new SudokuService(this.store, this.dailyPuzzles, this.sessions, clock,
				new PracticePuzzles(this.store));
		Owner guest = new Owner(null, UUID.randomUUID());

		assertThat(sudoku.today(guest).date()).isEqualTo(puzzleDay);
		assertThatThrownBy(() -> sudoku.archivePuzzle(puzzleDay)).isInstanceOfSatisfying(ApiException.class,
				(refused) -> assertThat(refused.getCode()).isEqualTo(SudokuService.NOT_IN_ARCHIVE));
		assertThatThrownBy(() -> sudoku.startArchive(guest, puzzleDay)).isInstanceOf(ApiException.class);
		RunResponse replay = sudoku.startArchive(guest, dayBefore);
		assertThat(replay.date()).isEqualTo(dayBefore);
		Puzzle puzzle = this.dailyPuzzles.forDay(dayBefore);
		int[] givens = Grid.parse(puzzle.givens());
		int[] solution = Grid.parse(puzzle.solution());
		List<MoveRequest> rest = new ArrayList<>();
		for (int cell = 0; cell < Grid.CELLS; cell++) {
			if (givens[cell] == 0) {
				rest.add(new MoveRequest(cell, solution[cell]));
			}
		}
		sudoku.move(guest, replay.id(), rest.subList(0, 1));

		// One millisecond later it is a new UTC day: yesterday's puzzle is in the archive, today's is not.
		clock.advance(Duration.ofMillis(1));
		assertThat(sudoku.today(guest).date()).isEqualTo(puzzleDay.plusDays(1));
		assertThat(sudoku.archivePuzzle(puzzleDay).puzzleNumber()).isEqualTo(DailySchedule.puzzleNumber(puzzleDay));
		assertThatThrownBy(() -> sudoku.archivePuzzle(puzzleDay.plusDays(1))).isInstanceOf(ApiException.class);
		// The replay started before midnight is the same game after it, and still unranked.
		assertThat(sudoku.today(guest).archive().id()).isEqualTo(replay.id());
		RunResponse solved = sudoku.move(guest, replay.id(), rest.subList(1, rest.size()));
		assertThat(solved.status()).isEqualTo("SOLVED");
		assertThat(solved.ranked()).isFalse();
		assertThat(solved.result()).isNull();
		assertThat(sudoku.startArchive(guest, puzzleDay).puzzleNumber()).isEqualTo(DailySchedule.puzzleNumber(puzzleDay));
	}

	private String startSession(MockHttpSession player) throws Exception {
		String body = this.mockMvc.perform(post("/api/game-sessions").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"sudoku\",\"mode\":\"daily\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	private static final class MovableClock extends Clock {

		private Instant now;

		MovableClock(Instant now) {
			this.now = now;
		}

		void advance(Duration duration) {
			this.now = this.now.plus(duration);
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			throw new UnsupportedOperationException();
		}

		@Override
		public Instant instant() {
			return this.now;
		}

	}

}
