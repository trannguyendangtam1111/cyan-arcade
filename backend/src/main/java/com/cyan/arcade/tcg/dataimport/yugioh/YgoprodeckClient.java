package com.cyan.arcade.tcg.dataimport.yugioh;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;

import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgSourceException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads Yu-Gi-Oh! TCG sets and card printings from YGOPRODeck's API v7
 * (https://ygoprodeck.com/api-guide/): {@code cardsets.php} for the list of sets, one
 * {@code cardinfo.php?cardset=} per set for its cards and their printings, and
 * {@code checkDBVer.php} for the version of the provider's database.
 *
 * <ul>
 * <li>Card data only. The answers carry image links, which are never read: YGOPRODeck forbids
 * hotlinking its images, and the artwork is Konami's.
 * <li>Gentle: at most one request per {@link #MIN_INTERVAL} (the provider blocks an address that
 * goes over 20 requests a second, for an hour), and each answer is asked for once per client, since
 * the provider asks for its data to be stored rather than fetched again.
 * <li>What it logs is counts and set names, never an answer's contents.
 * </ul>
 */
class YgoprodeckClient {

	private static final Logger log = LoggerFactory.getLogger(YgoprodeckClient.class);

	/** Four requests a second at most: well under the provider's limit of 20. */
	static final Duration MIN_INTERVAL = Duration.ofMillis(250);

	/** A set as {@code cardsets.php} lists it. Its code is a prefix several sets may share. */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record YgoSet(@JsonProperty("set_name") String name, @JsonProperty("set_code") String code,
			@JsonProperty("num_of_cards") Integer cards, @JsonProperty("tcg_date") String tcgDate) {
	}

	/**
	 * A card as {@code cardinfo.php} gives it: the card itself and every printing of it, in any set.
	 * Its images are deliberately not part of it.
	 *
	 * @param id the card's passcode, the same for all its printings
	 * @param level a monster's level, or an Xyz monster's rank
	 * @param linkval a Link monster's link rating
	 * @param scale a Pendulum monster's scale
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record YgoCard(Long id, String name, String type, String frameType, String desc, String race, Integer atk,
			Integer def, Integer level, String attribute, Integer linkval, Integer scale, String archetype,
			@JsonProperty("card_sets") List<YgoPrinting> printings) {

		YgoCard {
			printings = (printings != null) ? printings : List.of();
		}

	}

	/**
	 * One printing of a card: which set, under which code, in which rarity.
	 * @param code the code printed on the card ({@code BETB-EN018}); several rarities can share it
	 * @param rarityCode the provider's abbreviation, sometimes empty: not relied on
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	record YgoPrinting(@JsonProperty("set_name") String setName, @JsonProperty("set_code") String code,
			@JsonProperty("set_rarity") String rarity, @JsonProperty("set_rarity_code") String rarityCode) {
	}

	/** Waits; a test can record instead. */
	interface Pause {

		void sleep(Duration duration);

	}

	private final SourceHttp http;

	private final JsonMapper json;

	private final Duration minInterval;

	private final LongSupplier nanoTime;

	private final Pause pause;

	private long nextRequestAt = Long.MIN_VALUE;

	private List<YgoSet> sets;

	private final Map<String, List<YgoCard>> cardsBySet = new HashMap<>();

	YgoprodeckClient(SourceHttp http, JsonMapper json) {
		this(http, json, MIN_INTERVAL, System::nanoTime, YgoprodeckClient::sleep);
	}

	YgoprodeckClient(SourceHttp http, JsonMapper json, Duration minInterval, LongSupplier nanoTime, Pause pause) {
		this.http = http;
		this.json = json;
		this.minInterval = minInterval;
		this.nanoTime = nanoTime;
		this.pause = pause;
	}

	/** Every set the provider knows, asked for once. */
	List<YgoSet> sets() {
		if (this.sets == null) {
			JsonNode answer = request("/cardsets.php", Map.of());
			if (!answer.isArray()) {
				throw new TcgSourceException("YGOPRODeck answered its list of sets with something other than a list");
			}
			this.sets = List.copyOf(listOf(answer, YgoSet.class, "its list of sets"));
			log.info("YGOPRODeck lists {} sets", this.sets.size());
		}
		return this.sets;
	}

	/**
	 * The cards with a printing in the set of this exact name, with all their printings (in this
	 * set and any other), asked for once per set.
	 */
	List<YgoCard> cardsOf(String setName) {
		List<YgoCard> cards = this.cardsBySet.get(setName);
		if (cards == null) {
			JsonNode data = request("/cardinfo.php?cardset={set}", Map.of("set", setName)).path("data");
			if (!data.isArray()) {
				throw new TcgSourceException("YGOPRODeck answered for the cards of set '%s' without card data".formatted(setName));
			}
			cards = List.copyOf(listOf(data, YgoCard.class, "the cards of set '%s'".formatted(setName)));
			this.cardsBySet.put(setName, cards);
			log.info("YGOPRODeck lists {} cards in set '{}'", cards.size(), setName);
		}
		return cards;
	}

	/** The version of the provider's database: it changes whenever a card is added or corrected. */
	String databaseVersion() {
		JsonNode version = request("/checkDBVer.php", Map.of()).path(0).path("database_version");
		if (!version.isString() || version.asString().isBlank()) {
			throw new TcgSourceException("YGOPRODeck answered without a database version");
		}
		return version.asString();
	}

	private JsonNode request(String uriTemplate, Map<String, ?> variables) {
		throttle();
		try {
			return this.http.get(uriTemplate, variables);
		}
		catch (JacksonException ex) {
			throw new TcgSourceException("YGOPRODeck answered %s with something that is not JSON".formatted(uriTemplate),
					ex);
		}
	}

	private <T> List<T> listOf(JsonNode array, Class<T> type, String what) {
		List<T> values = new ArrayList<>();
		try {
			array.forEach((value) -> values.add(this.json.treeToValue(value, type)));
		}
		catch (JacksonException ex) {
			throw new TcgSourceException("YGOPRODeck answered %s with entries it cannot read".formatted(what), ex);
		}
		return values;
	}

	/** Keeps requests at least {@link #minInterval} apart. */
	private synchronized void throttle() {
		long now = this.nanoTime.getAsLong();
		if (this.nextRequestAt != Long.MIN_VALUE && now < this.nextRequestAt) {
			this.pause.sleep(Duration.ofNanos(this.nextRequestAt - now));
			now = this.nextRequestAt;
		}
		this.nextRequestAt = now + this.minInterval.toNanos();
	}

	private static void sleep(Duration duration) {
		try {
			Thread.sleep(duration);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new TcgSourceException("Interrupted while waiting between requests to YGOPRODeck", ex);
		}
	}

}
