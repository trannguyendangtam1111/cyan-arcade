package com.cyan.arcade.wordle;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.common.error.ErrorCodes;
import com.cyan.arcade.wordle.WordleViews.AiStep;
import com.cyan.arcade.wordle.WordleViews.BenchmarkResponse;
import com.cyan.arcade.wordle.WordleViews.SolveResponse;
import com.cyan.arcade.wordle.ai.Strategy;
import com.cyan.arcade.wordle.ai.WordleSolver;
import com.cyan.arcade.wordle.ai.WordleSolver.Solution;
import com.cyan.arcade.wordle.daily.DailySchedule;
import com.cyan.arcade.wordle.dictionary.Dictionary;
import com.cyan.arcade.wordle.engine.Scoring;
import com.cyan.arcade.wordle.engine.WordleGame;
import com.cyan.arcade.wordle.engine.WordleRules;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * AI mode, for admins: the solver plays a daily puzzle through a real game of it, so its guesses meet
 * the same word, the same word list, the same six-guess limit and the same feedback as a player's,
 * and its run scores by the same rule (it takes no hints and has no streak). Nothing is saved: an AI
 * run is never submitted, so it earns nothing and never reaches a leaderboard.
 */
@Service
class WordleAiService {

	private final WordleSolver solver;

	private final DailySchedule schedule;

	private final Dictionary dictionary;

	private final Clock clock;

	private final Map<Strategy, BenchmarkResponse> benchmarks = new ConcurrentHashMap<>();

	WordleAiService(WordleSolver solver, DailySchedule schedule, Dictionary dictionary, Clock clock) {
		this.solver = solver;
		this.schedule = schedule;
		this.dictionary = dictionary;
		this.clock = clock;
	}

	/**
	 * Works out each strategy's first guess in the background once the application is up: it never
	 * depends on the puzzle, and it is the costliest decision of a solve (every allowed word against
	 * every answer), so the first solve an admin asks for does not wait for it.
	 */
	@EventListener(ApplicationReadyEvent.class)
	void warmUp() {
		Thread.ofVirtual().name("wordle-ai-warm-up").start(() -> {
			for (Strategy strategy : Strategy.values()) {
				this.solver.opener(strategy);
			}
		});
	}

	/**
	 * Solves a day's puzzle.
	 * @param date the puzzle's day, today or earlier; {@code null} for today
	 */
	SolveResponse solve(Strategy strategy, LocalDate date) {
		LocalDate today = DailySchedule.today(this.clock);
		LocalDate day = (date != null) ? date : today;
		if (!this.schedule.hasPuzzle(day) || day.isAfter(today)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_FAILED,
					"Pick a day from %s to today".formatted(DailySchedule.FIRST_DAY));
		}
		String target = this.schedule.answerFor(day);
		Solution solution = play(strategy, target);
		List<AiStep> steps = solution.steps()
			.stream()
			.map((step) -> new AiStep(step.choice().word(), step.feedback().results(), step.candidatesBefore(),
					step.candidatesAfter(), step.choice().reason(), step.choice().couldWin(), step.remaining()))
			.toList();
		return new SolveResponse(this.schedule.puzzleNumber(day), day, strategy, solution.solved(), solution.guesses(),
				Scoring.score(solution.solved(), solution.guesses(), 0, 0), target, steps);
	}

	/** The strategy against every possible answer. Worked out once per strategy: the answer never changes. */
	BenchmarkResponse benchmark(Strategy strategy) {
		return this.benchmarks.computeIfAbsent(strategy, this::runBenchmark);
	}

	private BenchmarkResponse runBenchmark(Strategy strategy) {
		long started = System.nanoTime();
		int[] distribution = new int[WordleRules.MAX_GUESSES];
		int solved = 0;
		int guesses = 0;
		for (String target : this.dictionary.answers()) {
			Solution solution = play(strategy, target);
			if (solution.solved()) {
				solved++;
				guesses += solution.guesses();
				distribution[solution.guesses() - 1]++;
			}
		}
		int games = this.dictionary.answers().size();
		return new BenchmarkResponse(strategy, games, solved, games - solved,
				(solved == 0) ? 0 : Math.round(100.0 * guesses / solved) / 100.0,
				Arrays.stream(distribution).boxed().toList(), (System.nanoTime() - started) / 1_000_000);
	}

	/** One game against this word, played move by move through the game's rules. */
	Solution play(Strategy strategy, String target) {
		WordleGame[] game = { WordleGame.start(target) };
		return this.solver.solve(strategy, (guess) -> {
			game[0] = game[0].guess(guess, this.dictionary);
			return game[0].lastFeedback();
		});
	}

}
