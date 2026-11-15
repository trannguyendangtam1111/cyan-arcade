package com.cyan.arcade.sudoku;

import java.security.SecureRandom;
import java.util.function.LongSupplier;

import com.cyan.arcade.sudoku.SudokuRun.Owner;
import com.cyan.arcade.sudoku.engine.Difficulty;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Generator.GenerationException;
import com.cyan.arcade.sudoku.engine.Puzzle;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Practice puzzles: a new one for every game, made by {@link Generator} from a fresh random seed, so
 * each is checked like any puzzle (exactly one solution, its hardest technique of the asked tier).
 * Nothing is pooled or shared between players, and nothing is stored but the run itself.
 *
 * <p>Two random seeds making the same puzzle is astronomically unlikely, but a player should never be
 * handed one they have had: a puzzle whose clues match one of the player's own runs (any mode, guest
 * or account) is made again, a few times at most. Generation takes milliseconds (Expert ~25 ms
 * typical, under 100 ms at worst), so it stays on the request.
 */
@Component
class PracticePuzzles {

	/** Puzzles made at most for one start before the last is taken anyway. */
	static final int MAX_TRIES = 3;

	private final SudokuRunStore store;

	private final LongSupplier seeds;

	@Autowired
	PracticePuzzles(SudokuRunStore store) {
		this(store, new SecureRandom()::nextLong);
	}

	/** With the seeds given, in order: for tests. */
	PracticePuzzles(SudokuRunStore store, LongSupplier seeds) {
		this.store = store;
		this.seeds = seeds;
	}

	/**
	 * A new puzzle of the difficulty that the player has not had before.
	 * @throws GenerationException when the generator cannot make one of that difficulty from its seed
	 */
	Puzzle next(Owner owner, Difficulty difficulty) {
		Puzzle puzzle = Generator.generate(difficulty, this.seeds.getAsLong());
		for (int tries = 1; tries < MAX_TRIES && this.store.hasPlayed(owner, puzzle.givens()); tries++) {
			puzzle = Generator.generate(difficulty, this.seeds.getAsLong());
		}
		return puzzle;
	}

}
