package com.cyan.arcade.common.platform;

/**
 * Card packs a player has beyond the daily allowance, e.g. bought in the shop. The card game asks
 * for one when the allowance is used up; the platform keeps the count.
 */
public interface BonusPacks {

	/** None, for a platform that hands out no extra packs. */
	BonusPacks NONE = new BonusPacks() {

		@Override
		public int countOf(Long userId) {
			return 0;
		}

		@Override
		public boolean useOne(Long userId) {
			return false;
		}

	};

	/** How many extra packs the player has. */
	int countOf(Long userId);

	/**
	 * Uses one up, in the caller's transaction: if the opening fails afterwards, the pack is not lost.
	 * @return {@code false} when the player has none
	 */
	boolean useOne(Long userId);

}
