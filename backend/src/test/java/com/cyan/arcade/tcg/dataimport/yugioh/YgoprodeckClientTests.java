package com.cyan.arcade.tcg.dataimport.yugioh;

import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoCard;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** The YGOPRODeck client against recorded answers: no request leaves the test. */
class YgoprodeckClientTests {

	private static final String URL = "https://ygoprodeck.test/api/v7";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private MockRestServiceServer server;

	private SourceHttp http;

	private final AtomicLong clock = new AtomicLong(1_000_000_000L);

	private final List<Duration> pauses = new ArrayList<>();

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		this.server = MockRestServiceServer.bindTo(builder).build();
		this.http = new SourceHttp(builder.build(), JSON, Duration.ZERO);
	}

	private YgoprodeckClient client() {
		return new YgoprodeckClient(this.http, JSON, Duration.ofMillis(250), this.clock::get, (pause) -> {
			this.pauses.add(pause);
			this.clock.addAndGet(pause.toNanos());
		});
	}

	@Test
	void readsTheListOfSetsOnce() {
		this.server.expect(ExpectedCount.once(), requestTo(URL + "/cardsets.php"))
			.andExpect(method(org.springframework.http.HttpMethod.GET))
			.andRespond(withSuccess(fixture("cardsets.json"), MediaType.APPLICATION_JSON));
		YgoprodeckClient client = client();

		List<YgoSet> sets = client.sets();

		assertThat(sets).extracting(YgoSet::name, YgoSet::code)
			.contains(org.assertj.core.groups.Tuple.tuple("Beyond the Brave", "BETB"));
		assertThat(sets.get(0).cards()).isEqualTo(100);
		assertThat(sets.get(0).tcgDate()).isEqualTo("2026-10-08");
		assertThat(client.sets()).isSameAs(sets);
		this.server.verify();
	}

	@Test
	void readsTheCardsOfASetByItsEncodedNameOncePerSet() {
		this.server.expect(ExpectedCount.once(), requestTo(URL + "/cardinfo.php?cardset=Beyond%20the%20Brave"))
			.andRespond(withSuccess(fixture("cardinfo-beyond-the-brave.json"), MediaType.APPLICATION_JSON));
		this.server.expect(ExpectedCount.once(), requestTo(URL + "/cardinfo.php?cardset=Duelist%20Pack%3A%20Rivals%20%26%20Friends"))
			.andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
		YgoprodeckClient client = client();

		List<YgoCard> cards = client.cardsOf("Beyond the Brave");

		assertThat(cards).hasSize(7);
		YgoCard arsMagna = cards.stream().filter((card) -> card.id() == 36270527L).findFirst().orElseThrow();
		assertThat(arsMagna.name()).isEqualTo("Ars Magna the Finite and the Infinite");
		assertThat(arsMagna.printings()).hasSize(2);
		assertThat(client.cardsOf("Beyond the Brave")).isSameAs(cards);
		// A name with "&" or ":" stays one value instead of becoming more of the query.
		assertThat(client.cardsOf("Duelist Pack: Rivals & Friends")).isEmpty();
		this.server.verify();
	}

	@Test
	void readsTheProvidersDatabaseVersion() {
		this.server.expect(requestTo(URL + "/checkDBVer.php"))
			.andRespond(withSuccess(fixture("checkdbver.json"), MediaType.APPLICATION_JSON));

		assertThat(client().databaseVersion()).isEqualTo("147.74");
	}

	@Test
	void keepsRequestsAQuarterOfASecondApart() {
		this.server.expect(requestTo(URL + "/cardsets.php"))
			.andRespond(withSuccess(fixture("cardsets.json"), MediaType.APPLICATION_JSON));
		this.server.expect(requestTo(URL + "/cardinfo.php?cardset=Beyond%20the%20Brave"))
			.andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
		this.server.expect(requestTo(URL + "/checkDBVer.php"))
			.andRespond(withSuccess(fixture("checkdbver.json"), MediaType.APPLICATION_JSON));
		YgoprodeckClient client = client();

		client.sets();
		this.clock.addAndGet(Duration.ofMillis(100).toNanos());
		client.cardsOf("Beyond the Brave");
		this.clock.addAndGet(Duration.ofMillis(400).toNanos());
		client.databaseVersion();

		// The first request goes at once, the second waits out the rest of its 250 ms, the third
		// came late enough not to wait.
		assertThat(this.pauses).containsExactly(Duration.ofMillis(150));
	}

	@Test
	void anAnswerThatIsNotJsonOrHasNoCardDataIsAnError() {
		this.server.expect(requestTo(URL + "/cardsets.php"))
			.andRespond(withSuccess("<html>maintenance</html>", MediaType.TEXT_HTML));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().sets())
			.withMessageContaining("not JSON");

		this.server.reset();
		this.server.expect(requestTo(URL + "/cardinfo.php?cardset=Beyond%20the%20Brave"))
			.andRespond(withSuccess("{\"error\":\"No card matching your query was found in the database.\"}",
					MediaType.APPLICATION_JSON));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().cardsOf("Beyond the Brave"))
			.withMessageContaining("without card data");

		this.server.reset();
		this.server.expect(requestTo(URL + "/cardsets.php"))
			.andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().sets())
			.withMessageContaining("other than a list");

		this.server.reset();
		this.server.expect(requestTo(URL + "/cardinfo.php?cardset=Beyond%20the%20Brave"))
			.andRespond(withSuccess("{\"data\":[{\"id\":\"not a passcode\"}]}", MediaType.APPLICATION_JSON));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().cardsOf("Beyond the Brave"))
			.withMessageContaining("cannot read");

		this.server.reset();
		this.server.expect(requestTo(URL + "/checkDBVer.php")).andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().databaseVersion())
			.withMessageContaining("without a database version");
	}

	@Test
	void aRefusedRequestIsNotRetried() {
		this.server.expect(ExpectedCount.once(), requestTo(URL + "/cardsets.php"))
			.andRespond(withStatus(HttpStatus.BAD_REQUEST));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().sets())
			.withMessageContaining("refused");
		this.server.verify();
	}

	@Test
	void aProviderThatKeepsFailingOrTimingOutIsGivenUpOn() {
		this.server.expect(ExpectedCount.times(4), requestTo(URL + "/cardsets.php"))
			.andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().sets());
		this.server.verify();

		this.server.reset();
		this.server.expect(ExpectedCount.times(4), requestTo(URL + "/cardsets.php")).andRespond((request) -> {
			throw new SocketTimeoutException("Read timed out");
		});
		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> client().sets());
		this.server.verify();
	}

	@Test
	void aFailureThatPassesIsRetried() {
		this.server.expect(requestTo(URL + "/cardsets.php")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
		this.server.expect(requestTo(URL + "/cardsets.php"))
			.andRespond(withSuccess(fixture("cardsets.json"), MediaType.APPLICATION_JSON));

		assertThat(client().sets()).hasSize(5);
		this.server.verify();
	}

	private static String fixture(String file) {
		return YugiohPrintingMapperTests.fixture(file);
	}

}
