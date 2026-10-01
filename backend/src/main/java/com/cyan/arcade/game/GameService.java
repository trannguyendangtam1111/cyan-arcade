package com.cyan.arcade.game;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.common.error.NotFoundException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read access to the game catalog. Inactive games are invisible to every caller. */
@Service
@Transactional(readOnly = true)
public class GameService {

	private final GameRepository games;

	GameService(GameRepository games) {
		this.games = games;
	}

	public List<GameResponse> listActiveGames() {
		return this.games.findByActiveTrueOrderByDisplayOrderAscNameAsc().stream().map(GameResponse::from).toList();
	}

	public GameResponse getActiveGame(String slug) {
		return this.games.findBySlugAndActiveTrue(slug)
			.map(GameResponse::from)
			.orElseThrow(() -> new NotFoundException("Game", slug));
	}

	/** The game a new run may be started for. Throws when the slug is unknown or the game is inactive. */
	public GameInfo requireActiveGame(String slug) {
		return this.games.findBySlugAndActiveTrue(slug)
			.map(GameInfo::from)
			.orElseThrow(() -> new NotFoundException("Game", slug));
	}

	/** Looks several games up at once, keyed by id, active or not. */
	public Map<Long, GameInfo> gamesById(Collection<Long> ids) {
		if (ids.isEmpty()) {
			return Map.of();
		}
		return this.games.findByIdIn(ids)
			.stream()
			.map(GameInfo::from)
			.collect(Collectors.toMap(GameInfo::id, Function.identity()));
	}

	/** Looks a game up by id, active or not: a run may finish after its game was taken off the catalog. */
	public GameInfo requireGame(Long id) {
		return this.games.findById(id).map(GameInfo::from).orElseThrow(() -> new NotFoundException("Game", id));
	}

}
