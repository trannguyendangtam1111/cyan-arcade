package com.cyan.arcade.tcg.dataimport.yugioh;

import java.util.Map;

import com.cyan.arcade.tcg.dataimport.SourceConfig.GameInfo;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;

/** Recorded 2026-11-14: all 100 cards / 127 EN printings; no image or price fields. */
public final class YugiohPackFixture {

	private YugiohPackFixture() {
	}

	public static TcgDataset dataset(String slug) {
		YugiohConfig shipped = YugiohConfig.load(new ClassPathResource("tcg/pilots/yugioh.json"),
				JsonMapper.builder().build());
		GameInfo game = shipped.game();
		YugiohConfig config = new YugiohConfig(new GameInfo(slug, game.name(), game.description(), game.accentColor(),
				game.attribution(), null), shipped.region(), shipped.rarities(), shipped.excludedRarities(), shipped.sets());
		return YugiohSource.datasetOf(config, YugiohPrintingMapper.map(config, YugiohPrintingMapperTests.sets(),
				Map.of("Beyond the Brave", YugiohPrintingMapperTests.cards("cardinfo-beyond-the-brave-full.json"))));
	}

}
