package com.cyan.arcade.gamerules;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.cyan.arcade.score.RunRules;

import org.springframework.stereotype.Component;

/**
 * 2048 ({@code frontend/src/games/2048/engine}). The board starts with two tiles of 2 or 4, and
 * every move that changes it adds one more. Merging two tiles scores the new tile's value. From
 * that:
 *
 * <ul>
 * <li>Tiles only ever join, so the board's total is at most {@code 8 + 4 × moves}, and no tile is
 * bigger than that total.</li>
 * <li>A tile of 2^k scored at most (k − 1) × 2^k to build (every piece a 2) and at least
 * (k − 2) × 2^k (every piece a 4). So the score is at least that for the highest tile, and at most
 * the board's total times (k − 1) for the highest tile.</li>
 * <li>Every merge scores a power of two of at least 4, so the score is a multiple of 4.</li>
 * </ul>
 *
 * The moves themselves are made by a person: at most {@value #MOVES_PER_SECOND} a second, far
 * faster than anyone plays for long.
 */
@Component
class Game2048RunRules implements RunRules {

	static final int MOVES_PER_SECOND = 25;

	/** A 4 × 4 board cannot hold a tile above 2^17. */
	static final int LARGEST_TILE = 1 << 17;

	@Override
	public String gameSlug() {
		return "2048";
	}

	@Override
	public Set<String> details() {
		return Set.of("highestTile", "moves");
	}

	@Override
	public Optional<String> problemWith(int score, Map<String, Integer> details, Duration elapsed) {
		int highestTile = details.get("highestTile");
		int moves = details.get("moves");
		if (highestTile < 2 || highestTile > LARGEST_TILE || Integer.bitCount(highestTile) != 1 || score % 4 != 0) {
			return Optional.of("not a 2048 result");
		}
		long boardTotal = 8L + 4L * moves;
		int power = Integer.numberOfTrailingZeros(highestTile);
		if (highestTile > boardTotal || score > boardTotal * (power - 1)
				|| score < (long) highestTile * Math.max(0, power - 2)) {
			return Optional.of("details do not match the score");
		}
		if (moves > RunRules.mostActionsIn(elapsed, 1000.0 / MOVES_PER_SECOND)) {
			return Optional.of("more moves than the time allows");
		}
		return Optional.empty();
	}

}
