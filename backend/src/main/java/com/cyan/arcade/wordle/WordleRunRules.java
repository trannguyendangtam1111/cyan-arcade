package com.cyan.arcade.wordle;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.cyan.arcade.score.RunRules;
import com.cyan.arcade.wordle.daily.DailySchedule;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import com.cyan.arcade.wordle.engine.Hint;
import com.cyan.arcade.wordle.engine.Scoring;
import com.cyan.arcade.wordle.engine.WordleGame;
import com.cyan.arcade.wordle.engine.WordleGame.GuessRejectedException;
import com.cyan.arcade.wordle.engine.WordleGame.Status;
import com.cyan.arcade.wordle.engine.WordleRules;

import org.springframework.stereotype.Component;

/**
 * Word Guess's {@link RunRules}. Unlike the other games, the server played this run itself: it
 * holds the word, every guess and every hint. So a submission is not judged by whether it looks
 * possible but by whether it is exactly the run the server recorded for the session:
 *
 * <ul>
 * <li>the session has a daily run (practice is never scored), and that run is over;</li>
 * <li>its word is the Daily Word of its day;</li>
 * <li>replayed through the rules, every guess is an allowed word, there are at most six, and the
 * run ends where it was recorded to end (solved by its last guess, or failed after six);</li>
 * <li>at most three hints, one of each kind;</li>
 * <li>the score and every detail are what {@link Scoring} gives for that run, with the streak the
 * server worked out when it was solved.</li>
 * </ul>
 *
 * Time does not enter the score, so it is not checked beyond the platform's session lifetime. A
 * session can be finished only once, and a daily run is tied to one session at a time and never to
 * a new one once its score is in, so a day's puzzle is rewarded once.
 */
@Component
class WordleRunRules implements RunRules {

	private static final Set<String> DETAILS = Scoring.details(true, 1, 0, 1).keySet();

	private final WordleRunStore store;

	private final DailySchedule schedule;

	private final Dictionary dictionary;

	WordleRunRules(WordleRunStore store, DailySchedule schedule, Dictionary dictionary) {
		this.store = store;
		this.schedule = schedule;
		this.dictionary = dictionary;
	}

	@Override
	public String gameSlug() {
		return WordleService.GAME_SLUG;
	}

	@Override
	public Set<String> details() {
		return DETAILS;
	}

	/** Without the session, only whether the numbers agree with each other: a Word Guess run must also match its session. */
	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int solved = details.get("solved");
		int guesses = details.get("guesses");
		int hints = details.get("hints");
		int streak = details.get("streak");
		if (solved > 1 || guesses < 1 || guesses > WordleRules.MAX_GUESSES || hints > WordleRules.MAX_HINTS
				|| (solved == 0 && guesses != WordleRules.MAX_GUESSES) || (solved == 1 && streak < 1)) {
			return Optional.of("not a Word Guess result");
		}
		if (!Scoring.details(solved == 1, guesses, hints, streak).equals(details)) {
			return Optional.of("details do not add up");
		}
		if (score != Scoring.score(solved == 1, guesses, hints, streak)) {
			return Optional.of("details do not match the score");
		}
		return Optional.empty();
	}

	@Override
	public Optional<String> problemWith(UUID sessionId, int score, Map<String, Integer> details, Duration elapsed) {
		Optional<String> inconsistent = problemWith(score, details, elapsed);
		if (inconsistent.isPresent()) {
			return inconsistent;
		}
		Optional<WordleRun> recorded = this.store.findBySession(sessionId);
		if (recorded.isEmpty() || !recorded.get().isDaily()) {
			return Optional.of("no daily Word Guess run for this session");
		}
		WordleRun run = recorded.get();
		if (run.status() == Status.PLAYING || run.finishedAt() == null) {
			return Optional.of("the puzzle is not over");
		}
		if (!run.target().equals(this.schedule.answerFor(run.puzzleDate()))
				|| run.puzzleNumber() != this.schedule.puzzleNumber(run.puzzleDate())) {
			return Optional.of("not the Daily Word of the run's day");
		}
		WordleGame replayed;
		try {
			replayed = WordleGame.replay(run.target(), run.guesses(), run.hints(), this.dictionary);
		}
		catch (GuessRejectedException ex) {
			return Optional.of("the recorded guesses break the rules: " + ex.reason());
		}
		if (replayed.status() != run.status()) {
			return Optional.of("the feedback does not end the run where it was recorded to end");
		}
		if (run.hints().size() > WordleRules.MAX_HINTS
				|| run.hints().stream().map(Hint::type).distinct().count() != run.hints().size()) {
			return Optional.of("more hints than the rules allow");
		}
		boolean solved = run.status() == Status.SOLVED;
		Map<String, Integer> expected = Scoring.details(solved, run.guesses().size(), run.hints().size(), run.streak());
		if (!expected.equals(details)) {
			return Optional.of("details do not match the recorded run");
		}
		if (score != Scoring.score(solved, run.guesses().size(), run.hints().size(), run.streak())) {
			return Optional.of("score does not match the recorded run");
		}
		return Optional.empty();
	}

}
