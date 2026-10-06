package com.cyan.arcade.economy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The coin ledger: every change is a transaction, rewards are paid once, balances never go negative,
 * and a failed operation leaves nothing behind, even when requests arrive at the same moment.
 */
@IntegrationTest
class CoinLedgerTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CoinService coins;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TransactionTemplate transaction;

	// --- Earning and spending ----------------------------------------------------------------------

	@Test
	void earningCoinsRecordsATransactionAndRaisesTheBalance() throws Exception {
		Long userId = newPlayer();

		CoinTransaction earned = this.coins
			.credit(userId, CoinTransactionType.DAILY_CHALLENGE, 60, CoinReference.of("DAILY_CHALLENGE", 1),
					"Test reward")
			.orElseThrow();

		assertThat(earned.amount()).isEqualTo(60);
		assertThat(earned.balanceAfter()).isEqualTo(60);
		assertThat(this.coins.balanceOf(userId)).isEqualTo(60);
		assertThat(ledgerOf(userId)).containsExactly(60);
	}

	@Test
	void theSameRewardIsPaidOnlyOnce() throws Exception {
		Long userId = newPlayer();
		CoinReference reference = CoinReference.of("ACHIEVEMENT", "FIRST_GAME");

		assertThat(this.coins.credit(userId, CoinTransactionType.ACHIEVEMENT, 100, reference, "First")).isPresent();
		assertThat(this.coins.credit(userId, CoinTransactionType.ACHIEVEMENT, 100, reference, "Again")).isEmpty();

		assertThat(this.coins.balanceOf(userId)).isEqualTo(100);
		assertThat(ledgerOf(userId)).containsExactly(100);
	}

	@Test
	void spendingCoinsLowersTheBalanceAndIsRecordedAsANegativeAmount() throws Exception {
		Long userId = newPlayer();
		credit(userId, 500);

		CoinTransaction spent = this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 120,
				CoinReference.of("PURCHASE", 1), "Bought something");

		assertThat(spent.amount()).isEqualTo(-120);
		assertThat(spent.balanceAfter()).isEqualTo(380);
		assertThat(this.coins.balanceOf(userId)).isEqualTo(380);
		assertThat(ledgerOf(userId)).containsExactly(500, -120);
	}

	@Test
	void spendingMoreThanTheBalanceFailsAndChangesNothing() throws Exception {
		Long userId = newPlayer();
		credit(userId, 99);

		assertThatExceptionOfType(InsufficientCoinsException.class)
			.isThrownBy(() -> this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 100,
					CoinReference.of("PURCHASE", 2), "Too expensive"))
			.satisfies((ex) -> assertThat(ex.getCode()).isEqualTo("INSUFFICIENT_COINS"));

		assertThat(this.coins.balanceOf(userId)).isEqualTo(99);
		assertThat(ledgerOf(userId)).containsExactly(99);
	}

	@Test
	void amountsMustMakeSense() throws Exception {
		Long userId = newPlayer();

		assertThatIllegalArgumentException().isThrownBy(
				() -> this.coins.credit(userId, CoinTransactionType.ADMIN_GRANT, -5, null, "Negative credit"));
		assertThatIllegalArgumentException().isThrownBy(
				() -> this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 0, null, "Free debit"));
		assertThatIllegalArgumentException()
			.isThrownBy(() -> this.coins.grant(userId, 0, CoinReference.of("ADMIN_GRANT", "x"), "Nothing", userId));
		// Crediting nothing records nothing.
		assertThat(this.coins.credit(userId, CoinTransactionType.GAME_COMPLETION, 0, null, "Zero")).isEmpty();
		assertThat(ledgerOf(userId)).isEmpty();
	}

	@Test
	void paymentForTheSameThingCannotBeTakenTwice() throws Exception {
		Long userId = newPlayer();
		credit(userId, 500);
		CoinReference purchase = CoinReference.of("PURCHASE", 77);
		this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 100, purchase, "Once");

		assertThatIllegalStateException()
			.isThrownBy(() -> this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 100, purchase, "Twice"));
		assertThat(this.coins.balanceOf(userId)).isEqualTo(400);
	}

	@Test
	void theDatabaseRefusesANegativeBalanceOrAZeroTransaction() throws Exception {
		Long userId = newPlayer();
		credit(userId, 10);

		assertThatExceptionOfType(Exception.class)
			.isThrownBy(() -> this.jdbc.update("UPDATE user_wallets SET balance = -1 WHERE user_id = ?", userId));
		assertThatExceptionOfType(Exception.class).isThrownBy(() -> this.jdbc.update("""
				INSERT INTO coin_transactions (user_id, amount, balance_after, type, description, created_at)
				VALUES (?, 0, 10, 'ADMIN_GRANT', 'Nothing', now())
				""", userId));
	}

	// --- Transactions --------------------------------------------------------------------------------

	@Test
	void whenTheOperationAroundACreditFailsTheCreditIsRolledBack() throws Exception {
		Long userId = newPlayer();

		assertThatIllegalStateException().isThrownBy(() -> this.transaction.executeWithoutResult((status) -> {
			this.coins.credit(userId, CoinTransactionType.DAILY_LOGIN, 50, CoinReference.of("DAILY_LOGIN", "x"),
					"Rolled back");
			throw new IllegalStateException("Something after the credit failed");
		}));

		assertThat(this.coins.balanceOf(userId)).isZero();
		assertThat(ledgerOf(userId)).isEmpty();
		// And the reward can still be paid by a later attempt that succeeds.
		assertThat(this.coins.credit(userId, CoinTransactionType.DAILY_LOGIN, 50, CoinReference.of("DAILY_LOGIN", "x"),
				"Paid")).isPresent();
	}

	@Test
	void simultaneousSpendingNeverTakesTheBalanceBelowZero() throws Exception {
		Long userId = newPlayer();
		credit(userId, 500);

		// Ten purchases of 100 at once, with only enough for five.
		List<Callable<Boolean>> attempts = new ArrayList<>();
		for (int attempt = 0; attempt < 10; attempt++) {
			int purchase = attempt;
			attempts.add(() -> {
				try {
					this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 100,
							CoinReference.of("PURCHASE", "concurrent-" + purchase), "At once");
					return true;
				}
				catch (InsufficientCoinsException ex) {
					return false;
				}
			});
		}
		List<Boolean> results = runAtOnce(attempts);

		assertThat(results).filteredOn((succeeded) -> succeeded).hasSize(5);
		assertThat(this.coins.balanceOf(userId)).isZero();
		assertThat(ledgerOf(userId).stream().mapToInt(Integer::intValue).sum()).isZero();
	}

	@Test
	void simultaneousRewardsAllCountAndTheSameOneCountsOnce() throws Exception {
		Long userId = newPlayer();

		List<Callable<Boolean>> attempts = new ArrayList<>();
		for (int attempt = 0; attempt < 8; attempt++) {
			int reward = attempt;
			attempts.add(() -> this.coins
				.credit(userId, CoinTransactionType.GAME_COMPLETION, 5, CoinReference.of("GAME_SESSION", reward),
						"Different runs")
				.isPresent());
			attempts.add(() -> this.coins
				.credit(userId, CoinTransactionType.ACHIEVEMENT, 100, CoinReference.of("ACHIEVEMENT", "SAME"),
						"The same achievement")
				.isPresent());
		}
		runAtOnce(attempts);

		// Eight different runs, and one achievement however many times it was claimed.
		assertThat(this.coins.balanceOf(userId)).isEqualTo(8 * 5 + 100);
		assertThat(ledgerOf(userId)).hasSize(9);
	}

	@Test
	void everyBalanceEqualsTheSumOfItsLedger() throws Exception {
		Long userId = newPlayer();
		credit(userId, 300);
		this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 120, CoinReference.of("PURCHASE", 5), "One");
		this.coins.credit(userId, CoinTransactionType.HIGH_SCORE, 15, CoinReference.of("GAME_SESSION", "g"), "Best");

		Long ledgerSum = this.jdbc.queryForObject("SELECT sum(amount) FROM coin_transactions WHERE user_id = ?",
				Long.class, userId);
		assertThat(ledgerSum).isEqualTo(this.coins.balanceOf(userId));
		assertThat(this.jdbc.queryForObject(
				"SELECT balance_after FROM coin_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1", Long.class,
				userId))
			.isEqualTo(this.coins.balanceOf(userId))
			.isEqualTo(195L);
	}

	// --- API -----------------------------------------------------------------------------------------

	@Test
	void aPlayerSeesTheirCoinsAndTransactionsNewestFirst() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		Long userId = Players.userId(this.mockMvc, session);
		credit(userId, 300);
		this.coins.debit(userId, CoinTransactionType.SHOP_PURCHASE, 100, CoinReference.of("PURCHASE", 9),
				"Bought a pack");

		this.mockMvc.perform(get("/api/users/me/coins").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.balance").value(200))
			.andExpect(jsonPath("$.earned").value(300));
		this.mockMvc.perform(get("/api/users/me/transactions").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.entries[*].amount", contains(-100, 300)))
			.andExpect(jsonPath("$.entries[0].type").value("SHOP_PURCHASE"))
			.andExpect(jsonPath("$.entries[0].description").value("Bought a pack"))
			.andExpect(jsonPath("$.entries[0].balanceAfter").value(200))
			.andExpect(jsonPath("$.totalEntries").value(2))
			.andExpect(jsonPath("$.totalPages").value(1));
	}

	@Test
	void coinsAreOnlyForSignedInPlayers() throws Exception {
		this.mockMvc.perform(get("/api/users/me/coins")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/users/me/transactions")).andExpect(status().isUnauthorized());
	}

	@Test
	void transactionPagesAreBounded() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);

		this.mockMvc.perform(get("/api/users/me/transactions?size=51").session(session))
			.andExpect(status().isBadRequest());
		this.mockMvc.perform(get("/api/users/me/transactions?page=-1").session(session))
			.andExpect(status().isBadRequest());
	}

	private Long newPlayer() throws Exception {
		return Players.userId(this.mockMvc, Players.register(this.mockMvc));
	}

	private void credit(Long userId, int amount) {
		this.coins.credit(userId, CoinTransactionType.ADMIN_GRANT, amount,
				CoinReference.of("TEST", java.util.UUID.randomUUID()), "Starting coins");
	}

	private List<Integer> ledgerOf(Long userId) {
		return this.jdbc.queryForList("SELECT amount FROM coin_transactions WHERE user_id = ? ORDER BY id",
				Integer.class, userId);
	}

	private static <T> List<T> runAtOnce(List<Callable<T>> tasks) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
		try {
			List<T> results = new ArrayList<>();
			for (Future<T> future : pool.invokeAll(tasks)) {
				results.add(future.get());
			}
			return results;
		}
		finally {
			pool.shutdown();
		}
	}

}
