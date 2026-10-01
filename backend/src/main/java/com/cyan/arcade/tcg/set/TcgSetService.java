package com.cyan.arcade.tcg.set;

import java.util.List;

import com.cyan.arcade.common.error.NotFoundException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TcgSetService {

	private final TcgSetStore sets;

	TcgSetService(TcgSetStore sets) {
		this.sets = sets;
	}

	/** @param gameSlug only the sets of this game, or {@code null} for every set */
	public List<TcgSetResponse> list(String gameSlug) {
		return (gameSlug != null) ? this.sets.findByGame(gameSlug) : this.sets.findAll();
	}

	public TcgSetResponse get(Long id) {
		return this.sets.findById(id).orElseThrow(() -> new NotFoundException("Card set", id));
	}

}
