package com.cyan.arcade.game;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/games")
class GameController {

	private final GameService gameService;

	GameController(GameService gameService) {
		this.gameService = gameService;
	}

	@GetMapping
	List<GameResponse> list() {
		return this.gameService.listActiveGames();
	}

	@GetMapping("/{slug}")
	GameResponse get(@PathVariable String slug) {
		return this.gameService.getActiveGame(slug);
	}

}
