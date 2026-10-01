package com.cyan.arcade.tcg.opening;

import java.time.Clock;
import java.util.List;
import java.util.random.RandomGenerator;

import com.cyan.arcade.IntegrationTest;
import com.cyan.arcade.Players;
import com.cyan.arcade.tcg.TinyCardGame;
import com.cyan.arcade.tcg.card.TcgCardService;
import com.cyan.arcade.tcg.collection.CollectionService;
import com.cyan.arcade.tcg.dataimport.TcgDatasetImporter;
import com.cyan.arcade.tcg.opening.TcgOpeningConfig.OpeningProperties;
import com.cyan.arcade.tcg.pack.TcgPackService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * The daily pack limit switched off ({@code app.tcg.daily-pack-limit=0}). The test context runs
 * with a limit, so this builds the service a second time with the other setting.
 */
@IntegrationTest
class UnlimitedPacksTests {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private TcgDatasetImporter importer;

	@Autowired
	private TcgPackService packs;

	@Autowired
	private TcgCardService cards;

	@Autowired
	private CollectionService collections;

	@Autowired
	private PackOpeningStore store;

	@Autowired
	private RandomGenerator random;

	@Autowired
	private Clock clock;

	@Autowired
	private TransactionTemplate transaction;

	@Test
	void withoutALimitAPlayerCanKeepOpeningAndTheAllowanceSaysSo() throws Exception {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		Long single = TinyCardGame.packId(this.jdbc, "single");
		Long userId = registeredUserId();
		PackOpeningService unlimited = new PackOpeningService(this.packs, this.cards, this.collections, this.store,
				this.random, new OpeningProperties(0), this.clock);

		OpenPackResponse last = null;
		for (int pack = 0; pack < 8; pack++) {
			last = this.transaction.execute((status) -> unlimited.open(userId, single));
		}

		assertThat(last.allowance().dailyLimit()).isNull();
		assertThat(last.allowance().leftToday()).isNull();
		assertThat(last.allowance().openedToday()).isEqualTo(8);
		assertThat(last.allowance().resetsAt()).isAfter(this.clock.instant());
		assertThat(this.jdbc.queryForObject("SELECT quantity FROM tcg_user_cards WHERE user_id = ?", Integer.class,
				userId))
			.isEqualTo(8);
	}

	@Test
	void aNegativeLimitIsAConfigurationMistake() {
		assertThatIllegalArgumentException().isThrownBy(() -> new OpeningProperties(-1));
	}

	@Test
	void cardsCannotBeAddedToACollectionOutsideATransaction() throws Exception {
		this.importer.importDataset(TinyCardGame.dataset(), "test");
		Long userId = registeredUserId();
		Long card = TinyCardGame.cardId(this.jdbc, "L1");

		// The collection only grows as part of whatever hands the cards out, never by itself.
		assertThatExceptionOfType(IllegalTransactionStateException.class)
			.isThrownBy(() -> this.collections.add(userId, List.of(card), this.clock.instant()));
		assertThat(this.jdbc.queryForObject("SELECT count(*) FROM tcg_user_cards WHERE user_id = ?", Integer.class,
				userId))
			.isZero();
	}

	private Long registeredUserId() throws Exception {
		MockHttpSession session = Players.register(this.mockMvc);
		String body = this.mockMvc.perform(get("/api/auth/session").session(session))
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JsonPath.<Number>read(body, "$.user.id").longValue();
	}

}
