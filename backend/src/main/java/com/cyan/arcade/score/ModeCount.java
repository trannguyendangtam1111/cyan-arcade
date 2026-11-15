package com.cyan.arcade.score;

/** How many runs a player has finished in one mode of one game. */
record ModeCount(Long gameId, String mode, long runs) {
}
