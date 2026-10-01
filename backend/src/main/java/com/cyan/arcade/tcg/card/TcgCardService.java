package com.cyan.arcade.tcg.card;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.cyan.arcade.tcg.set.TcgSetService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TcgCardService {

	private final TcgCardStore cards;

	private final TcgSetService sets;

	TcgCardService(TcgCardStore cards, TcgSetService sets) {
		this.cards = cards;
		this.sets = sets;
	}

	/** Every card of a set, in the order of their numbers. Throws when there is no such set. */
	public List<CardResponse> cardsOfSet(Long setId) {
		this.sets.get(setId);
		return this.cards.findBySet(setId);
	}

	/** Looks several cards up at once, keyed by id. */
	public Map<Long, CardResponse> cardsById(Collection<Long> ids) {
		return this.cards.findByIds(ids).stream().collect(Collectors.toMap(CardResponse::id, Function.identity()));
	}

}
