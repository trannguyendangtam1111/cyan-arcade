package com.cyan.arcade.tcg.administration;

import java.util.List;
import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohPackFixture;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Only a disposable Testcontainers DB; the activation gate is overridden in this test context alone. */
@IntegrationTest
@TestPropertySource(properties = "app.tcg.pilots.yugioh.activation-allowed=true")
class YugiohActivationTests {

	private static final String BASE = "/api/admin/tcg/pilots/yugioh";
	@Autowired private MockMvc mvc;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private TcgDatasetImporter importer;
	@Autowired private YugiohPilotService pilot;
	private long pack;

	@BeforeEach
	void importHiddenPilot() {
		this.importer.importDataset(YugiohPackFixture.dataset("yugioh"), "TCG-010 fixture");
		this.pack = this.jdbc.queryForObject("SELECT p.id FROM tcg_packs p JOIN tcg_sets s ON s.id=p.set_id JOIN tcg_games g ON g.id=s.game_id WHERE g.slug='yugioh'", Long.class);
		hide();
	}

	@AfterEach
	void hide() {
		this.jdbc.update("UPDATE tcg_games SET active=FALSE WHERE slug='yugioh'");
		this.jdbc.update("UPDATE tcg_packs SET active=FALSE WHERE id=?", this.pack);
	}

	@Test
	void guestsAndPlayersCannotInspectOrChangeVisibility() throws Exception {
		this.mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
		this.mvc.perform(put(BASE + "/visibility").with(csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"active\":true}")).andExpect(status().isUnauthorized());
		MockHttpSession player = Players.register(this.mvc);
		this.mvc.perform(get(BASE).session(player)).andExpect(status().isForbidden());
		visibility(player, true).andExpect(status().isForbidden());
		assertHidden();
	}

	@Test
	@WithMockUser(roles = "USER")
	void serviceAlsoRequiresAdmin() {
		assertThatExceptionOfType(AccessDeniedException.class).isThrownBy(() -> this.pilot.readiness());
	}

	@Test
	void adminNeedsCsrfAndAnExplicitBoolean() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mvc);
		this.mvc.perform(put(BASE + "/visibility").session(admin).with(csrf().useInvalidToken())
			.contentType(MediaType.APPLICATION_JSON).content("{\"active\":true}")).andExpect(status().isForbidden());
		this.mvc.perform(put(BASE + "/visibility").session(admin).with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
		assertHidden();
	}

	@Test
	void readinessChecksTheFullPilotThenActivationIsReversibleWithoutLosingPlayerData() throws Exception {
		MockHttpSession admin = Players.signInAsAdmin(this.mvc);
		this.mvc.perform(get(BASE).session(admin)).andExpect(status().isOk())
			.andExpect(jsonPath("$.dataValid").value(true)).andExpect(jsonPath("$.gameActive").value(false))
			.andExpect(jsonPath("$.counts.printings").value(127)).andExpect(jsonPath("$.counts.distinctCards").value(100))
			.andExpect(jsonPath("$.counts.oddsRows").value(45)).andExpect(jsonPath("$.problems").isEmpty());
		visibility(admin, true).andExpect(status().isOk()).andExpect(jsonPath("$.packActive").value(true));
		MockHttpSession player = Players.register(this.mvc);
		this.mvc.perform(post("/api/tcg/packs/{id}/open", this.pack).session(player)
			.header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isCreated());
		long user = Players.userId(this.mvc, player);
		List<String> before = playerRows(user);
		this.importer.importDataset(YugiohPackFixture.dataset("yugioh"), "active re-import");
		assertThat(playerRows(user)).isEqualTo(before);
		this.mvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", hasItem("yugioh")));
		visibility(admin, false).andExpect(status().isOk()).andExpect(jsonPath("$.gameActive").value(false));
		visibility(admin, false).andExpect(status().isOk());
		this.importer.importDataset(YugiohPackFixture.dataset("yugioh"), "deactivated re-import");
		assertHidden();
		assertThat(playerRows(user)).isEqualTo(before);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_cards c JOIN tcg_games g ON g.id=c.game_id WHERE g.slug='yugioh'", Integer.class)).isEqualTo(127);
		this.mvc.perform(get("/api/tcg/packs/{id}", this.pack)).andExpect(status().isNotFound());
	}

	@ParameterizedTest
	@ValueSource(strings = {
		"DELETE FROM tcg_pack_slot_odds WHERE pack_id=%d AND slot=9",
		"UPDATE tcg_pack_slot_odds SET weight=weight+1 WHERE pack_id=%d AND slot=1",
		"DELETE FROM tcg_pack_cards WHERE pack_id=%d",
		"DELETE FROM tcg_pack_cards WHERE pack_id=%d AND card_id IN (SELECT c.id FROM tcg_cards c JOIN tcg_rarities r ON r.id=c.rarity_id WHERE r.code='starlight-rare')",
		"UPDATE tcg_packs SET odds_note='Official rates' WHERE id=%d",
		"UPDATE tcg_packs SET image_url='https://example.test/not-permitted.png' WHERE id=%d",
		"UPDATE tcg_cards SET metadata=metadata-'effect' WHERE id=(SELECT card_id FROM tcg_pack_cards WHERE pack_id=%d LIMIT 1)",
		"UPDATE tcg_rarities SET tier=2 WHERE id IN (SELECT rarity_id FROM tcg_pack_slot_odds WHERE pack_id=%d)" })
	void incompleteOrChangedPackIsRefusedAtomically(String mutation) throws Exception {
		this.jdbc.update(mutation.formatted(this.pack));
		MockHttpSession admin = Players.signInAsAdmin(this.mvc);
		this.mvc.perform(get(BASE).session(admin)).andExpect(jsonPath("$.dataValid").value(false));
		visibility(admin, true).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PILOT_NOT_READY"));
		assertHidden();
		// Even an invalid pack can always be hidden; repair is an import, never this endpoint's job.
		visibility(admin, false).andExpect(status().isOk());
	}

	@Test
	void aForeignPrintingCannotEnterThePilotPoolAndOtherGamesRemainVisible() throws Exception {
		this.importer.importDataset(TinyCardGame.dataset(), "neighbour");
		long other = TinyCardGame.cardId(this.jdbc, "C1");
		this.jdbc.update("INSERT INTO tcg_pack_cards(pack_id,card_id) VALUES (?,?)", this.pack, other);
		visibility(Players.signInAsAdmin(this.mvc), true).andExpect(status().isConflict());
		this.mvc.perform(get("/api/tcg/games")).andExpect(jsonPath("$[*].slug", hasItem(TinyCardGame.SLUG)))
			.andExpect(jsonPath("$[*].slug", not(hasItem("yugioh"))));
		this.mvc.perform(get("/api/tcg/packs/{id}", TinyCardGame.packId(this.jdbc, "booster"))).andExpect(status().isOk());
	}

	@ParameterizedTest
	@ValueSource(strings = { "set", "pack" })
	void theConfiguredSetAndPackMustBothBePresent(String changed) throws Exception {
		String table = changed.equals("set") ? "tcg_sets" : "tcg_packs";
		long id = changed.equals("set") ? this.jdbc.queryForObject("SELECT set_id FROM tcg_packs WHERE id=?", Long.class, this.pack) : this.pack;
		String original = this.jdbc.queryForObject("SELECT code FROM " + table + " WHERE id=?", String.class, id);
		this.jdbc.update("UPDATE " + table + " SET code='missing-pilot-definition' WHERE id=?", id);
		try {
			visibility(Players.signInAsAdmin(this.mvc), true).andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("PILOT_NOT_READY"));
			assertHidden();
		}
		finally {
			this.jdbc.update("UPDATE " + table + " SET code=? WHERE id=?", original, id);
		}
	}

	private ResultActions visibility(MockHttpSession session, boolean active) throws Exception {
		return this.mvc.perform(put(BASE + "/visibility").session(session).with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{\"active\":%s}".formatted(active)));
	}

	private void assertHidden() {
		assertThat(this.jdbc.queryForObject("SELECT active FROM tcg_games WHERE slug='yugioh'", Boolean.class)).isFalse();
		assertThat(this.jdbc.queryForObject("SELECT active FROM tcg_packs WHERE id=?", Boolean.class, this.pack)).isFalse();
	}

	private List<String> playerRows(long user) {
		return List.of("tcg_user_cards", "tcg_pack_openings", "tcg_pack_opening_requests").stream()
			.flatMap(t -> this.jdbc.queryForList("SELECT to_jsonb(x)::text FROM " + t + " x WHERE user_id=? ORDER BY to_jsonb(x)::text", String.class, user).stream()).toList();
	}
}
