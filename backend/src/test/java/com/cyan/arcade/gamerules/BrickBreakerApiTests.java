package com.cyan.arcade.gamerules;

import java.time.Duration;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Brick Breaker on the platform: a catalog row, its skins as ordinary game skins and a
 * {@link com.cyan.arcade.score.RunRules} bean are all it brings to the server; sessions, scores,
 * leaderboards, rewards, achievements, the shop and statistics work for it as for every game.
 */
@IntegrationTest
class BrickBreakerApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void brickBreakerIsInTheCatalogWithItsSkinsInTheShop() throws Exception {
		this.mockMvc.perform(get("/api/games/brick-breaker"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Brick Breaker"))
			.andExpect(jsonPath("$.category").value("ARCADE"))
			.andExpect(jsonPath("$.thumbnailUrl").value("/thumbnails/brick-breaker.svg"));

		this.mockMvc.perform(get("/api/shop/items").param("type", "GAME_SKIN"))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'brick-breaker')].slot", hasItems("paddle", "ball", "bricks")))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_BALL_PLASMA')].icon").value("plasma"))
			// The game's own looks are free for everyone and not for sale.
			.andExpect(content().string(not(containsString("BRICK_PADDLE_CYAN"))));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM shop_items WHERE game_slug = 'brick-breaker'",
				Integer.class)).isEqualTo(18);
	}

	@Test
	void aRunIsRecordedRankedAndRewarded() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player);
		playedFor(run, Duration.ofMinutes(8));

		// Three levels cleared (one of them perfectly), lost on the fourth, with power-ups along the way.
		finish(run, 48_000, details(4, 150, 16, 12, 3, 12, 11, 4, 1, 420_000), player).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("brick-breaker"))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code",
					hasItems("BRICK_FIRST_BREAK", "BRICK_COMBO_5", "BRICK_COMBO_15", "BRICK_POWER_HUNGRY",
							"BRICK_MULTI_BALL", "BRICK_FIRESTORM", "BRICK_LASER_SHOW", "BRICK_CRUSHER",
							"BRICK_PERFECT_CLEAR")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("BRICK_FLAWLESS"))));

		for (String period : new String[] { "DAILY", "WEEKLY", "ALL_TIME" }) {
			this.mockMvc.perform(get("/api/leaderboards/brick-breaker?period={period}&size=100", period).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myScore").value(48_000));
		}
		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.games[?(@.slug == 'brick-breaker')].bestScore", hasItem(48_000)));
	}

	@Test
	void anImpossibleRunIsRejectedWithoutSayingWhyAndEarnsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player);
		playedFor(run, Duration.ofMinutes(8));

		// Level 4 claimed with only 20 bricks destroyed.
		finish(run, 48_000, details(4, 20, 16, 12, 3, 12, 11, 4, 1, 420_000), player).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			.andExpect(content().string(not(containsString("bricks"))));
		// A score no bricks can make.
		finish(run, 4_900_000, details(4, 150, 16, 12, 3, 12, 11, 4, 1, 420_000), player)
			.andExpect(status().isBadRequest());
		// Another game's details.
		finish(run, 1_000, "{\"pipes\":3}", player).andExpect(status().isBadRequest());

		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid",
				Integer.class, run)).isZero();
		this.mockMvc.perform(get("/api/users/me").session(player)).andExpect(jsonPath("$.xp").value(0));

		finish(run, 48_000, details(4, 150, 16, 12, 3, 12, 11, 4, 1, 420_000), player).andExpect(status().isOk());
	}

	@Test
	void itsSkinsAreBoughtAndWornLikeAnyGameSkin() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Players.grantCoins(this.mockMvc, Players.userId(this.mockMvc, player), 2000);
		buy(player, "BRICK_PADDLE_CANDY").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));
		buy(player, "BRICK_BALL_BUBBLE").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));
		buy(player, "BRICK_PADDLE_MOCHI").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(false));
		// Flappy Bird's slots and Brick Breaker's never touch each other.
		buy(player, "FLAPPY_BIRD_PINKY").andExpect(status().isCreated()).andExpect(jsonPath("$.item.equipped").value(true));
		this.mockMvc.perform(get("/api/users/me/inventory").session(player))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'brick-breaker' && @.equipped == true)].slot", hasItems("paddle", "ball")))
			.andExpect(jsonPath("$.items[?(@.equipped == true)].code", hasItem("FLAPPY_BIRD_PINKY")));
		// Locked by level, at the server's price.
		buy(player, "BRICK_THEME_FANTASY").andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("LEVEL_TOO_LOW"));
		this.mockMvc.perform(get("/api/shop/items").param("type", "GAME_SKIN"))
			.andExpect(jsonPath("$.items[?(@.code == 'BRICK_THEME_FANTASY')].price", everyItem(is(1800))));
	}

	// --- Helpers ------------------------------------------------------------------------------------

	private static String details(int level, int bricks, int maxCombo, int powerUps, int maxBalls, int fireBricks,
			int laserBricks, int livesLost, int perfectClears, int gameMs) {
		return ("{\"level\":%d,\"bricks\":%d,\"maxCombo\":%d,\"powerUps\":%d,\"maxBalls\":%d,\"fireBricks\":%d,"
				+ "\"laserBricks\":%d,\"livesLost\":%d,\"perfectClears\":%d,\"gameMs\":%d}")
			.formatted(level, bricks, maxCombo, powerUps, maxBalls, fireBricks, laserBricks, livesLost, perfectClears,
					gameMs);
	}

	private String start(MockHttpSession session) throws Exception {
		return JsonPath.read(this.mockMvc
			.perform(post("/api/game-sessions").session(session)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"gameSlug\":\"brick-breaker\"}"))
			.andExpect(status().isCreated())
			.andReturn()
			.getResponse()
			.getContentAsString(), "$.id");
	}

	private ResultActions finish(String run, int score, String details, MockHttpSession session) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions/{id}/finish", run).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, details));
		return this.mockMvc.perform(request);
	}

	private ResultActions buy(MockHttpSession session, String code) throws Exception {
		Long itemId = this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
		return this.mockMvc.perform(post("/api/shop/purchases").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId, UUID.randomUUID())));
	}

	private void playedFor(String run, Duration duration) {
		this.jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toSeconds(), run);
	}

}
