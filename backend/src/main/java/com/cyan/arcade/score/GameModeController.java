package com.cyan.arcade.score;

import java.util.List;

import com.cyan.arcade.game.GameInfo;
import com.cyan.arcade.game.GameService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The modes a game can be played under, for anyone. Served here rather than with the catalog
 * because the modes are declared by the games' {@link RunRules}, which the catalog does not know.
 */
@RestController
class GameModeController {

	private final GameService games;

	private final GameModes modes;

	GameModeController(GameService games, GameModes modes) {
		this.games = games;
		this.modes = modes;
	}

	/** Every mode the game's rules declare, Classic included; none for a game whose runs are not scored. */
	@GetMapping("/api/games/{slug}/modes")
	List<ModeResponse> modes(@PathVariable String slug) {
		GameInfo game = this.games.requireActiveGame(slug);
		return this.modes.modesOf(game).stream().map(ModeResponse::of).toList();
	}

	/**
	 * A mode as clients see it: what to call it and how its scores read. The limits that make the
	 * mode what it is stay on the server.
	 */
	record ModeResponse(String id, String name, boolean ranked, ModeSpec.Order order, ModeSpec.Unit unit) {

		static ModeResponse of(ModeSpec spec) {
			return new ModeResponse(spec.id(), spec.name(), spec.ranked(), spec.order(), spec.unit());
		}

	}

}
