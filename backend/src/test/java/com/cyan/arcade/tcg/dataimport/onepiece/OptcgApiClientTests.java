package com.cyan.arcade.tcg.dataimport.onepiece;

import java.time.Duration;
import java.util.List;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgCard;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** Reading OPTCG API, against a stand-in for it. The answers are recorded from the real one. */
class OptcgApiClientTests {

	private static final String URL = "https://optcg.example/api";

	private MockRestServiceServer server;

	private OptcgApiClient client;

	@BeforeEach
	void setUp() {
		JsonMapper json = JsonMapper.builder().build();
		RestClient.Builder builder = RestClient.builder().baseUrl(URL);
		this.server = MockRestServiceServer.bindTo(builder).build();
		this.client = new OptcgApiClient(new SourceHttp(builder.build(), json, Duration.ZERO), json);
	}

	@Test
	void readsTheSets() {
		this.server.expect(requestTo(URL + "/allSets/"))
			.andExpect(method(HttpMethod.GET))
			.andRespond(withSuccess("""
					[{"set_name":"Romance Dawn","set_id":"OP-01"},{"set_name":"The Azure Sea's Seven","set_id":"OP14-EB04"}]
					""", MediaType.APPLICATION_JSON));

		assertThat(this.client.sets()).containsExactly(new OptcgSet("OP-01", "Romance Dawn"),
				new OptcgSet("OP14-EB04", "The Azure Sea's Seven"));
		this.server.verify();
	}

	@Test
	void readsTheCardsOfASet() {
		this.server.expect(requestTo(URL + "/sets/OP-01/")).andRespond(withSuccess("""
				[{"inventory_price":0.69,"market_price":0.72,"card_name":"Perona","set_name":"Romance Dawn",
				  "card_text":"[On Play] Look at 5 cards from the top of your deck and place them at the top or bottom of the deck in any order.",
				  "set_id":"OP-01","rarity":"UC","card_set_id":"OP01-077","card_color":"Blue","card_type":"Character",
				  "life":null,"card_cost":"1","card_power":"2000","sub_types":"Thriller Bark Pirates","counter_amount":1000,
				  "attribute":"Special","date_scraped":"2026-09-30","card_image_id":"OP01-077",
				  "card_image":"https://optcgapi.com/media/static/Card_Images/OP01-077.jpg"}]
				""", MediaType.APPLICATION_JSON));

		List<OptcgCard> cards = this.client.cardsOf("OP-01");

		assertThat(cards).singleElement().satisfies((perona) -> {
			assertThat(perona.number()).isEqualTo("OP01-077");
			assertThat(perona.imageId()).isEqualTo("OP01-077");
			assertThat(perona.name()).isEqualTo("Perona");
			assertThat(perona.rarity()).isEqualTo("UC");
			assertThat(perona.cost()).isEqualTo("1");
			assertThat(perona.counter()).isEqualTo(1000);
			assertThat(perona.types()).isEqualTo("Thriller Bark Pirates");
			assertThat(perona.imageUrl()).isEqualTo("https://optcgapi.com/media/static/Card_Images/OP01-077.jpg");
		});
		this.server.verify();
	}

}
