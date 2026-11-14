package com.cyan.arcade.tcg.dataimport.yugioh;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.dataimport.SetCheck;
import com.cyan.arcade.tcg.dataimport.SourceFetch;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgSource;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoCard;
import com.cyan.arcade.tcg.dataimport.yugioh.YgoprodeckClient.YgoSet;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.Printing;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.SetPrintings;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohConfig.PilotSet;

/**
 * The Yu-Gi-Oh! Trading Card Game, read from YGOPRODeck: a pilot. It only exists when
 * {@code app.tcg.pilots.yugioh.enabled} is set (see {@link YugiohPilotConfiguration}).
 *
 * <p>What it imports is a hidden pilot catalog:
 * <ul>
 * <li>One card per printing, its id the printing's ({@code betb:BETB-EN018:ultra-rare}), its number
 * the printed code, its metadata the card's text, for the arcade's text cards.
 * <li>No image: the artwork is Konami's and YGOPRODeck forbids hotlinking it, so the game says its
 * cards come without one ({@code cardImagesOptional}).
 * <li>An optional disabled pack with explicitly simulated arcade odds, never official pull rates.
 * <li>The game starts hidden: no page or API lists it until it is activated in the database on
 * purpose, so a pilot import never puts Yu-Gi-Oh! in front of players.
 * </ul>
 */
class YugiohSource implements TcgSource {

	private final YgoprodeckClient client;

	private final YugiohConfig config;

	private final String url;

	YugiohSource(YgoprodeckClient client, YugiohConfig config, String url) {
		this.client = client;
		this.config = config;
		this.url = url;
	}

	@Override
	public String id() {
		return "yugioh";
	}

	@Override
	public String description() {
		return "YGOPRODeck (" + this.url + "), pilot";
	}

	@Override
	public TcgDataset fetch() {
		return fetchChecked().dataset();
	}

	@Override
	public SourceFetch fetchChecked() {
		YugiohCatalog catalog = catalog();
		return new SourceFetch(datasetOf(this.config, catalog),
				catalog.sets().stream().map(YugiohSource::checkOf).toList());
	}

	/** The configured sets' printings, asking the provider only for the sets it has. */
	YugiohCatalog catalog() {
		List<YgoSet> listed = this.client.sets();
		Set<String> names = listed.stream().map(YgoSet::name).collect(Collectors.toSet());
		Map<String, List<YgoCard>> cards = new LinkedHashMap<>();
		for (PilotSet set : this.config.sets()) {
			if (names.contains(set.name())) {
				cards.put(set.name(), this.client.cardsOf(set.name()));
			}
		}
		return YugiohPrintingMapper.map(this.config, listed, cards);
	}

	/**
	 * The sets that have printings, as a dataset in the configuration's order; {@code null}
	 * when none has. Sets held back (not at the source, or empty) are left out and left alone.
	 */
	static TcgDataset datasetOf(YugiohConfig config, YugiohCatalog catalog) {
		List<TcgDataset.CardSet> sets = catalog.sets()
			.stream()
			.filter((set) -> set.status() == SetCheck.Status.IMPORTABLE && !set.printings().isEmpty())
			.map((set) -> cardSetOf(config, set))
			.toList();
		if (sets.isEmpty()) {
			return null;
		}
		TcgDataset.Game game = new TcgDataset.Game(config.game().slug(), config.game().name(),
				config.game().description(), null, null, config.game().accentColor(), config.game().attribution(), true,
				true);
		List<TcgDataset.Rarity> rarities = config.rarities()
			.stream()
			.map((rule) -> new TcgDataset.Rarity(rule.code(), rule.name(), rule.tier()))
			.toList();
		return new TcgDataset(game, rarities, sets);
	}

	private static TcgDataset.CardSet cardSetOf(YugiohConfig config, SetPrintings set) {
		List<TcgDataset.Card> cards = set.printings().stream().map(YugiohSource::cardOf).toList();
		TcgDataset.Pack configured = config.sets().stream().filter((pilot) -> pilot.code().equals(set.code()))
			.findFirst().orElseThrow().pack();
		// Safety belongs to the source too: a custom configuration cannot activate a pilot pack or add art.
		List<TcgDataset.Pack> packs = configured == null ? List.of() : List.of(new TcgDataset.Pack(configured.code(),
				configured.name(), configured.description(), null, configured.oddsNote(), configured.slots(),
				configured.cards(), false));
		return new TcgDataset.CardSet(set.code(), null, set.sourceName(), "", null, null, null, set.releasedOn(), cards,
				packs);
	}

	private static TcgDataset.Card cardOf(Printing printing) {
		return new TcgDataset.Card(printing.externalId(), printing.printingCode(), printing.name(), printing.rarity(),
				null, null, printing.metadata());
	}

	/** Every card of a set it imports is one without an image, by design: the report says so. */
	private static SetCheck checkOf(SetPrintings set) {
		return new SetCheck(set.code(), set.sourceName(), set.status(), set.listed(), set.printings().size(),
				set.printings().size(), set.excluded(), set.unknownRarities(), 0, 0);
	}

}
