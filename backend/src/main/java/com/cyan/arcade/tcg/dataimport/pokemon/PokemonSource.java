package com.cyan.arcade.tcg.dataimport.pokemon;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import com.cyan.arcade.tcg.dataimport.SourceConfig;
import com.cyan.arcade.tcg.dataimport.SourceConfig.SetChoice;
import com.cyan.arcade.tcg.dataimport.SourceHttp;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.dataimport.TcgSource;
import com.cyan.arcade.tcg.dataimport.TcgSourceProperties;
import com.cyan.arcade.tcg.dataimport.pokemon.PokemonDatasetMapper.FetchedSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

/** The Pokémon Trading Card Game, read from TCGdex. Which sets, and how packs of them are made up, is in its configuration. */
@Component
class PokemonSource implements TcgSource {

	private static final Logger log = LoggerFactory.getLogger(PokemonSource.class);

	private final TcgdexClient client;

	private final SourceConfig config;

	private final String url;

	@Autowired
	PokemonSource(TcgSourceProperties properties, JsonMapper json, ResourceLoader resources) {
		this(new TcgdexClient(new SourceHttp(SourceHttp.clientFor(properties.pokemon().url()).build(), json,
				Duration.ofSeconds(2)), json),
				SourceConfig.load(resources.getResource(properties.pokemon().config()), json),
				properties.pokemon().url().toString());
	}

	PokemonSource(TcgdexClient client, SourceConfig config, String url) {
		this.client = client;
		this.config = config;
		this.url = url;
	}

	@Override
	public String id() {
		return "pokemon";
	}

	@Override
	public String description() {
		return "TCGdex (" + this.url + ")";
	}

	@Override
	public TcgDataset fetch() {
		List<FetchedSet> fetched = new ArrayList<>();
		for (SetChoice choice : this.config.sets()) {
			FetchedSet set = new FetchedSet(choice, this.client.set(choice.id()), this.client.cardsOf(choice.id()));
			log.info("Fetched Pokémon set {} ({}): {} cards", choice.id(), set.set().name(), set.cards().size());
			fetched.add(set);
		}
		return PokemonDatasetMapper.map(this.config, fetched);
	}

}
