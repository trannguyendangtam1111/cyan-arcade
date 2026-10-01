package com.cyan.arcade.score;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Housekeeping for runs that were started and never finished: a closed tab, a lost connection, or
 * someone calling the public "start" endpoint for no reason. Without it those rows would pile up
 * forever. A run that is still unfinished after a day has no score to lose.
 */
@Component
@EnableConfigurationProperties(AbandonedSessionCleaner.SessionProperties.class)
class AbandonedSessionCleaner {

	private static final Logger log = LoggerFactory.getLogger(AbandonedSessionCleaner.class);

	/** @param abandonedAfter how long a run may stay unfinished before it is removed */
	@ConfigurationProperties("app.game-sessions")
	record SessionProperties(@DefaultValue("24h") Duration abandonedAfter) {
	}

	private final GameSessionService sessions;

	private final SessionProperties properties;

	AbandonedSessionCleaner(GameSessionService sessions, SessionProperties properties) {
		this.sessions = sessions;
		this.properties = properties;
	}

	@Scheduled(initialDelayString = "PT10M", fixedDelayString = "PT1H")
	void removeAbandoned() {
		int removed = this.sessions.removeUnfinishedOlderThan(this.properties.abandonedAfter());
		if (removed > 0) {
			log.info("Removed {} game sessions left unfinished for more than {}", removed,
					this.properties.abandonedAfter());
		}
	}

}
