package com.cyan.arcade.wordle;

import com.cyan.arcade.wordle.WordleViews.BenchmarkResponse;
import com.cyan.arcade.wordle.WordleViews.SolveRequest;
import com.cyan.arcade.wordle.WordleViews.SolveResponse;
import com.cyan.arcade.wordle.ai.Strategy;
import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Word Guess's AI mode. The AI runs here, on the server, so the security rules on {@code /api/ai/**}
 * and this controller's own check are what keep it to admins: a player gets {@code 403}, a guest
 * {@code 401}, and there is no AI code in the browser to download.
 */
@RestController
@RequestMapping("/api/ai/wordle")
@PreAuthorize("hasRole('ADMIN')")
class WordleAiController {

	private final WordleAiService ai;

	WordleAiController(WordleAiService ai) {
		this.ai = ai;
	}

	@PostMapping("/solve")
	SolveResponse solve(@Valid @RequestBody SolveRequest request) {
		return this.ai.solve(request.strategy(), request.date());
	}

	@GetMapping("/benchmark")
	BenchmarkResponse benchmark(@RequestParam Strategy strategy) {
		return this.ai.benchmark(strategy);
	}

}
