package com.cyan.arcade.score;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;

/** How many games a player has finished under Classic rules, counted one way wherever it is needed. */
final class ClassicGames {

	private ClassicGames() {
	}

	/**
	 * Games finished in Classic, or in a mode that shares Classic's progression (see
	 * {@link ModeSpec#classicProgression()}): what games-played achievements count.
	 */
	static long countFor(Long userId, ScoreRepository scores, GameService games, GameModes modes) {
		long classic = scores.countByUserIdAndMode(userId, GameModes.CLASSIC);
		List<ModeCount> others = scores.countOtherModesOfUser(userId);
		if (others.isEmpty()) {
			return classic;
		}
		Map<Long, GameInfo> byId = games.gamesById(others.stream().map(ModeCount::gameId).toList());
		return classic + others.stream()
			.filter((count) -> byId.containsKey(count.gameId())
					&& modes.countsAsClassic(byId.get(count.gameId()).slug(), count.mode()))
			.mapToLong(ModeCount::runs)
			.sum();
	}

}
