package com.cyan.arcade.gamerules;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import com.cyan.arcade.HonestRuns;
import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dino Run on the platform: a catalog row, a {@link com.cyan.arcade.score.RunRules} bean and five
 * skins are all it brings to the server. Sessions, scores, leaderboards, rewards, achievements,
 * challenges, skins and AI access work for it as for every game.
 */
@IntegrationTest
class DinoRunApiTests {

	private static final String PLAYER_HEADER = "X-Player-Id";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Clock clock;

	private LocalDate today;

	@BeforeEach
	void noDinoChallengeToday() {
		this.today = LocalDate.ofInstant(this.clock.instant(), ZoneOffset.UTC);
		clearChallenge();
	}

	@AfterEach
	void leaveNoChallenge() {
		clearChallenge();
	}

	@Test
	void dinoRunIsInTheCatalog() throws Exception {
		this.mockMvc.perform(get("/api/games/dino-run"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Dino Run"))
			.andExpect(jsonPath("$.category").value("ARCADE"))
			.andExpect(jsonPath("$.thumbnailUrl").value("/thumbnails/dino-run.svg"));
	}

	@Test
	void aRunIsRecordedRankedAndRewarded() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofMinutes(2));

		finish(run, 1000, DinoRunRunRulesTests.honest(1000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.gameSlug").value("dino-run"))
			.andExpect(jsonPath("$.score").value(1000))
			.andExpect(jsonPath("$.rewards.personalBest").value(true))
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItems("DINO_FIRST_RUN", "DINO_HUNDRED", "DINO_DISTANCE_RUNNER")))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("DINO_SPEED_DEMON"))));

		for (String period : new String[] { "DAILY", "WEEKLY", "ALL_TIME" }) {
			this.mockMvc.perform(get("/api/leaderboards/dino-run?period={period}&size=100", period).session(player))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.myScore").value(1000));
		}
		this.mockMvc.perform(get("/api/users/me/stats").session(player))
			.andExpect(jsonPath("$.games[?(@.slug == 'dino-run')].bestScore", hasItem(1000)));

		// The same achievements are never earned twice.
		String second = start(player, null);
		playedFor(second, Duration.ofMinutes(2));
		finish(second, 1000, DinoRunRunRulesTests.honest(1000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.personalBest").value(false))
			.andExpect(jsonPath("$.rewards.achievements[*].code", not(hasItem("DINO_FIRST_RUN"))));
	}

	@Test
	void aTopSpeedRunIsASpeedDemon() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofMinutes(5));
		finish(run, 6000, DinoRunRunRulesTests.honest(6000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.achievements[*].code", hasItems("DINO_SPEED_DEMON", "DINO_UNTOUCHABLE")));
	}

	@Test
	void anImpossibleRunIsRejectedWithoutSayingWhyAndEarnsNothing() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofMinutes(2));

		Map<String, Integer> honest = DinoRunRunRulesTests.honest(1000);
		// A score far beyond what the run's time covers.
		finish(run, 5000, withScore(honest, 5000), player, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("SCORE_REJECTED"))
			.andExpect(jsonPath("$.detail").value("Score submission rejected."))
			.andExpect(content().string(not(containsString("distance"))));
		// Clearing obstacles without a single jump or duck.
		Map<String, Integer> noInputs = new java.util.HashMap<>(honest);
		noInputs.put("jumps", 0);
		finish(run, 1000, noInputs, player, null).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		// Another game's details.
		finish(run, 10, Map.of("pipes", 10, "flaps", 28), player, null).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM scores WHERE game_session_id = ?::uuid", Integer.class, run))
			.isZero();
		this.mockMvc.perform(get("/api/users/me").session(player)).andExpect(jsonPath("$.xp").value(0));

		// The honest result is still accepted, once.
		finish(run, 1000, honest, player, null).andExpect(status().isOk());
		finish(run, 1000, honest, player, null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("SESSION_ALREADY_FINISHED"));
	}

	@Test
	void aRunLongerThanItsSessionIsRejected() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofSeconds(5));
		finish(run, 1000, DinoRunRunRulesTests.honest(1000), player, null).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
	}

	@Test
	void runsBelongToTheirPlayerAndExpire() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		MockHttpSession other = Players.register(this.mockMvc);
		String run = start(player, null);
		playedFor(run, Duration.ofMinutes(2));
		finish(run, 1000, DinoRunRunRulesTests.honest(1000), other, null).andExpect(status().isForbidden());

		String stale = start(player, null);
		playedFor(stale, Duration.ofHours(25));
		finish(stale, 1000, DinoRunRunRulesTests.honest(1000), player, null).andExpect(status().isGone())
			.andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));

		// A guest's run, only from its own browser, and for no rewards.
		UUID browser = UUID.randomUUID();
		String guestRun = start(null, browser);
		playedFor(guestRun, Duration.ofMinutes(2));
		finish(guestRun, 100, DinoRunRunRulesTests.honest(100), null, UUID.randomUUID()).andExpect(status().isForbidden());
		finish(guestRun, 100, DinoRunRunRulesTests.honest(100), null, browser).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards").value(nullValue()));
	}

	@Test
	void aDailyChallengeIsCompletedByAValidatedRunOnce() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		this.jdbc.update("""
				INSERT INTO daily_challenges (challenge_date, game_id, title, description, goal, detail, target, xp_reward,
				                              coin_reward, created_at)
				VALUES (?, (SELECT id FROM games WHERE slug = 'dino-run'), 'Hurdler', 'Clear 25 obstacles.', 'DETAIL',
				        'obstacles', 25, 40, 80, now())
				""", this.today);

		// A rejected run claiming 25 obstacles completes nothing.
		String forged = start(player, null);
		playedFor(forged, Duration.ofMinutes(2));
		Map<String, Integer> claim = new java.util.HashMap<>(DinoRunRunRulesTests.honest(300));
		claim.put("obstacles", 25);
		finish(forged, 300, claim, player, null).andExpect(jsonPath("$.code").value("SCORE_REJECTED"));
		assertThat(completions(playerId)).isZero();

		String run = start(player, null);
		playedFor(run, Duration.ofMinutes(5));
		finish(run, 2000, DinoRunRunRulesTests.honest(2000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.bonuses[?(@.type == 'DAILY_CHALLENGE')].title", contains("Hurdler")));
		String again = start(player, null);
		playedFor(again, Duration.ofMinutes(5));
		finish(again, 2000, DinoRunRunRulesTests.honest(2000), player, null).andExpect(status().isOk())
			.andExpect(jsonPath("$.rewards.bonuses[*].type", not(hasItem("DAILY_CHALLENGE"))));
		assertThat(completions(playerId)).isEqualTo(1);
	}

	@Test
	void theAiIsForAdminsOnly() throws Exception {
		this.mockMvc.perform(get("/api/ai/access")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/ai/access").session(Players.register(this.mockMvc))).andExpect(status().isForbidden());
		this.mockMvc.perform(get("/api/ai/access").session(Players.signInAsAdmin(this.mockMvc))).andExpect(status().isNoContent());
	}

	@Test
	void anAdminWearsDinoRunSkinsFreeAndAPlayerMustBuyThem() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		Long playerId = Players.userId(this.mockMvc, player);
		this.mockMvc.perform(get("/api/shop/items?type=GAME_SKIN").session(player))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'dino-run')].slot",
					containsInAnyOrder("runner", "runner", "obstacles")))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'dino-run')].wearable", everyItem(is(false))));
		wear(player, "DINO_RUNNER_SAKURA").andExpect(status().isNotFound());
		Players.grantCoins(this.mockMvc, playerId, 250);
		this.mockMvc.perform(post("/api/shop/purchases").session(player)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"itemId\":%d,\"requestId\":\"%s\"}".formatted(itemId("DINO_RUNNER_SAKURA"), UUID.randomUUID())))
			.andExpect(status().is2xxSuccessful());
		wear(player, "DINO_RUNNER_SAKURA").andExpect(status().isOk());

		MockHttpSession admin = Players.register(this.mockMvc);
		Long adminId = Players.userId(this.mockMvc, admin);
		this.jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", adminId);
		wear(admin, "DINO_OBSTACLES_CANDY").andExpect(status().isOk());
		wear(admin, "DINO_RUNNER_MIDNIGHT").andExpect(status().isOk());
		// The world is not a skin any more: the old world skins are out of the shop and cannot be worn.
		wear(admin, "DINO_WORLD_MOON").andExpect(status().isNotFound());
		this.mockMvc.perform(get("/api/shop/items").session(admin))
			.andExpect(jsonPath("$.items[?(@.code == 'DINO_OBSTACLES_CANDY')].equipped", contains(true)))
			.andExpect(jsonPath("$.items[?(@.gameSlug == 'dino-run')].owned", contains(0, 0, 0)));
		this.mockMvc.perform(get("/api/users/me/coins").session(admin)).andExpect(jsonPath("$.balance").value(0));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM purchases WHERE user_id = ?", Integer.class, adminId))
			.isZero();
		// Another game's skin is not free for Dino Run's sake, and unknown items are refused.
		wear(admin, "FLAPPY_BIRD_SAKURA").andExpect(status().isNotFound());
		this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", 999_999).session(admin))
			.andExpect(status().isNotFound());
	}

	// --- Helpers ------------------------------------------------------------------------------------

	private static Map<String, Integer> withScore(Map<String, Integer> details, int score) {
		Map<String, Integer> changed = new java.util.HashMap<>(details);
		changed.put("meters", score);
		changed.put("level", DinoRunRunRules.levelFor(score));
		return changed;
	}

	private String start(MockHttpSession session, UUID playerId) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions").contentType(MediaType.APPLICATION_JSON)
			.content("{\"gameSlug\":\"dino-run\"}");
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return JsonPath.read(this.mockMvc.perform(request).andExpect(status().isCreated()).andReturn().getResponse()
			.getContentAsString(), "$.id");
	}

	private ResultActions finish(String run, int score, Map<String, Integer> details, MockHttpSession session,
			UUID playerId) throws Exception {
		MockHttpServletRequestBuilder request = post("/api/game-sessions/{id}/finish", run)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"score\":%d,\"details\":%s}".formatted(score, HonestRuns.json(details)));
		if (session != null) {
			request.session(session);
		}
		if (playerId != null) {
			request.header(PLAYER_HEADER, playerId);
		}
		return this.mockMvc.perform(request);
	}

	private void playedFor(String run, Duration duration) {
		this.jdbc.update("UPDATE game_sessions SET started_at = started_at - make_interval(secs => ?) WHERE id = ?::uuid",
				duration.toSeconds(), run);
	}

	private ResultActions wear(MockHttpSession session, String code) throws Exception {
		return this.mockMvc.perform(put("/api/users/me/inventory/{id}/equipped", itemId(code)).session(session));
	}

	private Long itemId(String code) {
		return this.jdbc.queryForObject("SELECT id FROM shop_items WHERE code = ?", Long.class, code);
	}

	private void clearChallenge() {
		String ids = "SELECT id FROM daily_challenges WHERE challenge_date = ? AND game_id = (SELECT id FROM games WHERE slug = 'dino-run')";
		this.jdbc.update("DELETE FROM daily_challenge_completions WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenge_progress WHERE daily_challenge_id IN (" + ids + ")", this.today);
		this.jdbc.update("DELETE FROM daily_challenges WHERE challenge_date = ? AND game_id = (SELECT id FROM games WHERE slug = 'dino-run')",
				this.today);
	}

	private int completions(Long userId) {
		return this.jdbc.queryForObject("SELECT count(*) FROM daily_challenge_completions WHERE user_id = ?", Integer.class,
				userId);
	}

}
