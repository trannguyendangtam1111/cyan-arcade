package com.cyan.arcade.tcg.pack;

import java.util.List;

import com.cyan.arcade.tcg.game.GameRef;
import com.cyan.arcade.tcg.game.Rarity;
import com.cyan.arcade.tcg.set.SetRef;

/**
 * A pack that can be opened, with its odds in the open.
 *
 * @param imageUrl the pack's own artwork, or {@code null} (see {@link PackRef})
 * @param cardsPerPack how many cards one opening gives
 * @param poolSize how many different cards can come out of it
 * @param slots what each card of the pack can turn out to be, in the order the cards come out
 * @param oddsNote where the odds come from, e.g. that they are a simulator's, or {@code null}
 */
public record PackResponse(Long id, String code, String name, String description, String imageUrl,
		String setLogoUrl, String coverImageUrl, String accentColor, SetRef set, GameRef game, int cardsPerPack,
		int poolSize, List<SlotOdds> slots, String oddsNote) {

	/** @param slot the position of the card in the pack, from 1 */
	public record SlotOdds(int slot, List<Chance> odds) {
	}

	/** @param percent the chance that the slot is of this rarity, 0 to 100 */
	public record Chance(Rarity rarity, double percent) {
	}

}
