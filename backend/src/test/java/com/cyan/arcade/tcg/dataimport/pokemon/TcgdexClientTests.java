package com.cyan.arcade.tcg.dataimport.pokemon;

import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.cyan.arcade.tcg.dataimport.pokemon.TcgdexClient.TcgdexCard;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Talking to TCGdex's GraphQL API, against a stand-in for it. */
class TcgdexClientTests {

	private static final String URL = "https://tcgdex.example/v2/graphql";

	private final JsonMapper json = JsonMapper.builder().build();

	private MockRestServiceServer server;

	private TcgdexClient client;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		this.server = MockRestServiceServer.bindTo(builder).build();
		this.client = new TcgdexClient(new SourceHttp(builder.build(), this.json, Duration.ZERO), this.json);
	}

	@Test
	void readsASet() {
		this.server.expect(requestTo(URL))
			.andExpect(method(HttpMethod.POST))
			.andExpect(jsonPath("$.variables.id").value("sv03.5"))
			.andRespond(withSuccess("""
					{"data":{"set":{"id":"sv03.5","name":"151","releaseDate":"2023-09-22",
					"logo":"https://assets.tcgdex.net/en/sv/sv03.5/logo","serie":{"id":"sv","name":"Scarlet & Violet"}}}}
					""", MediaType.APPLICATION_JSON));

		TcgdexClient.TcgdexSet set = this.client.set("sv03.5");

		assertThat(set.name()).isEqualTo("151");
		assertThat(set.releaseDate()).isEqualTo("2023-09-22");
		assertThat(set.serie().name()).isEqualTo("Scarlet & Violet");
		this.server.verify();
	}

	@Test
	void readsTheCardsOfASetAndOnlyThatSet() {
		this.server.expect(requestTo(URL))
			.andExpect(jsonPath("$.variables.prefix").value("sv01-"))
			.andExpect(jsonPath("$.variables.page").value(1))
			.andRespond(withSuccess("""
					{"data":{"cards":[
					  {"id":"sv01-001","localId":"001","name":"Pineco","rarity":"Common",
					   "image":"https://assets.tcgdex.net/en/sv/sv01/001","category":"Pokemon","hp":60,"types":["Grass"],
					   "stage":"Basic","illustrator":"Shigenori Negishi","set":{"id":"sv01"},"somethingNew":true},
					  {"id":"xsv01-001","localId":"001","name":"Elsewhere","rarity":"Common","image":null,"set":{"id":"xsv01"}}
					]}}
					""", MediaType.APPLICATION_JSON));

		List<TcgdexCard> cards = this.client.cardsOf("sv01");

		assertThat(cards).extracting(TcgdexCard::id).containsExactly("sv01-001");
		assertThat(cards.get(0).types()).containsExactly("Grass");
		assertThat(cards.get(0).hp()).isEqualTo(60);
		this.server.verify();
	}

	@Test
	void readsMorePagesWhenASetDoesNotFitInOne() {
		this.server.expect(jsonPath("$.variables.page").value(1))
			.andRespond(withSuccess(page(1, TcgdexClient.PAGE_SIZE), MediaType.APPLICATION_JSON));
		this.server.expect(jsonPath("$.variables.page").value(2))
			.andRespond(withSuccess(page(TcgdexClient.PAGE_SIZE + 1, 3), MediaType.APPLICATION_JSON));

		assertThat(this.client.cardsOf("big")).hasSize(TcgdexClient.PAGE_SIZE + 3);
		this.server.verify();
	}

	@Test
	void anErrorInTheAnswerIsReported() {
		this.server.expect(requestTo(URL))
			.andRespond(withSuccess("{\"errors\":[{\"message\":\"Cannot query field\"}]}", MediaType.APPLICATION_JSON));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> this.client.set("sv01"))
			.withMessageContaining("Cannot query field");
	}

	@Test
	void anUnknownSetIsReported() {
		this.server.expect(requestTo(URL)).andRespond(withSuccess("{\"data\":{\"set\":null}}", MediaType.APPLICATION_JSON));

		assertThatExceptionOfType(TcgSourceException.class).isThrownBy(() -> this.client.set("sv99"))
			.withMessageContaining("no set 'sv99'");
	}

	private static String page(int first, int count) {
		return IntStream.range(first, first + count)
			.mapToObj((number) -> """
					{"id":"big-%d","localId":"%d","name":"Card %d","rarity":"Common","image":"/big/%d","set":{"id":"big"}}
					""".formatted(number, number, number, number))
			.collect(Collectors.joining(",", "{\"data\":{\"cards\":[", "]}}"));
	}

}
