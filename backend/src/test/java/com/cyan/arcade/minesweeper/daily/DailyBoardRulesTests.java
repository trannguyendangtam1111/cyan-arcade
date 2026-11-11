package com.cyan.arcade.minesweeper.daily;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.IntStream;

import com.cyan.arcade.minesweeper.daily.DailyAttempt.Status;
import com.cyan.arcade.minesweeper.daily.DailySeeds.SecretProperties;
import com.cyan.arcade.minesweeper.daily.DailySeeds.SharedBoard;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The Daily Board's rules on their own: its calendar, its shared boards and its moves. */
class DailyBoardRulesTests {

	private static final DailyBoard BOARD = DailyBoardSchedule.BOARD;

	private final DailySeeds seeds = new DailySeeds(new SecretProperties("a-test-secret"));

	@Test
	void everyDayIsTheIntermediateBoardWithANumberCountedFromTheFirstDay() {
		assertThat(BOARD).isEqualTo(new DailyBoard(16, 16, 40));
		assertThat(DailyBoardSchedule.boardNumber(DailyBoardSchedule.FIRST_DAY)).isEqualTo(1);
		assertThat(DailyBoardSchedule.boardNumber(DailyBoardSchedule.FIRST_DAY.plusDays(6))).isEqualTo(7);
		assertThat(DailyBoardSchedule.hasBoard(DailyBoardSchedule.FIRST_DAY.minusDays(1))).isFalse();
	}

	@Test
	void theDayAndTheResetAreUtc() {
		Instant beforeMidnight = Instant.parse("2026-11-05T23:59:59.999Z");
		assertThat(DailyBoardSchedule.dateAt(beforeMidnight)).isEqualTo(LocalDate.of(2026, 11, 5));
		assertThat(DailyBoardSchedule.nextBoardAt(beforeMidnight)).isEqualTo(Instant.parse("2026-11-06T00:00:00Z"));
		assertThat(DailyBoardSchedule.dateAt(Instant.parse("2026-11-06T00:00:00Z"))).isEqualTo(LocalDate.of(2026, 11, 6));
	}

	@Test
	void theSameDateGivesTheSameBoardAndOtherDatesOrSecretsOthers() {
		LocalDate day = LocalDate.of(2026, 11, 10);
		SharedBoard board = this.seeds.boardFor(day, BOARD);
		assertThat(new DailySeeds(new SecretProperties("a-test-secret")).boardFor(day, BOARD)).isEqualTo(board);
		Set<SharedBoard> month = new HashSet<>();
		IntStream.range(0, 30).forEach((offset) -> month.add(this.seeds.boardFor(day.plusDays(offset), BOARD)));
		assertThat(month).hasSize(30).allSatisfy((other) -> assertThat(other.seed()).isBetween(0L, 0xFFFF_FFFFL));
		assertThat(month.stream().map((other) -> Arrays.toString(other.mineCells())).distinct()).hasSize(30);
		assertThat(new DailySeeds(new SecretProperties("another-secret")).boardFor(day, BOARD)).isNotEqualTo(board);
		// Without a secret configured, each server run makes its own: no board can be known in advance.
		assertThat(new DailySeeds(new SecretProperties("")).boardFor(day, BOARD))
			.isNotEqualTo(new DailySeeds(new SecretProperties(null)).boardFor(day, BOARD));
	}

	@Test
	void theSecretTheSeedAndTheMinesStayOutOfText() {
		assertThat(new SecretProperties("a-test-secret").toString()).doesNotContain("a-test-secret");
		SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 10), BOARD);
		assertThat(board.toString()).doesNotContain(Long.toString(board.seed()))
			.doesNotContain(Arrays.toString(board.mineCells()));
	}

	@Test
	void everyDaysOpeningIsAnInnerCellWithNoMineOnItOrAroundItAndLeavesSomethingToPlay() {
		for (int offset = 0; offset < 365; offset++) {
			SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 1).plusDays(offset), BOARD);
			int start = board.startCell();
			assertThat(start / 16).isBetween(1, 14);
			assertThat(start % 16).isBetween(1, 14);
			assertThat(board.mineCells()).hasSize(40).doesNotHaveDuplicates().isSorted().doesNotContain(start);
			for (int neighbour : BOARD.neighbours(start)) {
				assertThat(board.mineCells()).doesNotContain(neighbour);
			}
			// The stored mines are the ones the seed lays around the opening.
			assertThat(DailyLayout.lay(BOARD, board.seed(), start).mineCells()).isEqualTo(board.mineCells());
			DailyPlay.Move opening = DailyPlay.reveal(board.layout(BOARD), covered(), 0, 0, start);
			assertThat(opening.result()).isEqualTo(DailyPlay.Result.PLAYING);
			assertThat(opening.cells()[start]).isEqualTo('0');
			assertThat(opening.revealedCells()).isBetween(9, BOARD.safeCells() - 1);
		}
	}

	@Test
	void anAttemptIsCreatedWithTheOpeningUncoveredAndNoMoveMade() {
		SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 10), BOARD);
		DailyLayout layout = board.layout(BOARD);
		Instant now = Instant.parse("2026-11-10T08:00:00Z");
		DailyAttempt one = DailyAttempt.start(LocalDate.of(2026, 11, 10), 1, now, layout, board.startCell());
		DailyAttempt two = DailyAttempt.start(LocalDate.of(2026, 11, 10), 2, now.plusSeconds(60), layout, board.startCell());
		assertThat(one.cells()).isEqualTo(two.cells());
		assertThat(one.cells()).isEqualTo(new String(DailyPlay.reveal(layout, covered(), 0, 0, board.startCell()).cells()));
		assertThat(one.cells().charAt(board.startCell())).isEqualTo('0');
		assertThat(one.moves()).isZero();
		assertThat(one.flags()).isZero();
		assertThat(one.status()).isEqualTo(Status.PLAYING);
		assertThat(one.startedAt()).isEqualTo(now);
		assertThat(one.revealedCells()).isEqualTo((int) one.cells().chars().filter((c) -> c != 'H').count());
		for (int mine : board.mineCells()) {
			assertThat(one.cells().charAt(mine)).isEqualTo('H');
		}
		// Revealing the opening again changes nothing.
		assertThat(DailyPlay.reveal(layout, one.cells().toCharArray(), one.revealedCells(), 0, board.startCell())
			.changed()).isFalse();
	}

	@Test
	void aRevealFloodsAcrossEmptyCellsShowsOnlySafeCountsAndPassesOverFlags() {
		SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 11), BOARD);
		DailyLayout layout = board.layout(BOARD);
		int start = board.startCell();
		char[] cells = covered();
		// A flag the flood would otherwise reach: a neighbour of the opening, which is always safe.
		int flagged = BOARD.neighbours(start)[0];
		cells[flagged] = DailyPlay.FLAGGED;
		DailyPlay.Move move = DailyPlay.reveal(layout, cells, 0, 1, start);
		char[] after = move.cells();
		assertThat(after[flagged]).isEqualTo(DailyPlay.FLAGGED);
		int revealed = 0;
		for (int cell = 0; cell < BOARD.cells(); cell++) {
			char shown = after[cell];
			if (shown == DailyPlay.HIDDEN || shown == DailyPlay.FLAGGED) {
				continue;
			}
			revealed++;
			assertThat(layout.isMine(cell)).isFalse();
			assertThat(shown).isEqualTo((char) ('0' + layout.adjacent(cell)));
			if (shown == '0') {
				for (int neighbour : BOARD.neighbours(cell)) {
					assertThat(after[neighbour]).as("a neighbour of an empty cell").isNotEqualTo(DailyPlay.HIDDEN);
				}
			}
		}
		assertThat(move.revealedCells()).isEqualTo(revealed);
		assertThat(move.flags()).isEqualTo(1);
		assertThat(DailyPlay.reveal(layout, after, revealed, 1, start).changed()).isFalse();
		assertThat(DailyPlay.reveal(layout, after, revealed, 1, flagged).changed()).isFalse();
	}

	@Test
	void uncoveringAMineShowsThatMineAloneAndClearingEverySafeCellWins() {
		SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 12), BOARD);
		DailyLayout layout = board.layout(BOARD);
		DailyPlay.Move opened = DailyPlay.reveal(layout, covered(), 0, 0, board.startCell());
		int mine = layout.mineCells()[0];
		DailyPlay.Move lost = DailyPlay.reveal(layout, opened.cells(), opened.revealedCells(), 0, mine);
		assertThat(lost.result()).isEqualTo(DailyPlay.Result.LOST);
		assertThat(new String(lost.cells()).chars().filter((c) -> c == DailyPlay.EXPLODED).count()).isEqualTo(1);
		for (int other : layout.mineCells()) {
			if (other != mine) {
				assertThat(lost.cells()[other]).isEqualTo(DailyPlay.HIDDEN);
			}
		}

		DailyPlay.Move move = opened;
		for (int cell = 0; cell < BOARD.cells(); cell++) {
			if (!layout.isMine(cell) && move.cells()[cell] == DailyPlay.HIDDEN) {
				assertThat(move.result()).isEqualTo(DailyPlay.Result.PLAYING);
				move = DailyPlay.reveal(layout, move.cells(), move.revealedCells(), 0, cell);
			}
		}
		assertThat(move.result()).isEqualTo(DailyPlay.Result.WON);
		assertThat(move.revealedCells()).isEqualTo(BOARD.safeCells());
	}

	@Test
	void flagsAreSetOrClearedAsAskedAndNeverOutnumberTheMines() {
		char[] cells = covered();
		cells[5] = '1';
		DailyPlay.Move on = DailyPlay.flag(cells, 1, 0, 40, 3, true);
		assertThat(on.changed()).isTrue();
		assertThat(on.flags()).isEqualTo(1);
		assertThat(on.cells()[3]).isEqualTo(DailyPlay.FLAGGED);
		assertThat(DailyPlay.flag(on.cells(), 1, 1, 40, 3, true).changed()).isFalse();
		assertThat(DailyPlay.flag(on.cells(), 1, 1, 40, 5, true).changed()).as("an uncovered cell").isFalse();
		assertThat(DailyPlay.flag(on.cells(), 1, 40, 40, 4, true).changed()).as("one flag too many").isFalse();
		DailyPlay.Move off = DailyPlay.flag(on.cells(), 1, 1, 40, 3, false);
		assertThat(off.cells()[3]).isEqualTo(DailyPlay.HIDDEN);
		assertThat(off.flags()).isZero();
		assertThat(DailyPlay.flag(off.cells(), 1, 0, 40, 3, false).changed()).isFalse();
	}

	@Test
	void anAttemptExpiresAtItsDeadlineWithoutATimeAndAFinishedOneNeverDoes() {
		SharedBoard board = this.seeds.boardFor(LocalDate.of(2026, 11, 5), BOARD);
		Instant start = Instant.parse("2026-11-05T23:59:00Z");
		DailyAttempt attempt = DailyAttempt.start(LocalDate.of(2026, 11, 5), 1, start, board.layout(BOARD),
				board.startCell());
		Instant deadline = start.plus(DailyBoardSchedule.TIME_LIMIT);
		assertThat(attempt.deadline()).isEqualTo(deadline);
		assertThat(attempt.at(deadline.minusMillis(1)).status()).isEqualTo(Status.PLAYING);
		DailyAttempt expired = attempt.at(deadline);
		assertThat(expired.status()).isEqualTo(Status.EXPIRED);
		assertThat(expired.finishedAt()).isEqualTo(deadline);
		assertThat(expired.elapsedMs()).isNull();

		DailyAttempt won = attempt.played(DailyPlay.Result.WON, attempt.cells(), 1, 216, 0, start.plusMillis(4321));
		assertThat(won.elapsedMs()).isEqualTo(4321);
		assertThat(won.at(deadline.plusSeconds(60))).isEqualTo(won);
	}

	private static char[] covered() {
		char[] cells = new char[BOARD.cells()];
		Arrays.fill(cells, DailyPlay.HIDDEN);
		return cells;
	}

}
