package com.cyan.arcade.game;

/**
 * A catalog entry as exposed by the API.
 *
 * @param thumbnailUrl path or URL of the card artwork, resolved by the frontend
 * @param accentColor the game's identity color as {@code #rrggbb}
 * @param featured whether the hub puts this game in the spotlight
 */
public record GameResponse(Long id, String slug, String name, String description, GameCategory category,
		String thumbnailUrl, String accentColor, boolean featured) {

	static GameResponse from(Game game) {
		return new GameResponse(game.getId(), game.getSlug(), game.getName(), game.getDescription(),
				game.getCategory(), game.getThumbnailUrl(), game.getAccentColor(), game.isFeatured());
	}

}
