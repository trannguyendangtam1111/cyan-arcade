package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * Tetris ({@code frontend/src/games/tetris/engine}): a 10 × 20 board. Clearing 1 to 4 lines at
 * once scores 100, 300, 500 or 800 times the level, and the level is one more than every ten lines
 * cleared. Dropping a piece by hand scores 1 per row (soft) or 2 per row (hard), and a piece falls
 * at most the height of the board. From that:
 *
 * <ul>
 * <li>Every piece brings 4 cells and every cleared line takes 10, and what is left fits on the
 * board: {@code 10 × lines ≤ 4 × pieces ≤ 10 × lines + 200}.</li>
 * <li>The lines scored at least 100 a line (all singles) and at most 200 a line (all fours) times
 * the level they were cleared at; the drops at most {@value #MOST_DROP_POINTS} a piece.</li>
 * </ul>
 *
 * Pieces are placed by a person: at most {@value #PIECES_PER_SECOND} a second, beyond the fastest
 * players.
 */
@Component
class TetrisRunRules implements RunRules {

	static final int WIDTH = 10;

	static final int CELLS = WIDTH * 20;

	static final int LINES_PER_LEVEL = 10;

	/** Two points a row for a hard drop, over the board's height and the row a piece may start above it. */
	static final int MOST_DROP_POINTS = 2 * 22;

	static final int PIECES_PER_SECOND = 10;

	@Override
	public String gameSlug() {
		return "tetris";
	}

	@Override
	public Set<String> details() {
		return Set.of("lines", "level", "pieces");
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int lines = details.get("lines");
		int pieces = details.get("pieces");
		if (details.get("level") != lines / LINES_PER_LEVEL + 1) {
			return Optional.of("details do not match the score");
		}
		long cells = 4L * pieces;
		if (cells < (long) WIDTH * lines || cells > (long) WIDTH * lines + CELLS) {
			return Optional.of("pieces do not match the lines");
		}
		long lineScore = linePointsAtLeast(lines);
		if (score < lineScore || score > 2 * lineScore + (long) MOST_DROP_POINTS * pieces) {
			return Optional.of("details do not match the score");
		}
		if (pieces > RunRules.mostActionsIn(elapsed, 1000.0 / PIECES_PER_SECOND)) {
			return Optional.of("more pieces than the time allows");
		}
		return Optional.empty();
	}

	/** What clearing these lines one at a time scores: 100 a line, times the level of each. */
	static long linePointsAtLeast(int lines) {
		long points = 0;
		for (int line = 0; line < lines; line++) {
			points += 100L * (line / LINES_PER_LEVEL + 1);
		}
		return points;
	}

}
