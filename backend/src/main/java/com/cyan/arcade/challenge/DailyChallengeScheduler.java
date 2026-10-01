package com.cyan.arcade.challenge;

import java.time.Clock;
import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the daily challenges coming: at startup and every midnight (UTC) it creates the challenges
 * for today and for tomorrow.
 *
 * <p>Tomorrow's are made a day ahead so a new day never starts without challenges, even if the
 * midnight run is late or fails once. Generating is idempotent, so running at startup as well costs
 * nothing and covers a server that was switched off at midnight. This is a plain in-process
 * schedule: with several instances each would run it, which is harmless for the same reason.
 */
@Component
@ConditionalOnProperty(name = "app.daily-challenges.generation-enabled", matchIfMissing = true)
class DailyChallengeScheduler {

	private static final Logger log = LoggerFactory.getLogger(DailyChallengeScheduler.class);

	private final DailyChallengeGenerator generator;

	private final Clock clock;

	DailyChallengeScheduler(DailyChallengeGenerator generator, Clock clock) {
		this.generator = generator;
		this.clock = clock;
	}

	@EventListener(ApplicationReadyEvent.class)
	void onStartup() {
		generateUpcoming();
	}

	@Scheduled(cron = "0 0 0 * * *", zone = "UTC")
	void atMidnight() {
		generateUpcoming();
	}

	void generateUpcoming() {
		LocalDate today = LocalDate.now(this.clock);
		int created = this.generator.generateFor(today) + this.generator.generateFor(today.plusDays(1));
		if (created > 0) {
			log.info("Created {} daily challenges for {} and {}", created, today, today.plusDays(1));
		}
	}

}
