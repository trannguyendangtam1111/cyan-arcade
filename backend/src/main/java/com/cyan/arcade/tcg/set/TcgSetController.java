package com.cyan.arcade.tcg.set;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tcg/sets")
class TcgSetController {

	private final TcgSetService sets;

	TcgSetController(TcgSetService sets) {
		this.sets = sets;
	}

	@GetMapping
	List<TcgSetResponse> list(@RequestParam(required = false) String game) {
		return this.sets.list(game);
	}

	@GetMapping("/{id}")
	TcgSetResponse get(@PathVariable Long id) {
		return this.sets.get(id);
	}

}
