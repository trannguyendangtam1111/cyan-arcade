package com.cyan.arcade.progression;

/**
 * Extra XP a run earned from outside the progression rules.
 *
 * @param type what kind of bonus it is, e.g. {@code DAILY_CHALLENGE}
 * @param title what to call it when telling the player
 */
public record Bonus(String type, String title, int xp) {
}
