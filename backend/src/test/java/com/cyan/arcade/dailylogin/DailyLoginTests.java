package com.cyan.arcade.dailylogin;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.common.error.ConflictException;
import com.cyan.arcade.dailylogin.DailyLoginResponse.Claimed;
import com.cyan.arcade.dailylogin.DailyLoginResponse.Day;
import com.cyan.arcade.dailylogin.DailyLoginResponse.State;
import com.cyan.arcade.economy.CoinService;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The daily login reward. Today's claim goes through the API; earlier and later days are claimed
 * through the service with a moment of the test's choosing, the one thing the API never takes.
 */
@IntegrationTest
class DailyLoginTests {

	/** A day far from the real one, so these claims never meet the API's. */
	private static final LocalDate SOME_DAY = LocalDate.of(2031, 6, 1);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DailyLoginService dailyLogin;

	@Autowired
	private CoinService coins;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TransactionTemplate transaction;

	// --- Through the API -----------------------------------------------------------------------------

	@Test
	void aNewPlayerCanClaimDayOne() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(get("/api/daily-login").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.date").value(LocalDate.now(ZoneOffset.UTC).toString()))
			.andExpect(jsonPath("$.claimedToday").value(false))
			.andExpect(jsonPath("$.streak").value(0))
			.andExpect(jsonPath("$.day").value(1))
			.andExpect(jsonPath("$.days", hasSize(7)))
			.andExpect(jsonPath("$.days[*].coins", contains(50, 60, 70, 80, 100, 125, 200)))
			.andExpect(jsonPath("$.days[0].state").value("TODAY"))
			.andExpect(jsonPath("$.days[1].state").value("UPCOMING"))
			.andExpect(jsonPath("$.days[0].bonusItem").value(nullValue()))
			.andExpect(jsonPath("$.days[6].bonusItem").value("Extra Pack"));

		this.mockMvc.perform(post("/api/daily-login/claim").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.day").value(1))
			.andExpect(jsonPath("$.streak").value(1))
			.andExpect(jsonPath("$.coins").value(50))
			.andExpect(jsonPath("$.bonusItem").value(nullValue()))
			.andExpect(jsonPath("$.balance").value(50))
			.andExpect(jsonPath("$.status.claimedToday").value(true))
			.andExpect(jsonPath("$.status.days[0].state").value("CLAIMED"));

		this.mockMvc.perform(get("/api/users/me/transactions").session(session))
			.andExpect(jsonPath("$.entries[0].type").value("DAILY_LOGIN"))
			.andExpect(jsonPath("$.entries[0].amount").value(50));
	}

	@Test
	void aDayCanBeClaimedOnce() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		this.mockMvc.perform(post("/api/daily-login/claim").session(session)).andExpect(status().isOk());

		this.mockMvc.perform(post("/api/daily-login/claim").session(session))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DAILY_LOGIN_ALREADY_CLAIMED"));

		this.mockMvc.perform(get("/api/users/me/coins").session(session)).andExpect(jsonPath("$.balance").value(50));
	}

	@Test
	void theRequestCannotChooseTheDayOrTheAmount() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc
			.perform(post("/api/daily-login/claim").session(session)
				.contentType("application/json")
				.content("{\"date\":\"2031-01-01\",\"coins\":99999,\"day\":7}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.coins").value(50))
			.andExpect(jsonPath("$.status.date").value(LocalDate.now(ZoneOffset.UTC).toString()));
	}

	@Test
	void theDailyLoginIsForSignedInPlayers() throws Exception {
		this.mockMvc.perform(get("/api/daily-login")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(post("/api/daily-login/claim")).andExpect(status().isUnauthorized());
	}

	// --- Over several days ---------------------------------------------------------------------------

	@Test
	void everyDayInARowIsWorthMore() throws Exception {
		Long userId = newPlayer();

		for (int day = 1; day <= 6; day++) {
			Claimed claimed = claimOn(userId, SOME_DAY.plusDays(day - 1));
			assertThat(claimed.day()).isEqualTo(day);
			assertThat(claimed.streak()).isEqualTo(day);
		}

		assertThat(this.coins.balanceOf(userId)).isEqualTo(50 + 60 + 70 + 80 + 100 + 125);
		DailyLoginResponse status = statusOn(userId, SOME_DAY.plusDays(6));
		assertThat(status.claimedToday()).isFalse();
		assertThat(status.streak()).isEqualTo(6);
		assertThat(status.day()).isEqualTo(7);
		assertThat(status.days()).extracting(Day::state)
			.containsExactly(State.CLAIMED, State.CLAIMED, State.CLAIMED, State.CLAIMED, State.CLAIMED,
					State.CLAIMED, State.TODAY);
	}

	@Test
	void theSeventhDayGivesItsCoinsAndABonusPackAndTheStreakStartsOver() throws Exception {
		Long userId = newPlayer();
		for (int day = 0; day < 6; day++) {
			claimOn(userId, SOME_DAY.plusDays(day));
		}

		Claimed seventh = claimOn(userId, SOME_DAY.plusDays(6));
		assertThat(seventh.day()).isEqualTo(7);
		assertThat(seventh.coins()).isEqualTo(200);
		assertThat(seventh.bonusItem()).isEqualTo("Extra Pack");
		assertThat(this.jdbc.queryForObject("""
				SELECT inv.quantity FROM user_inventory inv JOIN shop_items i ON i.id = inv.item_id
				WHERE inv.user_id = ? AND i.code = 'EXTRA_PACK'
				""", Integer.class, userId)).isEqualTo(1);
		// The coin history says what the whole day gave, the pack included.
		assertThat(this.jdbc.queryForObject("""
				SELECT description FROM coin_transactions
				WHERE user_id = ? AND type = 'DAILY_LOGIN' AND reference_id = ?
				""", String.class, userId, SOME_DAY.plusDays(6).toString()))
			.isEqualTo("Daily login, day 7 + 1 × Extra Pack");

		Claimed eighth = claimOn(userId, SOME_DAY.plusDays(7));
		assertThat(eighth.day()).isEqualTo(1);
		assertThat(eighth.streak()).isEqualTo(8);
		assertThat(eighth.coins()).isEqualTo(50);
		assertThat(eighth.bonusItem()).isNull();
	}

	@Test
	void missingADayBreaksTheStreak() throws Exception {
		Long userId = newPlayer();
		claimOn(userId, SOME_DAY);
		claimOn(userId, SOME_DAY.plusDays(1));

		assertThat(statusOn(userId, SOME_DAY.plusDays(3)).streak()).isZero();
		Claimed afterABreak = claimOn(userId, SOME_DAY.plusDays(3));
		assertThat(afterABreak.day()).isEqualTo(1);
		assertThat(afterABreak.streak()).isEqualTo(1);
		assertThat(afterABreak.coins()).isEqualTo(50);
	}

	@Test
	void theDayStartsAtMidnightUtc() throws Exception {
		Long userId = newPlayer();
		claimAt(userId, SOME_DAY.atTime(23, 59, 59).toInstant(ZoneOffset.UTC));

		// One second later it is the next day, wherever the player is.
		Claimed next = claimAt(userId, SOME_DAY.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC));
		assertThat(next.day()).isEqualTo(2);
		assertThatExceptionOfType(ConflictException.class)
			.isThrownBy(() -> claimAt(userId, SOME_DAY.plusDays(1).atTime(23, 0).toInstant(ZoneOffset.UTC)));
	}

	@Test
	void simultaneousClaimsOfTheSameDayPayOnce() throws Exception {
		Long userId = newPlayer();
		Instant moment = SOME_DAY.atTime(12, 0).toInstant(ZoneOffset.UTC);

		List<Callable<Boolean>> claims = new ArrayList<>();
		for (int attempt = 0; attempt < 8; attempt++) {
			claims.add(() -> {
				try {
					claimAt(userId, moment);
					return true;
				}
				catch (ConflictException ex) {
					return false;
				}
			});
		}
		ExecutorService pool = Executors.newFixedThreadPool(claims.size());
		List<Boolean> results = new ArrayList<>();
		try {
			for (Future<Boolean> result : pool.invokeAll(claims)) {
				results.add(result.get());
			}
		}
		finally {
			pool.shutdown();
		}

		assertThat(results).filteredOn((claimed) -> claimed).hasSize(1);
		assertThat(this.coins.balanceOf(userId)).isEqualTo(50);
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM daily_logins WHERE user_id = ?", Integer.class,
				userId))
			.isEqualTo(1);
	}

	@Test
	void theRewardsAreConfigurationThatMustMakeSense() {
		DailyLoginProperties properties = new DailyLoginProperties(List.of(10, 20, 30), "", 1);
		assertThat(properties.dayOf(1)).isEqualTo(1);
		assertThat(properties.dayOf(3)).isEqualTo(3);
		assertThat(properties.dayOf(4)).isEqualTo(1);
		assertThat(properties.hasBonusOn(3)).isFalse();

		assertThatExceptionOfType(IllegalArgumentException.class)
			.isThrownBy(() -> new DailyLoginProperties(List.of(), "EXTRA_PACK", 1));
		assertThatExceptionOfType(IllegalArgumentException.class)
			.isThrownBy(() -> new DailyLoginProperties(List.of(10, -1), "EXTRA_PACK", 1));
	}

	private Long newPlayer() throws Exception {
		return Players.userId(this.mockMvc, Players.register(this.mockMvc));
	}

	private Claimed claimOn(Long userId, LocalDate date) {
		return claimAt(userId, date.atTime(9, 0).toInstant(ZoneOffset.UTC));
	}

	private Claimed claimAt(Long userId, Instant moment) {
		return this.transaction.execute((status) -> this.dailyLogin.claimAt(userId, moment));
	}

	private DailyLoginResponse statusOn(Long userId, LocalDate date) {
		return this.transaction
			.execute((status) -> this.dailyLogin.statusAt(userId, date.atTime(9, 0).toInstant(ZoneOffset.UTC)));
	}

}
