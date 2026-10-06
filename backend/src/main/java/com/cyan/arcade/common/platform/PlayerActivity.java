package com.cyan.arcade.common.platform;

import java.time.Instant;

/**
 * Something a signed-in player did that the platform may count, published as an application event
 * by the module where it happened. Listeners run in the publisher's transaction, so whatever they
 * award stands or falls with the activity itself.
 *
 * @param type what was done, e.g. {@link #TCG_PACK_OPENED}; stable, as it is stored with challenges
 * @param referenceId what it was done to or with, e.g. the opening's id
 */
public record PlayerActivity(Long userId, String type, String referenceId, Instant occurredAt) {

	/** A card pack was opened. */
	public static final String TCG_PACK_OPENED = "TCG_PACK_OPENED";

}
