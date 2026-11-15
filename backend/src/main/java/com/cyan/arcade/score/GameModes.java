package com.cyan.arcade.score;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.ApiException;
import com.cyan.arcade.game.GameInfo;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Which rulesets each game can be played under, as its {@link RunRules} declare them. A run's mode
 * is fixed when it starts and copied to its score; it never changes afterwards.
 *
 * <p>Every game has {@link #CLASSIC}: every run recorded before modes existed is a Classic run, and
 * so is every run started without naming one. A scored game without rules has Classic alone; an
 * unscored game has no modes, since none of its runs are recorded.
 *
 * <p>The declarations are checked when the application starts, so a game cannot ship with a
 * malformed or duplicate mode, or without Classic exactly as {@link ModeSpec#CLASSIC} defines it.
 */
@Component
public class GameModes {

	/** A game's standard ruleset, and the mode of every run that does not name one. */
	public static final String CLASSIC = "classic";

	/** How a mode id is written; the same rule the database enforces on stored modes. */
	public static final String FORMAT = "^[a-z][a-z0-9-]{0,23}$";

	/** The error code for a mode a game does not have (or has no leaderboard for). */
	public static final String UNKNOWN_MODE = "UNKNOWN_MODE";

	private final Map<String, RunRules> rulesByGame;

	GameModes(List<RunRules> rules) {
		this.rulesByGame = rules.stream().collect(Collectors.toMap(RunRules::gameSlug, Function.identity()));
		this.rulesByGame.values().forEach(GameModes::checkDeclared);
	}

	/** The rules of a game, if it has any. */
	Optional<RunRules> rulesOf(String gameSlug) {
		return Optional.ofNullable(this.rulesByGame.get(gameSlug));
	}

	/** The modes a game can be played under, in the order its rules declare them; none for an unscored game. */
	public List<ModeSpec> modesOf(GameInfo game) {
		return game.scored() ? declaredBy(game.slug()) : List.of();
	}

	/**
	 * One of the modes a game's rules declare, whether or not the game is scored at the moment: a run
	 * already under way is judged by the rules of the mode it started in.
	 */
	Optional<ModeSpec> declared(String gameSlug, String mode) {
		return declaredBy(gameSlug).stream().filter((spec) -> spec.id().equals(mode)).findFirst();
	}

	/**
	 * A mode of the game that has a leaderboard: declared by its rules and ranked. Empty for any other
	 * name, including a mode the game has without a leaderboard.
	 */
	public Optional<ModeSpec> rankedMode(GameInfo game, String mode) {
		return modesOf(game).stream().filter((spec) -> spec.ranked() && spec.id().equals(mode)).findFirst();
	}

	/**
	 * Whether a run of this game and mode earns and counts what a Classic run does: Classic itself, or
	 * a mode its rules declare with {@link ModeSpec#classicProgression()}.
	 */
	boolean countsAsClassic(String gameSlug, String mode) {
		return CLASSIC.equals(mode)
				|| declared(gameSlug, mode).map(ModeSpec::classicProgression).orElse(false);
	}

	/**
	 * Whether the game has a mode whose runs do not count where Classic runs do (Tetris's Sprint, a
	 * Snake map), so a player is told that only Classic runs count. False for a game with Classic
	 * alone, for one whose every mode shares Classic progression (Sudoku), and for an unscored game.
	 */
	public boolean hasModesOutsideClassicProgression(GameInfo game) {
		return modesOf(game).stream().anyMatch((mode) -> !countsAsClassic(game.slug(), mode.id()));
	}

	/**
	 * Whether an accepted run of this game and mode reached the mode's own end (see
	 * {@link RunRules#completes}). A game without rules has Classic alone, whose every run completes.
	 */
	boolean completes(String gameSlug, String mode, Map<String, Integer> details) {
		return rulesOf(gameSlug).map((rules) -> rules.completes(mode, details)).orElse(CLASSIC.equals(mode));
	}

	private List<ModeSpec> declaredBy(String gameSlug) {
		return rulesOf(gameSlug).map(RunRules::modes).orElse(List.of(ModeSpec.CLASSIC));
	}

	/**
	 * The mode a run of the given game is started in.
	 * @param requested the mode the client asked for, or {@code null} for Classic
	 * @throws ApiException {@code 400 UNKNOWN_MODE} if the game does not declare it
	 */
	ModeSpec resolve(GameInfo game, String requested) {
		String mode = (requested != null) ? requested : CLASSIC;
		return modesOf(game).stream().filter((spec) -> spec.id().equals(mode)).findFirst().orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, UNKNOWN_MODE,
				game.name() + " has no mode '" + mode + "'"));
	}

	private static void checkDeclared(RunRules rules) {
		List<ModeSpec> modes = rules.modes();
		Set<String> ids = new HashSet<>();
		for (ModeSpec mode : modes) {
			if (!ids.add(mode.id())) {
				throw new IllegalStateException(rules.gameSlug() + " declares mode '" + mode.id() + "' twice");
			}
		}
		if (!ids.contains(CLASSIC)) {
			throw new IllegalStateException(rules.gameSlug() + " does not declare the Classic mode");
		}
		// Every recorded run is Classic: its board, bests and rewards must keep meaning what they always have.
		if (!modes.contains(ModeSpec.CLASSIC)) {
			throw new IllegalStateException(rules.gameSlug() + " changes the Classic mode");
		}
	}

}
