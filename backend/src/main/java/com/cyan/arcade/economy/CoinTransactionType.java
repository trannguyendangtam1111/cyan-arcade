package com.cyan.arcade.economy;

/** Why a balance changed. Stored with every transaction; the database accepts exactly these. */
public enum CoinTransactionType {

	/** Finishing a game. */
	GAME_COMPLETION,

	/** Beating one's own best score in a game. */
	HIGH_SCORE,

	/** Unlocking an achievement. */
	ACHIEVEMENT,

	/** Completing a daily challenge. */
	DAILY_CHALLENGE,

	/** Claiming the daily login reward. */
	DAILY_LOGIN,

	/** Buying something in the shop (a debit). */
	SHOP_PURCHASE,

	/** Coins given by an admin. */
	ADMIN_GRANT

}
