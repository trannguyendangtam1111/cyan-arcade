package com.cyan.arcade.wordle;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.random.RandomGenerator;
import java.util.stream.IntStream;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.score.GameSessionService;
import com.cyan.arcade.score.RunSession;
import com.cyan.arcade.wordle.WordleRun.Mode;
import com.cyan.arcade.wordle.WordleRun.Owner;
import com.cyan.arcade.wordle.WordleRunStore.DailyResult;
import com.cyan.arcade.wordle.WordleViews.DailyResponse;
import com.cyan.arcade.wordle.WordleViews.GuessView;
import com.cyan.arcade.wordle.WordleViews.HintView;
import com.cyan.arcade.wordle.WordleViews.ResultView;
import com.cyan.arcade.wordle.WordleViews.RunResponse;
import com.cyan.arcade.wordle.WordleViews.StatsResponse;
import com.cyan.arcade.wordle.daily.DailySchedule;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import com.cyan.arcade.wordle.engine.Feedback;
import com.cyan.arcade.wordle.engine.Hint;
import com.cyan.arcade.wordle.engine.HintType;
import com.cyan.arcade.wordle.engine.Hints;
import com.cyan.arcade.wordle.engine.Hints.HintUnavailableException;
import com.cyan.arcade.wordle.engine.Scoring;
import com.cyan.arcade.wordle.engine.Streaks;
import com.cyan.arcade.wordle.engine.WordleGame;
import com.cyan.arcade.wordle.engine.WordleGame.GuessRejectedException;
import com.cyan.arcade.wordle.engine.WordleGame.Status;
import com.cyan.arcade.wordle.engine.WordleRules;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Word Guess, played on the server: the server picks the word, judges every guess and hint, and
 * keeps the run, so the word never reaches the browser before the run is over and every number a
 * score is made of is the server's own.
 *
 * <p>A daily run is tied to a platform game session, which the browser opens as for any game and
 * finishes with the run's score once it is over; {@link WordleRunRules} then checks that score
 * against this run. A player has one daily run per UTC day: it can be picked up again with a new
 * session (after a reload, say) until its score is in, and never after. Practice runs have no
 * session, no score and no rewards.
 */
@Service
class WordleService {

	static final String GAME_SLUG = "wordle";

	static final String WORD_NOT_IN_LIST = "WORD_NOT_IN_LIST";

	static final String RUN_OVER = "RUN_OVER";

	static final String HINT_UNAVAILABLE = "HINT_UNAVAILABLE";

	static final String DAILY_ALREADY_PLAYED = "DAILY_ALREADY_PLAYED";

	static final String PLAYER_ID_REQUIRED = "PLAYER_ID_REQUIRED";

	static final String WRONG_SESSION = "WRONG_SESSION";

	/** Practice runs left alone this long are forgotten. */
	static final Duration PRACTICE_KEPT_FOR = Duration.ofDays(2);

	private final WordleRunStore store;

	private final Dictionary dictionary;

	private final DailySchedule schedule;

	private final GameSessionService sessions;

	private final Clock clock;

	private final RandomGenerator random = new SecureRandom();

	WordleService(WordleRunStore store, Dictionary dictionary, DailySchedule schedule, GameSessionService sessions,
			Clock clock) {
		this.store = store;
		this.dictionary = dictionary;
		this.schedule = schedule;
		this.sessions = sessions;
		this.clock = clock;
	}

	/** Today's puzzle, and the caller's run of it if they have one ({@code owner} is {@code null} for an unknown guest). */
	@Transactional(readOnly = true)
	public DailyResponse daily(Owner owner) {
		LocalDate today = DailySchedule.today(this.clock);
		RunResponse run = (owner != null) ? this.store.findDaily(owner, today).map(this::view).orElse(null) : null;
		return new DailyResponse(this.schedule.puzzleNumber(today), today, DailySchedule.nextPuzzleAt(this.clock),
				WordleRules.WORD_LENGTH, WordleRules.MAX_GUESSES, WordleRules.MAX_HINTS,
				IntStream.rangeClosed(0, WordleRules.MAX_HINTS).map(Scoring::hintPercent).boxed().toList(), run);
	}

	/**
	 * Starts today's puzzle with this game session, or picks the player's run of it up again with a new
	 * one, as long as its score has not been submitted.
	 */
	@Transactional
	public RunResponse startDaily(Owner owner, UUID sessionId) {
		RunSession session = this.sessions.find(sessionId)
			.filter((candidate) -> GAME_SLUG.equals(candidate.gameSlug()) && !candidate.finished()
					&& candidate.belongsTo(owner.userId(), owner.playerId()))
			.orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, WRONG_SESSION,
					"Start an unfinished Word Guess game session of your own first"));
		Optional<WordleRun> bound = this.store.findBySession(session.id());
		if (bound.isPresent()) {
			return view(bound.get());
		}
		LocalDate today = DailySchedule.today(this.clock);
		Optional<WordleRun> existing = this.store.findDailyForUpdate(owner, today);
		if (existing.isPresent()) {
			return pickUp(existing.get(), session.id());
		}
		WordleRun run = new WordleRun(UUID.randomUUID(), Mode.DAILY, session.id(), owner.userId(), owner.playerId(),
				today, this.schedule.puzzleNumber(today), this.schedule.answerFor(today), List.of(), List.of(),
				Status.PLAYING, 0, this.clock.instant(), null);
		if (this.store.insert(run)) {
			return view(run);
		}
		// Another request started it at the same moment.
		return this.store.findDailyForUpdate(owner, today)
			.map((started) -> pickUp(started, session.id()))
			.orElseThrow(() -> new ConflictException(ErrorCodes.CONFLICT, "Today's puzzle could not be started"));
	}

	private RunResponse pickUp(WordleRun run, UUID sessionId) {
		if (sessionId.equals(run.sessionId())) {
			return view(run);
		}
		if (isScored(run)) {
			throw new ConflictException(DAILY_ALREADY_PLAYED,
					"You have played today's puzzle. A new one comes at midnight UTC.");
		}
		this.store.bindSession(run.id(), sessionId);
		return view(new WordleRun(run.id(), run.mode(), sessionId, run.userId(), run.playerId(), run.puzzleDate(),
				run.puzzleNumber(), run.target(), run.guesses(), run.hints(), run.status(), run.streak(),
				run.startedAt(), run.finishedAt()));
	}

	/** A practice game: a random word, never today's daily word, for fun only. */
	@Transactional
	public RunResponse startPractice(Owner owner) {
		Instant now = this.clock.instant();
		this.store.deletePracticeStartedBefore(now.minus(PRACTICE_KEPT_FOR));
		String daily = this.schedule.answerFor(DailySchedule.today(this.clock));
		List<String> words = this.dictionary.answers().stream().filter((word) -> !word.equals(daily)).toList();
		String target = words.get(this.random.nextInt(words.size()));
		WordleRun run = new WordleRun(UUID.randomUUID(), Mode.PRACTICE, null, owner.userId(), owner.playerId(), null,
				null, target, List.of(), List.of(), Status.PLAYING, 0, now, null);
		this.store.insert(run);
		return view(run);
	}

	/** Plays a guess. A word the game does not know is refused and costs nothing. */
	@Transactional
	public RunResponse guess(Owner owner, UUID runId, String word) {
		WordleRun run = ownedForUpdate(owner, runId);
		WordleGame game = run.game();
		WordleGame next;
		try {
			next = game.guess(word, this.dictionary);
		}
		catch (GuessRejectedException ex) {
			throw switch (ex.reason()) {
				case NOT_A_WORD -> new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, WORD_NOT_IN_LIST,
						"That word is not in the word list");
				case MALFORMED -> new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
						"A guess is five letters");
				case GAME_OVER -> runOver();
			};
		}
		Instant finishedAt = next.status().isOver() ? this.clock.instant() : null;
		int streak = 0;
		if (run.isDaily() && next.status() == Status.SOLVED) {
			Map<LocalDate, Boolean> results = resultsOf(owner);
			results.put(run.puzzleDate(), true);
			streak = Streaks.endingOn(results, run.puzzleDate());
		}
		WordleRun saved = run.with(next, streak, finishedAt);
		this.store.saveProgress(saved);
		return view(saved);
	}

	/** Takes a hint. One of each kind per run; each lowers the score. */
	@Transactional
	public RunResponse hint(Owner owner, UUID runId, HintType type, Character letter) {
		WordleRun run = ownedForUpdate(owner, runId);
		WordleGame game = run.game();
		if (game.status().isOver()) {
			throw runOver();
		}
		WordleGame next;
		try {
			next = Hints.take(game, type, letter, seed(run.id(), game.hints().size()));
		}
		catch (HintUnavailableException ex) {
			throw new ConflictException(HINT_UNAVAILABLE, switch (ex.reason()) {
				case NO_HINTS_LEFT -> "No hints left in this game";
				case ALREADY_USED -> "That hint has been used in this game";
				case WOULD_REVEAL_WORD -> "Revealing another letter would give the word away";
				case LETTER_KNOWN -> "You already know whether that letter is in the word";
				case NOTHING_TO_REMOVE -> "Every letter not in the word is already ruled out";
				case GAME_OVER -> "This game is over";
			});
		}
		catch (IllegalArgumentException ex) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED, "Pick a letter to check");
		}
		WordleRun saved = run.with(next, run.streak(), null);
		this.store.saveProgress(saved);
		return view(saved);
	}

	/** The caller's daily puzzles so far ({@code owner} is {@code null} for an unknown guest: nothing yet). */
	@Transactional(readOnly = true)
	public StatsResponse stats(Owner owner) {
		List<DailyResult> results = (owner != null) ? this.store.dailyResults(owner) : List.of();
		Map<LocalDate, Boolean> byDay = new HashMap<>();
		int[] distribution = new int[WordleRules.MAX_GUESSES];
		int solved = 0;
		int guessesWhenSolved = 0;
		for (DailyResult result : results) {
			byDay.put(result.date(), result.solved());
			if (result.solved()) {
				solved++;
				guessesWhenSolved += result.guesses();
				distribution[result.guesses() - 1]++;
			}
		}
		int played = results.size();
		LocalDate today = DailySchedule.today(this.clock);
		return new StatsResponse(played, solved, (played == 0) ? 0 : Math.round(100f * solved / played),
				Streaks.current(byDay, today), Streaks.best(byDay),
				(solved == 0) ? null : Math.round(10.0 * guessesWhenSolved / solved) / 10.0,
				Arrays.stream(distribution).boxed().toList(), results.isEmpty() ? null : results.getLast().date());
	}

	private WordleRun ownedForUpdate(Owner owner, UUID runId) {
		// Someone else's run is as good as missing: a run id alone tells nothing.
		return this.store.findForUpdate(runId)
			.filter((run) -> run.belongsTo(owner))
			.orElseThrow(() -> new NotFoundException("Word Guess run", runId));
	}

	private Map<LocalDate, Boolean> resultsOf(Owner owner) {
		Map<LocalDate, Boolean> results = new HashMap<>();
		this.store.dailyResults(owner).forEach((result) -> results.put(result.date(), result.solved()));
		return results;
	}

	private boolean isScored(WordleRun run) {
		return run.sessionId() != null && this.sessions.find(run.sessionId()).map(RunSession::finished).orElse(false);
	}

	/** Where a run's hint picks its random choices: the run and how many hints came before, nothing else. */
	static long seed(UUID runId, int hintsBefore) {
		return runId.getMostSignificantBits() ^ runId.getLeastSignificantBits() ^ (0x9E3779B97F4A7C15L * (hintsBefore + 1));
	}

	private static ApiException runOver() {
		return new ConflictException(RUN_OVER, "This game is over");
	}

	RunResponse view(WordleRun run) {
		WordleGame game = run.game();
		List<Feedback> feedback = game.feedback();
		List<GuessView> guesses = new ArrayList<>();
		for (int index = 0; index < feedback.size(); index++) {
			guesses.add(new GuessView(game.guesses().get(index), feedback.get(index).results()));
		}
		List<HintView> hints = game.hints().stream().map((hint) -> hintView(game, hint)).toList();
		Status status = game.status();
		ResultView result = null;
		if (status.isOver()) {
			boolean solved = status == Status.SOLVED;
			result = new ResultView(Scoring.score(solved, guesses.size(), hints.size(), run.streak()),
					Scoring.hintPercent(hints.size()),
					Scoring.details(solved, guesses.size(), hints.size(), run.streak()));
		}
		return new RunResponse(run.id(), run.mode().name(), run.puzzleNumber(), run.puzzleDate(), status.name(),
				WordleRules.WORD_LENGTH, WordleRules.MAX_GUESSES, guesses, hints,
				WordleRules.MAX_HINTS - hints.size(), Hints.available(game), status.isOver() ? run.target() : null,
				result, run.isDaily() && isScored(run));
	}

	private static HintView hintView(WordleGame game, Hint hint) {
		return switch (hint.type()) {
			case REVEAL_LETTER -> new HintView(hint.type(), hint.position(),
					String.valueOf(Hints.revealedLetter(game, hint)), null, null);
			case CHECK_LETTER -> new HintView(hint.type(), null, hint.letters(), Hints.isPresent(game, hint), null);
			case ELIMINATE_LETTERS -> new HintView(hint.type(), null, null, null,
					hint.letters().chars().mapToObj((letter) -> String.valueOf((char) letter)).toList());
		};
	}

}
