package com.cyan.arcade.tcg.game;

import java.util.List;
import java.util.Map;

import com.cyan.arcade.common.error.NotFoundException;
import com.cyan.arcade.tcg.game.TcgGameStore.GameRow;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The trading card games the arcade carries. Inactive ones are invisible to every caller. */
@Service
@Transactional(readOnly = true)
public class TcgGameService {

	private final TcgGameStore games;

	TcgGameService(TcgGameStore games) {
		this.games = games;
	}

	public List<TcgGameResponse> listActive() {
		List<GameRow> rows = this.games.findActive();
		Map<Long, List<Rarity>> rarities = this.games.raritiesOf(rows.stream().map(GameRow::id).toList());
		return rows.stream()
			.map((game) -> new TcgGameResponse(game.id(), game.slug(), game.name(), game.description(),
					game.imageUrl(), game.cardBackUrl(), game.accentColor(), game.attribution(),
					rarities.getOrDefault(game.id(), List.of()), game.setCount(), game.cardCount()))
			.toList();
	}

	public TcgGameResponse getActive(String slug) {
		return listActive().stream()
			.filter((game) -> game.slug().equals(slug))
			.findFirst()
			.orElseThrow(() -> new NotFoundException("Card game", slug));
	}

}
