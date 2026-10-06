package com.cyan.arcade.tcg.dataimport.pokemon;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads Pokémon TCG sets and cards from the TCGdex GraphQL API (https://tcgdex.dev): a free,
 * open-source, community-run database. One request per set for its details and one per page of its
 * cards, rarities included.
 */
class TcgdexClient {

	/** Large enough that a set comes in one page; more pages are read if it does not. */
	static final int PAGE_SIZE = 500;

	private static final String SET_QUERY = """
			query ($id: ID!) {
			  set(id: $id) { id name releaseDate logo serie { id name } }
			}
			""";

	// TCGdex has no "cards of a set" filter in GraphQL; ids start with the set's id, so that is
	// what is asked for, and the answer is narrowed to the set itself.
	private static final String CARDS_QUERY = """
			query ($prefix: ID, $page: Int!, $size: Int!) {
			  cards(filters: { id: $prefix }, pagination: { page: $page, itemsPerPage: $size }) {
			    id localId name rarity image category hp types stage illustrator set { id }
			  }
			}
			""";

	@JsonIgnoreProperties(ignoreUnknown = true)
	record TcgdexSet(String id, String name, String releaseDate, String logo, Serie serie) {

		@JsonIgnoreProperties(ignoreUnknown = true)
		record Serie(String id, String name) {
		}

	}

	/** @param image where the card's pictures are; {@code /high.webp} or {@code /low.webp} is added */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record TcgdexCard(String id, String localId, String name, String rarity, String image, String category,
			Integer hp, List<String> types, String stage, String illustrator, SetId set) {

		@JsonIgnoreProperties(ignoreUnknown = true)
		record SetId(String id) {
		}

	}

	private final SourceHttp http;

	private final JsonMapper json;

	TcgdexClient(SourceHttp http, JsonMapper json) {
		this.http = http;
		this.json = json;
	}

	TcgdexSet set(String id) {
		JsonNode set = query(SET_QUERY, Map.of("id", id)).path("set");
		if (set.isMissingNode() || set.isNull()) {
			throw new TcgSourceException("TCGdex has no set '%s'".formatted(id));
		}
		return this.json.treeToValue(set, TcgdexSet.class);
	}

	List<TcgdexCard> cardsOf(String setId) {
		List<TcgdexCard> cards = new ArrayList<>();
		for (int page = 1;; page++) {
			JsonNode found = query(CARDS_QUERY, Map.of("prefix", setId + "-", "page", page, "size", PAGE_SIZE))
				.path("cards");
			List<TcgdexCard> batch = new ArrayList<>();
			found.forEach((card) -> batch.add(this.json.treeToValue(card, TcgdexCard.class)));
			batch.stream().filter((card) -> card.set() != null && setId.equals(card.set().id())).forEach(cards::add);
			if (batch.size() < PAGE_SIZE) {
				return cards;
			}
		}
	}

	private JsonNode query(String query, Map<String, Object> variables) {
		JsonNode answer = this.http.post("", Map.of("query", query, "variables", variables));
		JsonNode errors = answer.path("errors");
		if (errors.isArray() && !errors.isEmpty()) {
			throw new TcgSourceException("TCGdex refused a query: " + errors.get(0).path("message").asString());
		}
		return answer.path("data");
	}

}
