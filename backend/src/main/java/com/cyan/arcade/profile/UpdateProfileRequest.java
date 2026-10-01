package com.cyan.arcade.profile;

import com.cyan.arcade.user.Avatar;
import jakarta.validation.constraints.NotNull;

/**
 * The parts of a profile a player can change themselves. XP, level and statistics are earned, not
 * edited, so they are deliberately not here.
 */
public record UpdateProfileRequest(@NotNull Avatar avatar) {
}
