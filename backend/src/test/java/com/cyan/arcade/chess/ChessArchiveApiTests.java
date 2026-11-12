package com.cyan.arcade.chess;

import java.util.List;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@IntegrationTest
class ChessArchiveApiTests {

	@Autowired private MockMvc mvc;
	@Autowired private JdbcTemplate jdbc;

	private UUID start(MockHttpSession owner) throws Exception {
		String json = this.mvc.perform(post("/api/chess/matches").session(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"LOCAL\"}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return UUID.fromString(JsonPath.read(json, "$.id"));
	}

	private void move(MockHttpSession owner, UUID id, int revision, String uci) throws Exception {
		this.mvc.perform(post("/api/chess/matches/{id}/moves", id).session(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"revision\":%d,\"move\":\"%s\"}".formatted(revision, uci)))
			.andExpect(status().isOk());
	}

	@Test
	void slicesAreOwnerOnlyStableAndContainActiveAbandonedAndFinishedMetadata() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		UUID first = start(owner);
		move(owner, first, 0, "e2e4");
		UUID second = start(owner);
		this.mvc.perform(post("/api/chess/matches/{id}/resign", second).session(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0,\"side\":\"BLACK\"}"))
			.andExpect(status().isOk());
		UUID active = start(owner);
		start(Players.register(this.mvc));
		this.jdbc.update("UPDATE chess_matches SET updated_at = '2026-11-09T12:00:00Z' WHERE user_id = ?", Players.userId(this.mvc, owner));
		String page0 = this.mvc.perform(get("/api/chess/archive?size=2").session(owner))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("$.content", hasSize(2))).andExpect(jsonPath("$.hasNext").value(true))
			.andReturn().getResponse().getContentAsString();
		String page1 = this.mvc.perform(get("/api/chess/archive?page=1&size=2").session(owner))
			.andExpect(status().isOk()).andExpect(jsonPath("$.content", hasSize(1)))
			.andExpect(jsonPath("$.hasNext").value(false)).andReturn().getResponse().getContentAsString();
		List<String> ids = new java.util.ArrayList<>(JsonPath.<List<String>>read(page0, "$.content[*].id"));
		ids.addAll(JsonPath.read(page1, "$.content[*].id"));
		assertThat(ids).containsExactlyInAnyOrder(first.toString(), second.toString(), active.toString());
		String all = this.mvc.perform(get("/api/chess/archive").session(owner)).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<String>>read(all, "$.content[*].status"))
			.containsExactlyInAnyOrder("ACTIVE", "ABANDONED", "FINISHED");
		assertThat(JsonPath.<List<String>>read(all, "$.content[*].result")).containsExactlyInAnyOrder("*", "*", "1-0");
		assertThat(JsonPath.<List<Integer>>read(all, "$.content[*].plyCount")).containsExactlyInAnyOrder(1, 0, 0);
	}

	@Test
	void emptyArchiveAndPaginationBounds() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		this.mvc.perform(get("/api/chess/archive").session(owner)).andExpect(status().isOk())
			.andExpect(jsonPath("$.content", hasSize(0))).andExpect(jsonPath("$.hasNext").value(false));
		for (String query : List.of("page=-1", "page=1001", "size=0", "size=51", "page=2147483647", "page=no")) {
			this.mvc.perform(get("/api/chess/archive?" + query).session(owner)).andExpect(status().isBadRequest());
		}
	}

	@Test
	void guestsCannotListReadOrExportEvenWithAGuestId() throws Exception {
		UUID id = start(Players.register(this.mvc));
		for (String path : List.of("/api/chess/archive", "/api/chess/archive/" + id, "/api/chess/archive/" + id + "/pgn")) {
			this.mvc.perform(get(path).header("X-Player-Id", UUID.randomUUID())).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void anotherAccountAndAnAdminCannotReadOrExportTheOwnersMatch() throws Exception {
		UUID id = start(Players.register(this.mvc));
		for (MockHttpSession stranger : List.of(Players.register(this.mvc), Players.signInAsAdmin(this.mvc))) {
			this.mvc.perform(get("/api/chess/archive/{id}", id).session(stranger)).andExpect(status().isNotFound());
			this.mvc.perform(get("/api/chess/archive/{id}/pgn", id).session(stranger)).andExpect(status().isNotFound());
		}
		MockHttpSession stranger = Players.register(this.mvc);
		this.mvc.perform(get("/api/chess/archive?userId=1").session(stranger)).andExpect(status().isOk())
			.andExpect(jsonPath("$.content", hasSize(0)));
		this.mvc.perform(get("/api/chess/archive/{id}", UUID.randomUUID()).session(stranger)).andExpect(status().isNotFound());
	}

	@Test
	void completedReplayAndRepeatedPgnReadsNeverWriteOrReplaceTheCurrentMatch() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		UUID id = start(owner);
		String[] moves = { "f2f3", "e7e5", "g2g4", "d8h4" };
		for (int i = 0; i < moves.length; i++) move(owner, id, i, moves[i]);
		UUID current = start(owner);
		String before = row(id);
		for (int i = 0; i < 2; i++) {
			this.mvc.perform(get("/api/chess/archive/{id}", id).session(owner)).andExpect(status().isOk())
				.andExpect(jsonPath("$.history[3].san").value("Qh4#"))
				.andExpect(jsonPath("$.result.score").value("0-1")).andExpect(jsonPath("$.canUndo").value(false));
			String pgn = this.mvc.perform(get("/api/chess/archive/{id}/pgn", id).session(owner))
				.andExpect(status().isOk()).andExpect(header().string("Content-Disposition", "attachment; filename=\"chess-" + id + ".pgn\""))
				.andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsString();
			assertThat(pgn).contains("[Result \"0-1\"]").endsWith("1. f3 e5 2. g4 Qh4# 0-1\n");
		}
		assertThat(row(id)).isEqualTo(before);
		this.mvc.perform(get("/api/chess/matches/current").session(owner)).andExpect(jsonPath("$.id").value(current.toString()));
	}

	@Test
	void legacyLocalMetadataAndUndoneMovesAreHandledWithoutInventedSeatsOrExportingRedo() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		UUID id = start(owner);
		move(owner, id, 0, "e2e4");
		this.mvc.perform(post("/api/chess/matches/{id}/undo", id).session(owner).contentType(MediaType.APPLICATION_JSON)
			.content("{\"revision\":1}")).andExpect(status().isOk());
		String before = row(id);
		this.mvc.perform(get("/api/chess/archive").session(owner)).andExpect(status().isOk())
			.andExpect(jsonPath("$.content[0].playerColor").value(nullValue()))
			.andExpect(jsonPath("$.content[0].difficulty").value(nullValue()))
			.andExpect(jsonPath("$.content[0].plyCount").value(0));
		String pgn = this.mvc.perform(get("/api/chess/archive/{id}/pgn", id).session(owner)).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(pgn).doesNotContain("e4").endsWith("\n\n*\n");
		assertThat(row(id)).isEqualTo(before);
	}

	private String row(UUID id) {
		return this.jdbc.queryForObject("SELECT row_to_json(c)::text FROM chess_matches c WHERE id = ?", String.class, id);
	}

	@Test
	void retainedAiMetadataReportsTheOwnersColourWithoutStartingSearchesOrOpeningUserAiAccess() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mvc);
		String json = this.mvc.perform(post("/api/ai/chess/matches").session(admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"playerSide\":\"BLACK\",\"difficulty\":\"CLUB\"}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		UUID id = UUID.fromString(JsonPath.read(json, "$.id"));
		this.mvc.perform(get("/api/chess/archive").session(admin)).andExpect(status().isOk())
			.andExpect(jsonPath("$.content[0].mode").value("AI"))
			.andExpect(jsonPath("$.content[0].playerColor").value("BLACK"))
			.andExpect(jsonPath("$.content[0].difficulty").value("CLUB"));
		String before = row(id);
		String pgn = this.mvc.perform(get("/api/chess/archive/{id}/pgn", id).session(admin)).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(pgn).contains("[White \"Stockfish (Club)\"]", "[Black \"Player\"]").endsWith("\n\n*\n");
		assertThat(row(id)).isEqualTo(before);
		this.mvc.perform(post("/api/ai/chess/matches").session(Players.register(this.mvc))
			.contentType(MediaType.APPLICATION_JSON).content("{\"playerSide\":\"WHITE\",\"difficulty\":\"CLUB\"}"))
			.andExpect(status().isForbidden());
	}

	@Test
	void aVariationWhoseSourceWasRetiredStillReopensAndExportsItsOwnPrefix() throws Exception {
		MockHttpSession owner = Players.register(this.mvc);
		UUID source = start(owner);
		move(owner, source, 0, "e2e4");
		String json = this.mvc.perform(post("/api/chess/matches/{id}/variations", source).session(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"ply\":1}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		UUID variation = UUID.fromString(JsonPath.read(json, "$.id"));
		this.jdbc.update("DELETE FROM chess_matches WHERE id = ?", source);
		String before = row(variation);
		this.mvc.perform(get("/api/chess/archive/{id}", variation).session(owner)).andExpect(status().isOk())
			.andExpect(jsonPath("$.source.matchId").value(nullValue())).andExpect(jsonPath("$.source.ply").value(1));
		String pgn = this.mvc.perform(get("/api/chess/archive/{id}/pgn", variation).session(owner)).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(pgn).contains("[Event \"Cyan Arcade variation\"]").endsWith("1. e4 *\n");
		assertThat(row(variation)).isEqualTo(before);
	}

}
