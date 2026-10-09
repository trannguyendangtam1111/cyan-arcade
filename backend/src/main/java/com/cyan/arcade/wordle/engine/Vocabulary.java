package com.cyan.arcade.wordle.engine;

/** Which words a guess may be. The game asks; the dictionary answers. */
@FunctionalInterface
public interface Vocabulary {

	/** @param word five capitals */
	boolean isAllowed(String word);

}
