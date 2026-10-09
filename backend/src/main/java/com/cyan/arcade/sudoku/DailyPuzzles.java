package com.cyan.arcade.sudoku;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;

import com.cyan.arcade.sudoku.daily.DailySchedule;
import com.cyan.arcade.sudoku.engine.Generator;
import com.cyan.arcade.sudoku.engine.Puzzle;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The daily puzzles, as players get them: made from the date by {@link DailySchedule} the first time
 * a day is asked for, then stored, and from then on always the stored one. So a day's puzzle never
 * changes once it has been seen, whatever later versions of the generator make of its seed.
 */
@Component
class DailyPuzzles {

	private final SudokuRunStore store;

	private final Clock clock;

	DailyPuzzles(SudokuRunStore store, Clock clock) {
		this.store = store;
		this.clock = clock;
	}

	/** That day's puzzle, made and stored now if nobody has asked for it before. */
	@Transactional
	public Puzzle forDay(LocalDate day) {
		Optional<Puzzle> stored = this.store.findDailyPuzzle(day);
		if (stored.isPresent()) {
			return stored.get();
		}
		Puzzle made = DailySchedule.generate(day);
		this.store.insertDailyPuzzle(day, DailySchedule.puzzleNumber(day), made, Generator.VERSION, this.clock.instant());
		// Another request may have stored it a moment earlier: the stored one is the day's puzzle.
		return this.store.findDailyPuzzle(day).orElse(made);
	}

	/** The puzzle stored for that day, if it has been made. */
	public Optional<Puzzle> stored(LocalDate day) {
		return this.store.findDailyPuzzle(day);
	}

}
