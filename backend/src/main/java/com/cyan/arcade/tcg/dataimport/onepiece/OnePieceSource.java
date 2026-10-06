package com.cyan.arcade.tcg.dataimport.onepiece;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgSource;
import com.cyan.arcade.tcg.dataimport.TcgSourceProperties;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgCard;
import com.cyan.arcade.tcg.dataimport.onepiece.OptcgApiClient.OptcgSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/** The One Piece Card Game, read from OPTCG API. Which sets, and how packs of them are made up, is in its configuration. */
@Component
class OnePieceSource implements TcgSource {

	private static final Logger log = LoggerFactory.getLogger(OnePieceSource.class);

	private final OptcgApiClient client;

	private final SourceConfig config;

	private final String url;

	@Autowired
	OnePieceSource(TcgSourceProperties properties, JsonMapper json, ResourceLoader resources) {
		this(new OptcgApiClient(new SourceHttp(SourceHttp.clientFor(properties.onePiece().url()).build(), json,
				Duration.ofSeconds(2)), json),
				SourceConfig.load(resources.getResource(properties.onePiece().config()), json),
				properties.onePiece().url().toString());
	}

	OnePieceSource(OptcgApiClient client, SourceConfig config, String url) {
		this.client = client;
		this.config = config;
		this.url = url;
	}

	@Override
	public String id() {
		return "one-piece";
	}

	@Override
	public String description() {
		return "OPTCG API (" + this.url + ")";
	}

	@Override
	public TcgDataset fetch() {
		List<OptcgSet> sets = this.client.sets();
		Map<String, List<OptcgCard>> cards = new LinkedHashMap<>();
		for (SetChoice choice : this.config.sets()) {
			List<OptcgCard> ofSet = this.client.cardsOf(choice.id());
			log.info("Fetched One Piece set {}: {} cards", choice.id(), ofSet.size());
			cards.put(choice.id(), ofSet);
		}
		return OnePieceDatasetMapper.map(this.config, sets, cards);
	}

}
