package com.cyan.arcade;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Test helpers that act as a player through the public API: signing up, and playing a game from
 * start to finish. Nothing here reaches around the API into services or the database.
 */
public final class Players {

	public static final String PASSWORD = "correct-horse-battery";

	private Players() {
	}

	/** A username no other test has used, within the 20-character limit. */
	public static String uniqueName() {
		return "p_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
	}

	/** Registers a new player and returns their signed-in session. */
	public static MockHttpSession register(MockMvc mockMvc, String username) throws Exception {
		MockHttpSession session = new MockHttpSession();
		mockMvc
			.perform(post("/api/auth/register").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, PASSWORD)))
			.andExpect(status().isCreated());
		return session;
	}

	public static MockHttpSession register(MockMvc mockMvc) throws Exception {
		return register(mockMvc, uniqueName());
	}

	/** Starts a run. Pass {@code null} to play as a guest. */
	public static String startGame(MockMvc mockMvc, MockHttpSession session, String gameSlug) throws Exception {
		MockHttpServletRequestBuilder start = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"%s\"}".formatted(gameSlug));
		if (session != null) {
			start.session(session);
		}
		String body = mockMvc.perform(start).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.id");
	}

	/** Finishes a run with a score and optional game-specific details. */
	public static ResultActions finishGame(MockMvc mockMvc, MockHttpSession session, String sessionId, int score,
			Map<String, Integer> details) throws Exception {
		String detailsJson = details.entrySet()
			.stream()
			.map((entry) -> "\"%s\":%d".formatted(entry.getKey(), entry.getValue()))
			.collect(Collectors.joining(",", "{", "}"));
		MockHttpServletRequestBuilder finish = post("/api/game-sessions/{id}/finish", sessionId)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, detailsJson));
		if (session != null) {
			finish.session(session);
		}
		return mockMvc.perform(finish);
	}

	/** Plays a whole game and expects the score to be accepted. */
	public static ResultActions play(MockMvc mockMvc, MockHttpSession session, String gameSlug, int score,
			Map<String, Integer> details) throws Exception {
		return finishGame(mockMvc, session, startGame(mockMvc, session, gameSlug), score, details)
			.andExpect(status().isOk());
	}

	public static ResultActions play(MockMvc mockMvc, MockHttpSession session, String gameSlug, int score)
			throws Exception {
		return play(mockMvc, session, gameSlug, score, Map.of());
	}

}
