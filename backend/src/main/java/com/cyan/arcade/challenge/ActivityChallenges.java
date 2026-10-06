package com.cyan.arcade.challenge;

import java.time.LocalDate;
import java.time.ZoneOffset;

import com.cyan.arcade.common.platform.PlayerActivity;
import com.cyan.arcade.progression.ProgressionService;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Completes the daily challenges that count an activity, such as "open 3 card packs". Every
 * {@link PlayerActivity} a module reports counts one towards today's challenge for it; reaching the
 * target completes it and pays its reward, once.
 *
 * <p>Runs in the transaction of the activity itself: the count, the completion and the reward are
 * saved with it, or not at all.
 */
@Component
class ActivityChallenges {

	private final DailyChallengeStore store;

	private final ProgressionService progression;

	ActivityChallenges(DailyChallengeStore store, ProgressionService progression) {
		this.store = store;
		this.progression = progression;
	}

	@EventListener
	void on(PlayerActivity activity) {
		// The day of the activity, by the server's clock in UTC: never a date from the client.
		LocalDate day = LocalDate.ofInstant(activity.occurredAt(), ZoneOffset.UTC);
		for (DailyChallenge challenge : this.store.findByDate(day)) {
			if (!activity.type().equals(challenge.activity())) {
				continue;
			}
			int progress = this.store.addProgress(activity.userId(), challenge.id(), activity.occurredAt());
			// "complete" is false when the player already had it, so it is rewarded once at most.
			if (progress >= challenge.target()
					&& this.store.complete(activity.userId(), challenge.id(), activity.occurredAt())) {
				this.progression.award(activity.userId(), DailyChallengeBonuses.bonusFor(challenge));
			}
		}
	}

}
