package com.cyan.arcade.tcg.dataimport.onepiece;

import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads the One Piece Card Game (English) from OPTCG API (https://optcgapi.com): a free public API
 * run by a fan, with card data and an image for every card, alternate arts included. One request
 * for the list of sets and one per set; its author asks for moderate use, which an import is.
 */
class OptcgApiClient {

	/** A booster set: {@code OP-01 Romance Dawn}. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record OptcgSet(@JsonProperty("set_id") String id, @JsonProperty("set_name") String name) {
	}

	/**
	 * One card of a set as OPTCG API lists it.
	 *
	 * @param number the number printed on the card ({@code OP01-120})
	 * @param imageId the official id of this print ({@code OP01-120_p1} for an alternate art)
	 * @param name the name, sometimes followed by what kind of print it is: "Shanks (Parallel)"
	 * @param imageUrl the card's image, hosted by OPTCG API
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record OptcgCard(@JsonProperty("card_set_id") String number, @JsonProperty("card_image_id") String imageId,
			@JsonProperty("card_name") String name, String rarity, @JsonProperty("set_id") String setId,
			@JsonProperty("card_type") String category, @JsonProperty("card_color") String color,
			@JsonProperty("card_cost") String cost, @JsonProperty("card_power") String power,
			@JsonProperty("counter_amount") Integer counter, String attribute,
			@JsonProperty("sub_types") String types, @JsonProperty("card_text") String text,
			@JsonProperty("card_image") String imageUrl) {
	}

	private final SourceHttp http;

	private final JsonMapper json;

	OptcgApiClient(SourceHttp http, JsonMapper json) {
		this.http = http;
		this.json = json;
	}

	List<OptcgSet> sets() {
		return listOf(this.http.get("/allSets/"), OptcgSet.class);
	}

	List<OptcgCard> cardsOf(String setId) {
		return listOf(this.http.get("/sets/" + setId + "/"), OptcgCard.class);
	}

	private <T> List<T> listOf(JsonNode array, Class<T> type) {
		List<T> values = new ArrayList<>();
		array.forEach((value) -> values.add(this.json.treeToValue(value, type)));
		return values;
	}

}
