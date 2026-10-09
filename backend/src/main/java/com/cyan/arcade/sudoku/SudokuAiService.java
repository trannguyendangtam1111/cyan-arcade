package com.cyan.arcade.sudoku;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDate;
import java.util.random.RandomGenerator;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.sudoku.SudokuViews.AiMove;
import com.cyan.arcade.sudoku.SudokuViews.SolveRequest;
import com.cyan.arcade.sudoku.SudokuViews.SolveResponse;
import com.cyan.arcade.sudoku.ai.SudokuAi;
import com.cyan.arcade.sudoku.ai.SudokuAi.Solution;
import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Generator.GenerationException;
import com.cyan.arcade.sudoku.engine.Puzzle;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * AI mode, for admins: the AI solves a daily puzzle (the very one players get that day) or a
 * practice puzzle, and every move it returns has been played through a real game of the puzzle by
 * the same rules as a player's (see {@link SudokuAi}). Nothing is saved: an AI solve is never a run,
 * so it has no session, no score, no rewards and no statistics, and it changes no one's account.
 */
@Service
class SudokuAiService {

	private final DailyPuzzles dailyPuzzles;

	private final Clock clock;

	private final RandomGenerator random = new SecureRandom();

	SudokuAiService(DailyPuzzles dailyPuzzles, Clock clock) {
		this.dailyPuzzles = dailyPuzzles;
		this.clock = clock;
	}

	SolveResponse solve(SolveRequest request) {
		LocalDate today = DailySchedule.today(this.clock);
		Puzzle puzzle;
		LocalDate date = null;
		if (request.difficulty() != null && request.date() == null) {
			long seed = (request.seed() != null) ? request.seed() : this.random.nextLong();
			try {
				puzzle = Generator.generate(request.difficulty(), seed);
			}
			catch (GenerationException ex) {
				throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, SudokuService.PUZZLE_UNAVAILABLE,
						"No puzzle could be made from that seed");
			}
		}
		else {
			date = (request.date() != null) ? request.date() : today;
			if (!DailySchedule.hasPuzzle(date) || date.isAfter(today)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
						"Pick a day from %s to today".formatted(DailySchedule.FIRST_DAY));
			}
			puzzle = this.dailyPuzzles.forDay(date);
		}
		long started = System.nanoTime();
		Solution solution = SudokuAi.solve(request.strategy(), puzzle.givenValues());
		long millis = (System.nanoTime() - started) / 1_000_000;
		return new SolveResponse(request.strategy(), date, (date != null) ? DailySchedule.puzzleNumber(date) : null,
				puzzle.difficulty(), puzzle.seed(), puzzle.givens(), solution.solution(),
				solution.moves().stream().map(SudokuAiService::move).toList(), solution.guesses(), solution.backtracks(),
				solution.techniques(), solution.searched(), solution.trimmed(), millis);
	}

	private static AiMove move(SudokuAi.Move move) {
		return new AiMove(move.kind().name(), move.cell(), move.digit(),
				move.eliminations().stream().map((elimination) -> elimination.cell() + ":" + elimination.digit()).toList(),
				move.cleared(), move.technique(), move.text(), move.lesson(), move.highlight());
	}

}
