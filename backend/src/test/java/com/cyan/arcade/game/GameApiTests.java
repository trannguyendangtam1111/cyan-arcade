package com.cyan.arcade.game;

import com.cyan.arcade.IntegrationTest;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Exercises the catalog end to end: Flyway schema + seed data, JPA mapping, service and controller. */
@IntegrationTest
class GameApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void listsSeededGamesInDisplayOrderWithoutAuthentication() throws Exception {
		this.mockMvc.perform(get("/api/games"))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$[*].slug", contains("snake", "2048", "tetris", "minesweeper", "flappy-bird")))
			.andExpect(jsonPath("$[0].id").isNumber())
			.andExpect(jsonPath("$[0].name").value("Snake"))
			.andExpect(jsonPath("$[0].description").isNotEmpty())
			.andExpect(jsonPath("$[0].category").value("ARCADE"))
			.andExpect(jsonPath("$[0].thumbnailUrl").value("/thumbnails/snake.svg"))
			.andExpect(jsonPath("$[0].accentColor").value("#22c55e"))
			.andExpect(jsonPath("$[0].featured").value(true))
			// Internal fields never leak into the DTO.
			.andExpect(jsonPath("$[0].active").doesNotExist())
			.andExpect(jsonPath("$[0].displayOrder").doesNotExist());
	}

	@Test
	void returnsASingleGameBySlug() throws Exception {
		this.mockMvc.perform(get("/api/games/2048"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.slug").value("2048"))
			.andExpect(jsonPath("$.name").value("2048"))
			.andExpect(jsonPath("$.category").value("PUZZLE"));
	}

	@Test
	void unknownSlugReturnsNotFoundProblem() throws Exception {
		this.mockMvc.perform(get("/api/games/pong"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("NOT_FOUND"))
			.andExpect(jsonPath("$.detail").value("Game 'pong' was not found"));
	}

	@Test
	@Transactional
	void inactiveGamesAreHiddenEverywhere() throws Exception {
		this.jdbc.update("""
				INSERT INTO games (slug, name, description, category, thumbnail_url, accent_color, active)
				VALUES ('retired', 'Retired', 'No longer listed', 'ARCADE', '/thumbnails/retired.svg', '#000000', FALSE)
				""");

		this.mockMvc.perform(get("/api/games"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[*].slug", not(hasItem("retired"))));
		this.mockMvc.perform(get("/api/games/retired")).andExpect(status().isNotFound());
	}

	@Test
	void catalogIsReadOnlyForAnonymousUsers() throws Exception {
		this.mockMvc.perform(post("/api/games").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isUnauthorized());
	}

}
