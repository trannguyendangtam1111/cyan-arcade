package com.cyan.arcade.economy;

import com.cyan.arcade.common.error.ConflictException;

/** Thrown when a player tries to spend more than they have. Nothing is spent. */
public class InsufficientCoinsException extends ConflictException {

	public static final String CODE = "INSUFFICIENT_COINS";

	InsufficientCoinsException(long balance, int price) {
		super(CODE, "That costs %d coins and you have %d".formatted(price, balance));
	}

}
