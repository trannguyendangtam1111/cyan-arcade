package com.cyan.arcade.chess;

import java.util.List;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coach Mode's own limit: judgements that need the engine count, at most
 * {@code app.chess.coach.requests-per-minute} a minute per account (5 in the tests); judgements
 * already in the cache are free. Apart from the hints, which keep their own per-game allowance.
 */
@IntegrationTest
class ChessCoachLimitTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private EngineAnalysisCache cache;

	@Test
	void judgementsNeedingTheEngineAreLimitedAndCachedOnesAreFree() throws Exception {
		this.cache.clear();
		MockHttpSession player = Players.register(this.mockMvc);
		String match = JsonPath.read(this.mockMvc.perform(post("/api/chess/matches").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"mode\":\"LOCAL\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
		List<String> moves = List.of("e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5");
		for (int index = 0; index < moves.size(); index++) {
			this.mockMvc.perform(post("/api/chess/matches/{id}/moves", match).session(player)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"revision\":" + index + ",\"move\":\"" + moves.get(index) + "\"}")).andExpect(status().isOk());
		}

		for (int ply = 1; ply <= 5; ply++) {
			coach(player, match, ply, moves.get(ply - 1)).andExpect(status().isOk());
		}
		coach(player, match, 6, "f8c5").andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_ENGINE_REQUESTS"));
		// Both positions of the first move are cached: no engine, no count.
		coach(player, match, 1, "e2e4").andExpect(status().isOk());
		// The hints are counted apart, so the coach's limit leaves them alone.
		this.mockMvc.perform(post("/api/chess/matches/{id}/hint", match).session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":6}")).andExpect(status().isOk());
	}

	private ResultActions coach(MockHttpSession session, String match, int ply, String uci) throws Exception {
		return this.mockMvc.perform(post("/api/chess/matches/{id}/coach", match).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"ply\":" + ply + ",\"uci\":\"" + uci + "\"}"));
	}

}
