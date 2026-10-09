package com.cyan.arcade.wordle;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.cyan.arcade.wordle.engine.Hint;
import com.cyan.arcade.wordle.engine.WordleGame;
import com.cyan.arcade.wordle.engine.WordleGame.Status;

/**
 * One Word Guess run as the server keeps it: the hidden word, every guess and every hint, and who
 * is playing. The word stays here until the run is over.
 *
 * @param sessionId for a daily run, the platform session its score is submitted with; {@code null}
 * for practice, and for a daily run whose session was cleaned up before it was finished
 * @param puzzleDate for a daily run, the UTC day of its puzzle; {@code null} for practice
 * @param streak for a solved daily run, the daily streak it made, worked out when it was solved
 */
record WordleRun(UUID id, Mode mode, UUID sessionId, Long userId, UUID playerId, LocalDate puzzleDate,
		Integer puzzleNumber, String target, List<String> guesses, List<Hint> hints, Status status, int streak,
		Instant startedAt, Instant finishedAt) {

	/** Daily runs count: score, streak and stats. Practice runs are for fun and count for nothing. */
	enum Mode {

		DAILY, PRACTICE

	}

	/** Who a run belongs to: an account, or a guest's browser. */
	record Owner(Long userId, UUID playerId) {

		Owner {
			if ((userId == null) == (playerId == null)) {
				throw new IllegalArgumentException("A run belongs to an account or to a guest");
			}
		}

	}

	WordleRun {
		guesses = List.copyOf(guesses);
		hints = List.copyOf(hints);
	}

	boolean belongsTo(Owner owner) {
		return (this.userId != null) ? this.userId.equals(owner.userId())
				: owner.userId() == null && this.playerId.equals(owner.playerId());
	}

	boolean isDaily() {
		return this.mode == Mode.DAILY;
	}

	/** The game as it stands, for showing it and playing on; it was checked move by move as it was played. */
	WordleGame game() {
		return WordleGame.replay(this.target, this.guesses, this.hints, (word) -> true);
	}

	/** The same run after a move. */
	WordleRun with(WordleGame game, int streak, Instant finishedAt) {
		return new WordleRun(this.id, this.mode, this.sessionId, this.userId, this.playerId, this.puzzleDate,
				this.puzzleNumber, this.target, game.guesses(), game.hints(), game.status(), streak, this.startedAt,
				finishedAt);
	}

}
