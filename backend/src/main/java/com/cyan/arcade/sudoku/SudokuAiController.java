package com.cyan.arcade.sudoku;

import com.cyan.arcade.sudoku.SudokuViews.SolveRequest;
import com.cyan.arcade.sudoku.SudokuViews.SolveResponse;
import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sudoku's AI mode. The AI runs here, on the server, so the security rules on {@code /api/ai/**}
 * and this controller's own check are what keep it to admins: a player gets {@code 403}, a guest
 * {@code 401}, and there is no solver in the browser to download.
 */
@RestController
@RequestMapping("/api/ai/sudoku")
@PreAuthorize("hasRole('ADMIN')")
class SudokuAiController {

	private final SudokuAiService ai;

	SudokuAiController(SudokuAiService ai) {
		this.ai = ai;
	}

	@PostMapping("/solve")
	SolveResponse solve(@Valid @RequestBody SolveRequest request) {
		return this.ai.solve(request);
	}

}
