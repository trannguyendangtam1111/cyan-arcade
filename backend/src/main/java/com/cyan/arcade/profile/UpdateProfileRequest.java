package com.cyan.arcade.profile;

import com.cyan.arcade.user.Avatar;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The parts of a profile a player can change themselves, each optional ({@code null} keeps it).
 * Nothing else can be changed through it: the username is the account's identity, and role, XP,
 * coins, statistics, achievements, inventory and scores are earned or granted, not edited. Any
 * other field in a request is ignored.
 *
 * <p>Values are tidied before they are checked: surrounding whitespace is dropped, and runs of
 * whitespace inside a display name become one space.
 *
 * @param displayName what other players see: 2 to 24 letters, digits, spaces and {@code . _ ' ! -}
 * @param bio up to 160 characters, line breaks allowed; {@code ""} removes it
 * @param avatar one of the arcade's avatars
 */
public record UpdateProfileRequest(
		@Size(min = 2, max = 24, message = "must be 2 to 24 characters long")
		@Pattern(regexp = "[\\p{L}\\p{M}\\p{N} ._'!-]*",
				message = "may only contain letters, digits, spaces and . _ ' ! -") String displayName,
		@Size(max = 160, message = "must be at most 160 characters long")
		@Pattern(regexp = "(?:[^\\p{Cc}\\p{Cf}]|\\n)*", message = "contains characters that are not allowed") String bio,
		Avatar avatar) {

	public UpdateProfileRequest {
		displayName = (displayName == null) ? null : displayName.strip().replaceAll("\\s+", " ");
		bio = (bio == null) ? null : bio.replace("\r\n", "\n").strip();
	}

}
