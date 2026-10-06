package com.cyan.arcade;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * What a test run would look like had it really been played, so tests about everything else (the
 * leaderboards, rewards, profiles) pass the server's score checks without each spelling out a
 * consistent run:
 *
 * <ul>
 * <li>the details the game itself would report with the score (a snake as long as its apples, the
 * pieces and lines a Tetris score needs), keeping any a test gives explicitly;</li>
 * <li>time: the run is moved back to have started {@link #PLAYED_FOR} ago, enough to play any score
 * the tests use. Tests finish runs within milliseconds, which no real run does.</li>
 * </ul>
 *
 * Tests about the checks themselves send their runs directly instead.
 */
public final class HonestRuns {

	public static final Duration PLAYED_FOR = Duration.ofMinutes(30);

	private static JdbcTemplate jdbc;

	private HonestRuns() {
	}

	/** Set once by the test configuration, which has the database. */
	static void useDatabase(JdbcTemplate database) {
		jdbc = database;
	}

	/** Moves an unfinished run's start back by {@link #PLAYED_FOR}, as if it had been played that long. */
	public static void playFor(String sessionId) {
		jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) "
				+ "WHERE id = ?::uuid AND finished_at IS NULL", PLAYED_FOR.toSeconds(), sessionId);
	}

	/** The game a run belongs to. */
	public static String gameOf(String sessionId) {
		return jdbc.queryForList("SELECT g.slug FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?::uuid",
				String.class, sessionId)
			.stream()
			.findFirst()
			.orElse("");
	}

	/** The details the game would report with this score; the ones given win. */
	public static Map<String, Integer> detailsFor(String gameSlug, int score, Map<String, Integer> given) {
		Map<String, Integer> details = new HashMap<>();
		switch (gameSlug) {
			case "snake" -> {
				details.put("length", score + 3);
				details.put("level", score / 5 + 1);
			}
			case "2048" -> {
				int highestTile = given.getOrDefault("highestTile", highestTileFor(score));
				int power = Integer.numberOfTrailingZeros(highestTile);
				int moves = (power <= 1) ? 0 : (int) Math.max(0, Math.ceil(((double) score / (power - 1) - 8) / 4));
				moves = Math.max(moves, (int) Math.ceil((highestTile - 8) / 4.0));
				details.put("highestTile", highestTile);
				details.put("moves", moves);
			}
			case "tetris" -> {
				int lines = given.getOrDefault("lines", linesFor(score));
				long lineScore = minimumLinePoints(lines);
				int fewest = (int) Math.ceil(10.0 * lines / 4);
				int most = (10 * lines + 200) / 4;
				int forDrops = (int) Math.ceil(Math.max(0, score - 2 * lineScore) / 44.0);
				details.put("lines", lines);
				details.put("level", lines / 10 + 1);
				details.put("pieces", Math.min(most, Math.max(fewest, forDrops)));
			}
			case "minesweeper" -> {
				// 1,210 is a cleared board with no time bonus left (it took the whole half hour); any other
				// score is a lost game, 10 a safe cell.
				boolean won = score == 1210;
				int revealed = won ? 71 : score / 10;
				details.put("rows", 9);
				details.put("columns", 9);
				details.put("mines", 10);
				details.put("revealedCells", revealed);
				details.put("flagsUsed", 0);
				details.put("won", won ? 1 : 0);
				details.put("moves", won ? 1 : 2);
				details.put("seconds", (int) PLAYED_FOR.toSeconds());
			}
			default -> {
			}
		}
		details.putAll(given);
		return details;
	}

	/** Details as the JSON object a finish request carries. */
	public static String json(Map<String, Integer> details) {
		return details.entrySet()
			.stream()
			.map((entry) -> "\"%s\":%d".formatted(entry.getKey(), entry.getValue()))
			.collect(Collectors.joining(",", "{", "}"));
	}

	/** The highest 2048 tile a score of this size can come with. */
	private static int highestTileFor(int score) {
		if (score == 0) {
			return 2;
		}
		int tile = 4;
		while ((long) tile * 2 * Math.max(0, Integer.numberOfTrailingZeros(tile * 2) - 2) <= score) {
			tile *= 2;
		}
		return tile;
	}

	/** Lines for a Tetris score: none while drops alone can make it, else as many singles as it pays for. */
	private static int linesFor(int score) {
		if (score <= 44 * 50) {
			return 0;
		}
		int lines = 0;
		while (minimumLinePoints(lines + 1) <= score) {
			lines++;
		}
		return lines;
	}

	private static long minimumLinePoints(int lines) {
		long points = 0;
		for (int line = 0; line < lines; line++) {
			points += 100L * (line / 10 + 1);
		}
		return points;
	}

}
