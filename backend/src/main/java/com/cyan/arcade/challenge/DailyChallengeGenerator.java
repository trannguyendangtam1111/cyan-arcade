package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import com.cyan.arcade.challenge.ChallengeTemplates.Activity;
import com.cyan.arcade.game.GameResponse;
import com.cyan.arcade.game.GameService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates the challenges of a day: one for every game in the catalog, and one for every activity. */
@Service
class DailyChallengeGenerator {

	private final GameService games;

	private final ChallengeTemplates templates;

	private final DailyChallengeStore store;

	private final Clock clock;

	DailyChallengeGenerator(GameService games, ChallengeTemplates templates, DailyChallengeStore store, Clock clock) {
		this.games = games;
		this.templates = templates;
		this.store = store;
		this.clock = clock;
	}

	/**
	 * Makes sure every active game and every activity has a challenge on the given day. Safe to call
	 * any number of times, and by several instances at once: one that already has its challenge
	 * keeps it.
	 * @return how many challenges were created
	 */
	@Transactional
	public int generateFor(LocalDate date) {
		List<GameResponse> catalog = this.games.listActiveGames();
		int created = 0;
		for (int position = 0; position < catalog.size(); position++) {
			GameResponse game = catalog.get(position);
			ChallengeTemplate template = this.templates.pick(game.slug(), position, date);
			if (this.store.insertIfAbsent(date, game.id(), template, template.describe(game.name()),
					this.clock.instant())) {
				created++;
			}
		}
		for (Activity activity : this.templates.activities()) {
			if (this.store.insertIfAbsent(date, activity, this.templates.pick(activity, date), this.clock.instant())) {
				created++;
			}
		}
		return created;
	}

}
