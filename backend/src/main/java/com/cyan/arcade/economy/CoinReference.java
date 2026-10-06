package com.cyan.arcade.economy;

/**
 * What a transaction is about, e.g. the game session it rewards. A player can have at most one
 * transaction of each type for the same reference, which is what makes rewards impossible to pay
 * twice: a second attempt finds the first and changes nothing.
 *
 * @param type what kind of thing {@code id} identifies, e.g. {@code GAME_SESSION}
 */
public record CoinReference(String type, String id) {

	public static CoinReference of(String type, Object id) {
		return new CoinReference(type, String.valueOf(id));
	}

}
