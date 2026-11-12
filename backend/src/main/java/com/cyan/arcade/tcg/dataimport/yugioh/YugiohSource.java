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
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohCatalog.SetPrintings;
import com.cyan.arcade.tcg.dataimport.yugioh.YugiohConfig.PilotSet;

/**
 * The Yu-Gi-Oh! Trading Card Game, read from YGOPRODeck: a pilot. It only exists when
 * {@code app.tcg.pilots.yugioh.enabled} is set (see {@link YugiohPilotConfiguration}), and even then
 * it writes nothing: every set it reads is held back, with its counts in the import report, because
 * the arcade has no card pictures it may show for Yu-Gi-Oh! (YGOPRODeck forbids hotlinking, and the
 * artwork is Konami's). Turning printings into a dataset is a later step.
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

	/** Nothing yet: see {@link #fetchChecked()}. */
	@Override
	public TcgDataset fetch() {
		return fetchChecked().dataset();
	}

	@Override
	public SourceFetch fetchChecked() {
		return new SourceFetch(null, catalog().sets().stream().map(YugiohSource::checkOf).toList());
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
	 * A set that could be read is reported as waiting for images: none of its printings has a
	 * picture the arcade may use.
	 */
	private static SetCheck checkOf(SetPrintings set) {
		SetCheck.Status status = (set.status() == SetCheck.Status.IMPORTABLE) ? SetCheck.Status.PENDING_IMAGES
				: set.status();
		return new SetCheck(set.code(), set.sourceName(), status, set.listed(), set.printings().size(),
				set.printings().size(), set.excluded(), set.unknownRarities(), 0, 0);
	}

}
