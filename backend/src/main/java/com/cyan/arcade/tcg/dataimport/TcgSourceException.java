package com.cyan.arcade.tcg.dataimport;

/** A card game's source could not be read, or what it sent cannot be turned into a dataset. */
public class TcgSourceException extends RuntimeException {

	public TcgSourceException(String message) {
		super(message);
	}

	public TcgSourceException(String message, Throwable cause) {
		super(message, cause);
	}

}
