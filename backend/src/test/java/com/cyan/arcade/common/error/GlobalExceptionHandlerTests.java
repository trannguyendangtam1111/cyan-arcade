package com.cyan.arcade.common.error;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerTests {

	private MockMvc mockMvc;

	@BeforeEach
	void setUp() {
		this.mockMvc = MockMvcBuilders.standaloneSetup(new SampleController())
			.setControllerAdvice(new GlobalExceptionHandler())
			.build();
	}

	@Test
	void apiExceptionKeepsItsStatusAndCode() throws Exception {
		this.mockMvc.perform(get("/sample/missing"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("NOT_FOUND"))
			.andExpect(jsonPath("$.detail").value("Game 'pong' was not found"))
			.andExpect(jsonPath("$.timestamp").exists());
	}

	@Test
	void conflictExceptionUsesCustomCode() throws Exception {
		this.mockMvc.perform(get("/sample/conflict"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
	}

	@Test
	void invalidBodyListsFieldErrors() throws Exception {
		this.mockMvc
			.perform(post("/sample/body").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\",\"score\":-1}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors.length()").value(2))
			.andExpect(jsonPath("$.errors[?(@.field == 'score')]").exists())
			.andExpect(jsonPath("$.errors[?(@.field == 'name')]").exists());
	}

	@Test
	void invalidParameterListsFieldErrors() throws Exception {
		this.mockMvc.perform(get("/sample/param").param("limit", "0"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.errors[0].field").value("limit"));
	}

	@Test
	void malformedJsonIsBadRequest() throws Exception {
		this.mockMvc.perform(post("/sample/body").contentType(MediaType.APPLICATION_JSON).content("{not json"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("BAD_REQUEST"));
	}

	@Test
	void unexpectedExceptionHidesInternals() throws Exception {
		this.mockMvc.perform(get("/sample/boom"))
			.andExpect(status().isInternalServerError())
			.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
			.andExpect(jsonPath("$.detail").value("Something went wrong on our side. Please try again."));
	}

	@RestController
	static class SampleController {

		@GetMapping("/sample/missing")
		void missing() {
			throw new NotFoundException("Game", "pong");
		}

		@GetMapping("/sample/conflict")
		void conflict() {
			throw new ConflictException("SESSION_ALREADY_FINISHED", "Session already finished");
		}

		@PostMapping("/sample/body")
		void body(@Valid @RequestBody SampleRequest request) {
		}

		@GetMapping("/sample/param")
		void param(@RequestParam @Min(1) int limit) {
		}

		@GetMapping("/sample/boom")
		void boom() {
			throw new IllegalStateException("database password is hunter2");
		}

	}

	record SampleRequest(@NotBlank String name, @Min(0) int score) {
	}

}
