package com.cyan.arcade.minesweeper.daily;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinService;
import com.cyan.arcade.economy.CoinTransactionType;
import com.cyan.arcade.minesweeper.daily.DailyBoardService.AttemptOverException;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.AttemptResponse;
import com.cyan.arcade.minesweeper.daily.DailyBoardViews.Reward;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What a Daily Board attempt earns: 10 XP and 5 coins for a win, once per account and date, paid in
 * the transaction that saves the win; nothing for a loss or an attempt that ran out of time.
 *
 * <p>Wins are played on 2026-11-02, whose leaderboard no other test counts, or today through the API.
 * The daily limit of paid games is counted on the server's real day, whatever day's board was won.
 */
@IntegrationTest
class DailyBoardRewardTests {

	private static final String BASE = "/api/minesweeper/daily";

	private static final LocalDate WIN_DAY = LocalDate.of(2026, 11, 2);

	private static final LocalDate NO_WIN_DAY = LocalDate.of(2026, 11, 6);

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private Clock clock;

	@Autowired
	private DailyBoardService daily;

	@Autowired
	private DailyBoardStore store;

	@Autowired
	private CoinService coins;

	@Test
	void aWinPaysTenXpAndFiveCoinsInTheCompletedResponseAndNothingElse() throws Exception {
		long userId = newPlayer();
		Wallet before = walletOf(userId);
		Instant startAt = WIN_DAY.atTime(9, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int last = playAllButOne(userId, id, startAt.plusSeconds(30));
		assertThat(this.daily.attempt(userId, id, startAt.plusSeconds(30)).reward()).as("not before the win").isNull();

		AttemptResponse won = this.daily.reveal(userId, id, last, startAt.plusSeconds(61));
		assertThat(won.status()).isEqualTo("WON");
		assertThat(won.reward()).isEqualTo(new Reward(10, 5));
		Wallet after = walletOf(userId);
		assertThat(after.xp() - before.xp()).isEqualTo(10);
		assertThat(after.balance() - before.balance()).isEqualTo(5);
		// One ledger entry, a game completion referring to the board's date; no achievement, best or
		// daily challenge.
		assertThat(this.jdbc.queryForList("""
				SELECT type || ' ' || amount || ' ' || reference_type || ':' || reference_id
				FROM coin_transactions WHERE user_id = ? AND created_at >= now() - interval '1 hour'
				  AND type <> 'DAILY_LOGIN'
				""", String.class, userId))
			.containsExactly("GAME_COMPLETION 5 MINESWEEPER_DAILY_BOARD:" + WIN_DAY);
		assertThat(count("SELECT count(*) FROM user_achievements WHERE user_id = ?", userId)).isZero();
		assertThat(count("SELECT count(*) FROM daily_challenge_completions WHERE user_id = ?", userId)).isZero();
		assertThat(this.jdbc.queryForMap("SELECT reward_xp, reward_coins FROM minesweeper_daily_attempts WHERE id = ?", id))
			.containsEntry("reward_xp", 10)
			.containsEntry("reward_coins", 5);
	}

	@Test
	void aLossAndAnAttemptOutOfTimeEarnNothing() throws Exception {
		long loser = newPlayer();
		Wallet loserBefore = walletOf(loser);
		Instant startAt = NO_WIN_DAY.atTime(8, 0).toInstant(ZoneOffset.UTC);
		UUID lost = this.daily.start(loser, startAt).attempt().id();
		playAllButOne(loser, lost, startAt.plusSeconds(20));
		int mine = mineOn(NO_WIN_DAY);
		AttemptResponse loss = this.daily.reveal(loser, lost, mine, startAt.plusSeconds(40));
		assertThat(loss.status()).isEqualTo("LOST");
		assertThat(loss.reward()).isNull();
		assertThat(walletOf(loser)).isEqualTo(loserBefore);

		long late = newPlayer();
		Wallet lateBefore = walletOf(late);
		UUID expired = this.daily.start(late, startAt).attempt().id();
		int last = playAllButOne(late, expired, startAt.plusSeconds(20));
		Instant deadline = startAt.plus(DailyBoardSchedule.TIME_LIMIT);
		// The winning cell, sent once the time is up, expires the attempt instead.
		assertThatThrownBy(() -> this.daily.reveal(late, expired, last, deadline)).isInstanceOf(AttemptOverException.class);
		assertThat(this.daily.attempt(late, expired, deadline).status()).isEqualTo("EXPIRED");
		assertThat(this.daily.attempt(late, expired, deadline).reward()).isNull();
		assertThat(walletOf(late)).isEqualTo(lateBefore);

		// An unfinished attempt has earned nothing either.
		long playing = newPlayer();
		Wallet playingBefore = walletOf(playing);
		UUID open = this.daily.start(playing, startAt).attempt().id();
		playAllButOne(playing, open, startAt.plusSeconds(20));
		assertThat(this.daily.attempt(playing, open, startAt.plusSeconds(21)).reward()).isNull();
		assertThat(walletOf(playing)).isEqualTo(playingBefore);

		assertThat(count("""
				SELECT count(*) FROM minesweeper_daily_attempts
				WHERE id IN (?, ?, ?) AND (reward_xp IS NOT NULL OR reward_coins IS NOT NULL)
				""", lost, expired, open)).isZero();
		assertThat(count("SELECT count(*) FROM coin_transactions WHERE user_id IN (?, ?, ?) AND type = 'GAME_COMPLETION'",
				loser, late, playing)).isZero();
	}

	@Test
	void everythingSentAfterTheWinIsRefusedAndPaysNothingMore() throws Exception {
		long userId = newPlayer();
		Instant startAt = WIN_DAY.atTime(10, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int last = playAllButOne(userId, id, startAt.plusSeconds(10));
		Instant wonAt = startAt.plusSeconds(20);
		assertThat(this.daily.reveal(userId, id, last, wonAt).reward()).isEqualTo(new Reward(10, 5));
		Wallet afterWin = walletOf(userId);

		// The same winning reveal again, another cell, a flag, and starting again.
		for (int retry = 0; retry < 3; retry++) {
			assertThatThrownBy(() -> this.daily.reveal(userId, id, last, wonAt.plusSeconds(1)))
				.isInstanceOf(AttemptOverException.class);
		}
		assertThatThrownBy(() -> this.daily.reveal(userId, id, mineOn(WIN_DAY), wonAt.plusSeconds(2)))
			.isInstanceOf(AttemptOverException.class);
		assertThatThrownBy(() -> this.daily.flag(userId, id, mineOn(WIN_DAY), true, wonAt.plusSeconds(3)))
			.isInstanceOf(AttemptOverException.class);
		AttemptResponse again = this.daily.start(userId, wonAt.plusSeconds(4)).attempt();
		assertThat(again.id()).isEqualTo(id);
		assertThat(again.reward()).isEqualTo(new Reward(10, 5));

		assertThat(walletOf(userId)).isEqualTo(afterWin);
		assertThat(gameCompletionsOf(userId)).isEqualTo(1);
	}

	@Test
	void theWinningRevealSentManyTimesAtOncePaysOnce() throws Exception {
		long userId = newPlayer();
		Wallet before = walletOf(userId);
		Instant startAt = WIN_DAY.atTime(11, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int last = playAllButOne(userId, id, startAt.plusSeconds(10));
		List<Object> outcomes = atOnce(8, () -> {
			try {
				return this.daily.reveal(userId, id, last, startAt.plusSeconds(25));
			}
			catch (AttemptOverException ex) {
				return ex.getCode();
			}
		});
		assertThat(outcomes).filteredOn(AttemptResponse.class::isInstance)
			.singleElement()
			.extracting((won) -> ((AttemptResponse) won).reward())
			.isEqualTo(new Reward(10, 5));
		assertThat(outcomes).filteredOn("ATTEMPT_OVER"::equals).hasSize(7);
		Wallet after = walletOf(userId);
		assertThat(after.xp() - before.xp()).isEqualTo(10);
		assertThat(after.balance() - before.balance()).isEqualTo(5);
		assertThat(gameCompletionsOf(userId)).isEqualTo(1);
	}

	@Test
	void overTheDaysPaidGamesAWinStillEarnsItsXpButNoCoins() throws Exception {
		long userId = newPlayer();
		// The day's 40 paid games (the default limit) were played before the win.
		for (int game = 0; game < 40; game++) {
			this.coins.credit(userId, CoinTransactionType.GAME_COMPLETION, 5, CoinReference.of("TEST_GAME", game),
					"Finished a game");
		}
		Wallet before = walletOf(userId);
		Instant startAt = WIN_DAY.atTime(12, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		int last = playAllButOne(userId, id, startAt.plusSeconds(10));
		AttemptResponse won = this.daily.reveal(userId, id, last, startAt.plusSeconds(30));
		assertThat(won.reward()).isEqualTo(new Reward(10, 0));
		Wallet after = walletOf(userId);
		assertThat(after.xp() - before.xp()).isEqualTo(10);
		assertThat(after.balance()).isEqualTo(before.balance());
		assertThat(gameCompletionsOf(userId)).isEqualTo(40);
		assertThat(this.daily.attempt(userId, id, startAt.plusSeconds(31)).reward()).isEqualTo(new Reward(10, 0));
	}

	@Test
	void theRewardIsInTheWinningResponseAndEveryLaterRead() throws Exception {
		MockHttpSession player = Players.register(this.mockMvc);
		long userId = Players.userId(this.mockMvc, player);
		String started = this.mockMvc.perform(post(BASE + "/attempts").session(player))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.reward").value(nullValue()))
			.andReturn()
			.getResponse()
			.getContentAsString();
		UUID id = UUID.fromString(JsonPath.read(started, "$.id"));
		int last = playAllButOne(userId, id, this.clock.instant());

		this.mockMvc.perform(post(BASE + "/attempts/{id}/reveal", id).session(player)
				.contentType(MediaType.APPLICATION_JSON)
				// Whatever a client claims to have earned is not read.
				.content("{\"cell\":%d,\"reward\":{\"xp\":999,\"coins\":999}}".formatted(last)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("WON"))
			.andExpect(jsonPath("$.reward.xp").value(10))
			.andExpect(jsonPath("$.reward.coins").value(5));
		// After a reload: the attempt, today's board, and starting again all show the same reward.
		this.mockMvc.perform(get(BASE + "/attempts/{id}", id).session(player))
			.andExpect(jsonPath("$.reward.xp").value(10))
			.andExpect(jsonPath("$.reward.coins").value(5));
		this.mockMvc.perform(get(BASE).session(player))
			.andExpect(jsonPath("$.attempt.reward.xp").value(10))
			.andExpect(jsonPath("$.attempt.reward.coins").value(5));
		this.mockMvc.perform(post(BASE + "/attempts").session(player))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.reward.xp").value(10))
			.andExpect(jsonPath("$.reward.coins").value(5));
		assertThat(gameCompletionsOf(userId)).isEqualTo(1);
	}

	@Test
	void onlyAWonAttemptCanHoldAReward() throws Exception {
		long userId = newPlayer();
		Instant startAt = NO_WIN_DAY.atTime(13, 0).toInstant(ZoneOffset.UTC);
		UUID id = this.daily.start(userId, startAt).attempt().id();
		assertThatThrownBy(() -> this.jdbc.update(
				"UPDATE minesweeper_daily_attempts SET reward_xp = 10, reward_coins = 5 WHERE id = ?", id))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThat(this.store.saveReward(id, new DailyAttempt.Reward(10, 5))).isFalse();
		assertThat(this.daily.attempt(userId, id, startAt.plusSeconds(1)).reward()).isNull();
	}

	// --- Helpers -------------------------------------------------------------------------------------

	private record Wallet(int xp, long balance) {
	}

	private Wallet walletOf(long userId) {
		return new Wallet(this.jdbc.queryForObject("SELECT xp FROM users WHERE id = ?", Integer.class, userId),
				this.coins.balanceOf(userId));
	}

	private long gameCompletionsOf(long userId) {
		return count("SELECT count(*) FROM coin_transactions WHERE user_id = ? AND type = 'GAME_COMPLETION'", userId);
	}

	private long count(String sql, Object... args) {
		return this.jdbc.queryForObject(sql, Long.class, args);
	}

	private long newPlayer() throws Exception {
		return Players.userId(this.mockMvc, Players.register(this.mockMvc));
	}

	private DailyLayout layoutOn(LocalDate date) {
		return this.store.findBoard(date).orElseThrow().layout(DailyBoardSchedule.BOARD);
	}

	private int mineOn(LocalDate date) {
		DailyLayout layout = layoutOn(date);
		for (int cell = 0; cell < DailyBoardSchedule.BOARD.cells(); cell++) {
			if (layout.isMine(cell)) {
				return cell;
			}
		}
		throw new IllegalStateException("A board without mines");
	}

	/** Reveals every safe cell but one, at that moment, and returns the one left (as DailyBoardApiTests). */
	private int playAllButOne(long userId, UUID id, Instant at) {
		AttemptResponse now = this.daily.attempt(userId, id, at);
		DailyLayout layout = layoutOn(now.date());
		List<Integer> covered = new ArrayList<>();
		for (int cell = 0; cell < DailyBoardSchedule.BOARD.cells(); cell++) {
			if (!layout.isMine(cell) && now.cells().charAt(cell) == 'H') {
				covered.add(cell);
			}
		}
		int last = covered.stream()
			.filter((cell) -> layout.adjacent(cell) > 0 && Arrays.stream(DailyBoardSchedule.BOARD.neighbours(cell))
				.noneMatch((other) -> !layout.isMine(other) && layout.adjacent(other) == 0))
			.findFirst()
			.orElseGet(() -> covered.stream().filter((cell) -> layout.adjacent(cell) == 0).findFirst().orElseThrow());
		// Kept back: whatever revealing the last cell now would uncover with it.
		String before = now.cells();
		char[] keptBack = DailyPlay.reveal(layout, before.toCharArray(), 0, 0, last).cells();
		for (int cell : covered) {
			if (keptBack[cell] == before.charAt(cell) && now.cells().charAt(cell) == 'H') {
				now = this.daily.reveal(userId, id, cell, at);
			}
		}
		assertThat(now.status()).isEqualTo("PLAYING");
		assertThat(now.cells().charAt(last)).isEqualTo('H');
		return last;
	}

	private static <T> List<T> atOnce(int threads, Callable<? extends T> task) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		try {
			CountDownLatch go = new CountDownLatch(1);
			List<Future<? extends T>> futures = new ArrayList<>();
			for (int i = 0; i < threads; i++) {
				futures.add(pool.submit(() -> {
					go.await();
					return task.call();
				}));
			}
			go.countDown();
			List<T> results = new ArrayList<>();
			for (Future<? extends T> future : futures) {
				results.add(future.get(30, TimeUnit.SECONDS));
			}
			return results;
		}
		finally {
			pool.shutdownNow();
		}
	}

}
