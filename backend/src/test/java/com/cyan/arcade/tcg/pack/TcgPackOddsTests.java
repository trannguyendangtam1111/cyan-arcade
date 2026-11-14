package com.cyan.arcade.tcg.pack;

import java.util.List;
import java.util.Optional;

import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.dataimport.TcgDataset;
import com.cyan.arcade.tcg.pack.TcgPackStore.OddsRow;
import com.cyan.arcade.tcg.pack.TcgPackStore.PackRow;
import com.cyan.arcade.tcg.set.TcgSetService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TcgPackOddsTests {

	@Test
	void existingDatasetsAndConstructorsStillCreateActivePacks() {
		var json = tools.jackson.databind.json.JsonMapper.builder().build();
		TcgDataset.Pack pack = json.readValue("""
			{"code":"booster","name":"Booster","slots":[{"count":1,"odds":{"common":100}}]}
			""", TcgDataset.Pack.class);
		assertThat(pack.initiallyActive()).isTrue();
		assertThat(new TcgDataset.Pack("booster", "Booster", "", null, pack.slots(), null).initiallyActive()).isTrue();
	}

	@Test
	void fineOddsAreVisibleRatherThanRoundedToZero() {
		assertThat(percentages(8000, 1400, 500, 99, 1)).containsExactly(80.0, 14.0, 5.0, 0.99, 0.01);
	}

	@Test
	void ordinarySlotsKeepTheirExistingRounding() {
		assertThat(percentages(2, 1)).containsExactly(66.7, 33.3);
	}

	private List<Double> percentages(int... weights) {
		TcgPackStore store = mock(TcgPackStore.class);
		when(store.findById(8L)).thenReturn(Optional.of(new PackRow(8L, "test", "Test", "", null, null, null,
				null, null, true, null, null, 127)));
		List<OddsRow> rows = java.util.stream.IntStream.range(0, weights.length)
			.mapToObj((i) -> new OddsRow(8L, 1, (long) i + 1, new Rarity("r" + i, "Rarity " + i, 1), weights[i])).toList();
		when(store.findOdds(List.of(8L))).thenReturn(rows);
		return new TcgPackService(store, mock(TcgSetService.class)).getAvailable(8L).slots().getFirst().odds()
			.stream().map(PackResponse.Chance::percent).toList();
	}
}
