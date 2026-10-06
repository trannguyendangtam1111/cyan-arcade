package com.cyan.arcade.progression;

import com.cyan.arcade.economy.CoinReference;
import com.cyan.arcade.economy.CoinTransactionType;
import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * A reward from outside the progression rules, such as a completed daily challenge. Paid by
 * {@link ProgressionService} like every other reward.
 *
 * @param type what kind of bonus it is, which is also the type of its coin transaction
 * @param title what to call it when telling the player
 * @param reference what is rewarded, so it can never be paid twice
 */
public record Bonus(CoinTransactionType type, String title, int xp, int coins, @JsonIgnore CoinReference reference) {
}
