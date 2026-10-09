package com.cyan.arcade.shop;

import java.util.UUID;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.progression.Levels;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.oneOf;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Game skins (Flappy Bird's birds, pipes and skies) through the ordinary shop: sold for coins at
 * the server's price, owned once, and worn one per slot of a game, without touching what the player
 * wears on their profile.
 */
@IntegrationTest
class GameSkinTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void skinsAreListedWithTheirGameAndSlot() throws Exception {
		this.mockMvc.perform(get("/api/shop/items").param("type", "GAME_SKIN"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].type", everyItem(is("GAME_SKIN"))))
			.andExpect(jsonPath("$.items[*].gameSlug", everyItem(oneOf("flappy-bird", "brick-breaker", "wordle", "sudoku", "dino-run"))))
			.andExpect(jsonPath("$.items[*].slot", hasItems("bird", "pipes", "sky")))
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_BIRD_SAKURA')].icon").value("sakura"))
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_BIRD_SAKURA')].equippable").value(true))
			// The game's own looks are free for everyone and not for sale.
			.andExpect(content().string(not(containsString("FLAPPY_BIRD_CYAN"))));
		// Other items have no game.
		this.mockMvc.perform(get("/api/shop/items").param("type", "BADGE"))
			.andExpect(jsonPath("$.items[*].gameSlug", everyItem(nullValue())));
	}

	@Test
	void theFirstSkinOfASlotIsWornAndOneSlotNeverTouchesAnother() throws Exception {
		MockHttpSession session = playerWith(5000);
		raiseToLevel(session, 3);

		buy(session, "FLAPPY_BIRD_PINKY").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));
		// A second bird waits until it is chosen.
		buy(session, "FLAPPY_BIRD_SAKURA").andExpect(status().isCreated())
			.andExpect(jsonPath("$.item.equipped").value(false));
		// The first pipes are worn at once too: another slot.
		buy(session, "FLAPPY_PIPE_CANDY").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));
		// And a profile frame is still the first of its own kind.
		buy(session, "FRAME_BUBBLEGUM").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));

		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("FLAPPY_BIRD_SAKURA")).session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_BIRD_SAKURA')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_BIRD_PINKY')].equipped").value(false))
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_PIPE_CANDY')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FRAME_BUBBLEGUM')].equipped").value(true))
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_BIRD_SAKURA')].slot").value("bird"));

		// Taking the bird off goes back to the game's own bird; the pipes stay.
		this.mockMvc.perform(delete("/api/users/me/inventory/{id}/equipped", itemId("FLAPPY_BIRD_SAKURA")).session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.slot == 'bird' && @.equipped == true)]").isEmpty())
			.andExpect(jsonPath("$.items[?(@.code == 'FLAPPY_PIPE_CANDY')].equipped").value(true));
	}

	@Test
	void skinsAreNotWornOnTheProfile() throws Exception {
		MockHttpSession session = playerWith(1000);
		buy(session, "FLAPPY_BIRD_POTATO").andExpect(status().isCreated());

		this.mockMvc.perform(get("/api/users/me").session(session))
			.andExpect(jsonPath("$.cosmetic").value(nullValue()))
			.andExpect(jsonPath("$.badge").value(nullValue()))
			.andExpect(jsonPath("$.title").value(nullValue()));
	}

	@Test
	void theServerSetsThePriceAndTheLevelAndOwnsTheInventory() throws Exception {
		MockHttpSession session = playerWith(1000);
		// A price in the request is ignored: Mochi costs 350, whatever the client says.
		this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\",\"price\":1}".formatted(itemId("FLAPPY_BIRD_MOCHI"),
					UUID.randomUUID())))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.price").value(350))
			.andExpect(jsonPath("$.balance").value(650));
		// The Phoenix unlocks at level 6.
		buy(session, "FLAPPY_BIRD_PHOENIX").andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("LEVEL_TOO_LOW"));
		// A skin owned once cannot be bought again.
		buy(session, "FLAPPY_BIRD_MOCHI").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ITEM_LIMIT_REACHED"));
		// A skin they do not own cannot be worn.
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId("FLAPPY_PIPE_DRAGON")).session(session))
			.andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(650));
	}

	// --- Helpers --------------------------------------------------------------------------------------

	private MockHttpSession playerWith(int coins) throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, session), coins);
		return session;
	}

	private void raiseToLevel(MockHttpSession session, int level) throws Exception {
		this.jdbc.update("UPDATE users SET xp = ? WHERE id = ?", Levels.xpToReach(level),
				Players.userId(this.mockMvc, session));
	}

	private ResultActions buy(MockHttpSession session, String code) throws Exception {
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId(code), UUID.randomUUID())));
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

}
